# CAD Feature Flow Guide

This document explains the CAD feature through four business flows:

```text
Flow 1: Page loads the CAD asset list
Flow 2: User uploads a DWG file
Flow 3: User clicks Viewer to open a drawing
Flow 4: Local and production environment variables switch behavior
```

For every flow, we answer the same questions:

```text
Where does the frontend start?
Which API does it call?
Which backend route receives it?
Where does data go?
What does the backend return?
What does the frontend do with the result?
```

## System Map

The deployed system uses four services:

```text
Frontend: Vercel
Backend API: Render
Database: Neon Postgres
File storage: Vercel Blob
```

The main code files are:

| File | Responsibility |
|---|---|
| `src/main.js` | Main frontend page logic |
| `server/index.js` | Express backend API |
| `server/schema.sql` | Database table definitions |
| `src/cadViewerApp.js` | CAD Viewer page logic |
| `cad-viewer.html` | HTML shell for CAD Viewer |
| `.env.example` | Template for environment variables |

## Flow 1: Page Loads The CAD Asset List

This flow happens when the main page opens.

The goal is:

```text
Show existing CAD files in the CAD Assets panel.
```

### 1. Where does the frontend start?

At the bottom of `src/main.js`:

```js
render();
loadCadAssets();
window.addEventListener('beforeunload', () => scene.dispose());
```

The important line is:

```js
loadCadAssets();
```

This runs automatically when the page loads.

### 2. Which API does it call?

Inside `loadCadAssets`:

```js
const assets = await fetch(`${API_BASE}/api/cad-assets`).then(response => {
  if (!response.ok) throw new Error(`API returned ${response.status}`);
  return response.json();
});
```

So the frontend calls:

```text
GET /api/cad-assets
```

Full local URL:

```text
http://127.0.0.1:3001/api/cad-assets
```

Full production URL:

```text
https://agentic-digital-twin.onrender.com/api/cad-assets
```

Which one it uses depends on:

```js
const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:3001';
```

### 3. Which backend route receives it?

In `server/index.js`:

```js
app.get('/api/cad-assets', async (_req, res) => {
  const rows = await store.listCadAssets();
  res.json(rows.map(rowToCadAsset));
});
```

This route receives:

```text
GET /api/cad-assets
```

### 4. Where does data come from?

This line reads CAD records:

```js
const rows = await store.listCadAssets();
```

The `store` can be either:

```text
Postgres store, if DATABASE_URL exists
SQLite store, if DATABASE_URL does not exist
```

In production, it uses Neon Postgres:

```js
async listCadAssets() {
  return sql`SELECT * FROM cad_assets ORDER BY created_at DESC`;
}
```

So data comes from the `cad_assets` table in Neon.

### 5. What does the backend return?

The backend returns JSON:

```js
res.json(rows.map(rowToCadAsset));
```

`rowToCadAsset` converts database column names into frontend-friendly names.

Database row:

```js
{
  original_filename: "x11.dwg",
  original_file_path: "https://...blob.vercel-storage.com/cad/x11.dwg"
}
```

Frontend object:

```js
{
  originalFilename: "x11.dwg",
  originalFilePath: "https://...blob.vercel-storage.com/cad/x11.dwg"
}
```

Example response:

```json
[
  {
    "id": "4e8bc93a-358c-4a5e-aab2-352e02a717e9",
    "name": "X11 Public Blob Final",
    "originalFilename": "x11.dwg",
    "originalFormat": "dwg",
    "originalFilePath": "https://xxxxx.public.blob.vercel-storage.com/cad/example.dwg",
    "convertedFormat": null,
    "convertedFilePath": null,
    "status": "uploaded"
  }
]
```

### 6. What does the frontend do with the result?

The frontend loops over `assets`:

```js
cadAssetPanel.innerHTML = assets.map(asset => {
  const canLoad = Boolean(asset.convertedFilePath && ['glb', 'gltf', 'stl'].includes(asset.convertedFormat));
  const canOpenCadViewer = ['dwg', 'dxf'].includes(asset.originalFormat);
  return `
    <li>
      <span>
        <strong>${escapeHtml(asset.name)}</strong>
        <small>${escapeHtml(asset.originalFormat.toUpperCase())} · ${escapeHtml(asset.status)}</small>
      </span>
      <span class="asset-actions">
        ${canOpenCadViewer ? `<a class="asset-button" href="${escapeHtml(cadViewerUrl(asset))}" target="_blank" rel="noopener">Viewer</a>` : ''}
        ${canLoad ? `<button type="button" data-load-model="${asset.id}">Load</button>` : '<small>needs GLB/STL</small>'}
      </span>
    </li>
  `;
}).join('');
```

This creates visible CAD rows in the UI.

For DWG/DXF files, it creates a `Viewer` link.

### Flow 1 Summary

```text
Frontend starts:
  loadCadAssets()

Frontend calls:
  GET `${API_BASE}/api/cad-assets`

Backend receives:
  app.get('/api/cad-assets')

Data comes from:
  Neon Postgres cad_assets table

Backend returns:
  JSON array of CAD asset objects

Frontend does:
  renders CAD list and Viewer buttons
```

## Flow 2: User Uploads A DWG File

This flow happens when the user selects a DWG file and clicks Upload.

The goal is:

```text
Store the DWG file in Vercel Blob and store its metadata in Neon Postgres.
```

### 1. Where does the frontend start?

In `src/main.js`:

```js
assetUploadForm.addEventListener('submit', async (event) => {
```

This listens for the upload form submit event.

### 2. What does the frontend send?

Inside the submit handler:

```js
const body = new FormData(assetUploadForm);
const response = await fetch(`${API_BASE}/api/cad-assets`, {
  method: 'POST',
  body
});
```

`FormData` contains the selected file.

The frontend sends:

```text
POST /api/cad-assets
```

### 3. Which backend route receives it?

In `server/index.js`:

```js
app.post('/api/cad-assets', upload.single('file'), async (req, res) => {
```

This receives the uploaded file.

`upload.single('file')` tells `multer`:

```text
Read one uploaded file from the form field named "file".
```

After `multer` runs, the file is available as:

```js
req.file
```

### 4. Where does the file go?

The uploaded file goes through:

```js
const originalFilePath = await storeUploadedFile(req.file);
```

This is the key file-storage line.

`storeUploadedFile` does this:

```js
const blob = await put(`cad/${createStoredFilename(file.originalname)}`, file.buffer, {
  access: 'public',
  contentType: file.mimetype || 'application/octet-stream',
  token: blobToken
});
return blob.url;
```

In production, this uploads the file to Vercel Blob.

Vercel Blob returns a public URL:

```text
https://xxxxx.public.blob.vercel-storage.com/cad/example.dwg
```

That URL becomes:

```js
originalFilePath
```

### 5. Where does database data go?

After the file is stored, the backend creates a database record:

```js
const asset = await store.createCadAsset({
  id,
  name,
  originalFilename,
  originalFormat: originalExt || 'unknown',
  originalFilePath,
  convertedFormat,
  convertedFilePath,
  status
});
```

This writes metadata into the `cad_assets` table.

The important field is:

```js
originalFilePath
```

That field stores the Vercel Blob URL.

The Postgres insert is:

```js
const rows = await sql`
  INSERT INTO cad_assets (
    id, name, original_filename, original_format, original_file_path,
    converted_format, converted_file_path, status, updated_at
  )
  VALUES (
    ${asset.id}, ${asset.name}, ${asset.originalFilename}, ${asset.originalFormat}, ${asset.originalFilePath},
    ${asset.convertedFormat}, ${asset.convertedFilePath}, ${asset.status}, CURRENT_TIMESTAMP
  )
  RETURNING *
`;
return rows[0];
```

### 6. What does the backend return?

After inserting into the database:

```js
res.status(201).json(rowToCadAsset(asset));
```

The backend returns the newly created asset record.

Example:

```json
{
  "id": "4e8bc93a-358c-4a5e-aab2-352e02a717e9",
  "name": "X11",
  "originalFilename": "x11.dwg",
  "originalFormat": "dwg",
  "originalFilePath": "https://xxxxx.public.blob.vercel-storage.com/cad/x11.dwg",
  "convertedFormat": null,
  "convertedFilePath": null,
  "status": "uploaded"
}
```

### 7. What does the frontend do with the result?

The frontend reads the returned asset:

```js
const asset = await response.json();
assetUploadForm.reset();
await loadCadAssets();
```

Then it calls:

```js
await loadCadAssets();
```

This refreshes the CAD list, so the newly uploaded DWG appears on the page.

### Flow 2 Summary

```text
Frontend starts:
  assetUploadForm submit handler

Frontend sends:
  POST `${API_BASE}/api/cad-assets`
  with FormData file

Backend receives:
  app.post('/api/cad-assets', upload.single('file'))

File goes to:
  Vercel Blob

Database record goes to:
  Neon Postgres cad_assets table

Backend returns:
  newly created CAD asset JSON

Frontend does:
  resets form and reloads CAD list
```

## Flow 3: User Clicks Viewer To Open A Drawing

This flow happens when the CAD list already contains a DWG/DXF file and the user clicks Viewer.

The goal is:

```text
Open cad-viewer.html with the DWG file URL in the address bar.
```

### 1. Where does the Viewer link come from?

During Flow 1, the frontend renders every CAD asset.

For DWG/DXF files:

```js
const canOpenCadViewer = ['dwg', 'dxf'].includes(asset.originalFormat);
```

If true, it creates:

```js
`<a class="asset-button" href="${escapeHtml(cadViewerUrl(asset))}" target="_blank" rel="noopener">Viewer</a>`
```

This becomes an HTML link.

### 2. Where does the URL inside the Viewer link come from?

It comes from this function:

```js
function cadViewerUrl(asset) {
  const params = new URLSearchParams({
    url: originalAssetUrl(asset),
    name: asset.name
  });
  return `/cad-viewer.html?${params.toString()}`;
}
```

The key field is:

```js
asset.originalFilePath
```

That came from Neon, and originally it came from Vercel Blob's `blob.url`.

### 3. What does `originalAssetUrl(asset)` do?

```js
function originalAssetUrl(asset) {
  if (!asset.originalFilePath) return null;
  if (/^https?:\/\//.test(asset.originalFilePath)) return asset.originalFilePath;
  return `${API_BASE}${asset.originalFilePath}`;
}
```

If `asset.originalFilePath` is already a full URL:

```text
https://xxxxx.public.blob.vercel-storage.com/cad/example.dwg
```

it returns it directly.

If it is a local relative path:

```text
/uploads/cad/example.dwg
```

it adds `API_BASE`.

### 4. What URL does the browser open?

The generated Viewer link looks like:

```text
/cad-viewer.html?url=https%3A%2F%2Fxxxxx.public.blob.vercel-storage.com%2Fcad%2Fexample.dwg&name=X11
```

When the user clicks Viewer, the browser opens:

```text
cad-viewer.html
```

and passes:

```text
url=<Blob DWG URL>
name=<asset name>
```

as query parameters.

### 5. Which file runs after Viewer opens?

The browser loads `cad-viewer.html`.

That HTML file loads:

```html
<script type="module" src="/src/cadViewerApp.js"></script>
```

So `src/cadViewerApp.js` runs.

### 6. How does the Viewer page read the DWG URL?

In `src/cadViewerApp.js`:

```js
const params = new URLSearchParams(window.location.search);
const cadUrlParam = params.get('url') || undefined;
const cadUrl = cadUrlParam ? new URL(cadUrlParam, window.location.origin).href : undefined;
const cadName = params.get('name') || 'CAD Viewer';
```

This reads:

```text
url
```

from the address bar.

### 7. How does mlightcad receive the DWG URL?

Still in `src/cadViewerApp.js`:

```js
const app = createApp(MlCadViewer, {
  url: cadUrl,
  locale: 'en',
  theme: 'light',
  mode: AcEdOpenMode.Read,
  background: 0xf7faf8,
  useMainThreadDraw: false
});
```

The key line is:

```js
url: cadUrl
```

This gives the DWG URL to `MlCadViewer`.

Then:

```js
app.mount('#cad-viewer-app');
```

mounts the viewer UI into:

```html
<main id="cad-viewer-app" class="cad-viewer-app"></main>
```

### Flow 3 Summary

```text
Frontend starts:
  CAD list render creates Viewer link

Viewer URL comes from:
  asset.originalFilePath

Browser opens:
  /cad-viewer.html?url=<Blob URL>&name=<asset name>

Viewer page reads:
  params.get('url')

Viewer component receives:
  MlCadViewer({ url: cadUrl })

Result:
  DWG opens in browser
```

## Flow 4: Local And Production Environment Variable Switching

This flow explains how the same code runs locally and online.

The goal is:

```text
Use local services during development,
and cloud services in production.
```

### 1. Frontend API switching

In `src/main.js`:

```js
const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:3001';
```

This means:

```text
If VITE_API_BASE exists, use it.
Otherwise use local API at http://127.0.0.1:3001.
```

Local:

```env
VITE_API_BASE=http://127.0.0.1:3001
```

Production Vercel:

```env
VITE_API_BASE=https://agentic-digital-twin.onrender.com
```

Important:

```text
Vite frontend variables must start with VITE_.
```

That is why the frontend variable is named:

```text
VITE_API_BASE
```

### 2. Backend database switching

In `server/index.js`:

```js
const databaseUrl = process.env.DATABASE_URL;
```

Then:

```js
const store = databaseUrl ? await createPostgresStore(databaseUrl) : createSqliteStore();
```

This means:

```text
If DATABASE_URL exists:
  use Neon Postgres

If DATABASE_URL does not exist:
  use local SQLite
```

Local fallback is useful because you can run the backend without cloud setup.

Production Render uses:

```env
DATABASE_URL=postgresql://...
```

so it connects to Neon.

### 3. Backend file-storage switching

In `server/index.js`:

```js
const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
const hasBlobToken = Boolean(blobToken);
```

Then:

```js
const upload = multer({
  storage: hasBlobToken ? multer.memoryStorage() : multer.diskStorage(...)
});
```

This means:

```text
If BLOB_READ_WRITE_TOKEN exists:
  keep uploaded file in memory, then upload to Vercel Blob

If BLOB_READ_WRITE_TOKEN does not exist:
  save uploaded file to local disk
```

The storage function also checks token shape:

```js
const hasValidBlobTokenShape = blobToken?.startsWith('vercel_blob_rw_') ?? false;
```

This helps catch the common mistake of using a Blob URL instead of the read/write token.

### 4. Health check confirms environment behavior

The backend exposes:

```js
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    database: store.kind,
    location: store.location,
    storage: hasBlobToken ? 'blob' : 'local',
    blobToken: hasBlobToken ? (hasValidBlobTokenShape ? 'valid-shape' : 'invalid-shape') : 'missing'
  });
});
```

Expected production result:

```json
{
  "ok": true,
  "database": "postgres",
  "storage": "blob",
  "blobToken": "valid-shape"
}
```

This tells you:

```text
Render has DATABASE_URL.
Render has BLOB_READ_WRITE_TOKEN.
The Blob token looks correct.
```

### Flow 4 Summary

```text
Frontend switch:
  VITE_API_BASE

Backend database switch:
  DATABASE_URL

Backend file-storage switch:
  BLOB_READ_WRITE_TOKEN

Debug endpoint:
  GET /api/health
```

## Final Mental Model

The whole CAD feature is this chain:

```text
Page loads:
  loadCadAssets()
  -> GET /api/cad-assets
  -> Neon records
  -> render CAD list

Upload:
  form submit
  -> POST /api/cad-assets
  -> req.file
  -> Vercel Blob
  -> Neon cad_assets
  -> refresh CAD list

Viewer:
  asset.originalFilePath
  -> cadViewerUrl(asset)
  -> /cad-viewer.html?url=<DWG URL>
  -> cadViewerApp.js
  -> MlCadViewer({ url: cadUrl })

Environment:
  local fallback uses 127.0.0.1, SQLite, local uploads
  production uses Render, Neon, Vercel Blob
```

