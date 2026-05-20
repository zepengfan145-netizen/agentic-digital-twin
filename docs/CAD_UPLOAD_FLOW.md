# CAD 功能链路讲解

这份文档用四条业务链路来解释当前 CAD 功能是怎么工作的：

```text
链路 1：页面加载 CAD 列表
链路 2：用户上传 DWG 文件
链路 3：用户点击 Viewer 打开图纸
链路 4：本地和线上环境变量切换
```

每条链路都回答同一组问题：

```text
前端哪一行开始？
请求发到哪个 API？
后端哪个路由接住？
数据从哪里来 / 写到哪里？
后端返回什么给前端？
前端拿返回结果做什么？
```

## 系统地图

现在完整线上版有四个主要服务：

```text
前端：Vercel
后端 API：Render
数据库：Neon Postgres
文件存储：Vercel Blob
```

它们的职责不同：

| 服务 / 文件 | 职责 |
|---|---|
| Vercel 前端 | 显示页面、上传表单、CAD 列表、Viewer 按钮 |
| Render 后端 API | 接收上传请求，操作数据库和文件存储 |
| Neon Postgres | 保存 CAD 文件记录 |
| Vercel Blob | 保存真正的 DWG 文件 |
| `src/main.js` | 首页前端逻辑 |
| `server/index.js` | Express 后端 API |
| `server/schema.sql` | 数据库表结构 |
| `src/cadViewerApp.js` | CAD Viewer 页面逻辑 |
| `cad-viewer.html` | CAD Viewer 的 HTML 页面 |
| `.env.example` | 环境变量模板 |

最重要的一句话：

```text
数据库不保存 DWG 文件本体。
数据库只保存 DWG 文件的 URL。
```

## 链路 1：页面加载 CAD 列表

这条链路发生在首页打开时。

目标是：

```text
在 CAD Assets 面板里显示已有的 CAD 文件。
```

### 1. 前端哪一行开始？

在 `src/main.js` 文件底部：

```js
render();
loadCadAssets();
window.addEventListener('beforeunload', () => scene.dispose());
```

关键是这一行：

```js
loadCadAssets();
```

它会在页面加载时自动执行。

### 2. 请求发到哪个 API？

在 `loadCadAssets` 里面：

```js
const assets = await fetch(`${API_BASE}/api/cad-assets`).then(response => {
  if (!response.ok) throw new Error(`API returned ${response.status}`);
  return response.json();
});
```

所以前端请求的是：

```text
GET /api/cad-assets
```

本地完整地址：

```text
http://127.0.0.1:3001/api/cad-assets
```

线上完整地址：

```text
https://agentic-digital-twin.onrender.com/api/cad-assets
```

到底用本地还是线上，由这行决定：

```js
const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:3001';
```

意思是：

```text
如果 VITE_API_BASE 存在，就用它。
如果不存在，就默认用本地后端。
```

### 3. 后端哪个路由接住？

在 `server/index.js`：

```js
app.get('/api/cad-assets', async (_req, res) => {
  const rows = await store.listCadAssets();
  res.json(rows.map(rowToCadAsset));
});
```

这个路由接住：

```text
GET /api/cad-assets
```

### 4. 数据从哪里来？

这行代码读取 CAD 记录：

```js
const rows = await store.listCadAssets();
```

这里的 `store` 可能是两种：

```text
如果有 DATABASE_URL：
  store 是 Postgres store，也就是 Neon Postgres

如果没有 DATABASE_URL：
  store 是 SQLite store，也就是本地 SQLite
```

线上生产环境会用 Neon Postgres：

```js
async listCadAssets() {
  return sql`SELECT * FROM cad_assets ORDER BY created_at DESC`;
}
```

所以线上数据来自：

```text
Neon Postgres 数据库里的 cad_assets 表
```

### 5. 后端返回什么给前端？

后端返回 JSON：

```js
res.json(rows.map(rowToCadAsset));
```

这里有一个转换函数：

```js
rowToCadAsset
```

它的作用是把数据库字段名转换成前端更好用的字段名。

数据库字段是下划线风格：

```js
{
  original_filename: "x11.dwg",
  original_file_path: "https://...blob.vercel-storage.com/cad/x11.dwg"
}
```

前端拿到的是驼峰风格：

```js
{
  originalFilename: "x11.dwg",
  originalFilePath: "https://...blob.vercel-storage.com/cad/x11.dwg"
}
```

返回结果大概长这样：

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

### 6. 前端拿返回结果做什么？

前端会遍历 `assets`：

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

它做了两件事：

```text
1. 把 CAD 记录显示成页面列表
2. 如果文件是 DWG/DXF，就生成 Viewer 按钮
```

### 链路 1 总结

```text
前端开始：
  loadCadAssets()

前端请求：
  GET `${API_BASE}/api/cad-assets`

后端接住：
  app.get('/api/cad-assets')

数据来源：
  Neon Postgres 的 cad_assets 表

后端返回：
  CAD asset JSON 数组

前端处理：
  渲染 CAD 列表和 Viewer 按钮
```

## 链路 2：用户上传 DWG 文件

这条链路发生在用户选择 DWG 文件并点击 Upload 时。

目标是：

```text
把 DWG 文件存到 Vercel Blob，
再把文件记录写进 Neon Postgres。
```

### 1. 前端哪一行开始？

在 `src/main.js`：

```js
assetUploadForm.addEventListener('submit', async (event) => {
```

这表示：

```text
监听上传表单的 submit 事件。
用户点 Upload 时，这段代码会执行。
```

### 2. 前端发送了什么？

在 submit 处理函数里：

```js
const body = new FormData(assetUploadForm);
const response = await fetch(`${API_BASE}/api/cad-assets`, {
  method: 'POST',
  body
});
```

`FormData` 会把用户选择的文件打包成上传请求。

前端发送：

```text
POST /api/cad-assets
```

请求体里带着 DWG 文件。

### 3. 后端哪个路由接住？

在 `server/index.js`：

```js
app.post('/api/cad-assets', upload.single('file'), async (req, res) => {
```

这个路由接住上传请求。

其中：

```js
upload.single('file')
```

意思是：

```text
从上传表单里读取一个字段名叫 file 的文件。
```

读取完成后，文件会出现在：

```js
req.file
```

你可以把 `req.file` 理解成：

```js
{
  originalname: "x11.dwg",
  mimetype: "application/octet-stream",
  buffer: "<文件二进制内容>"
}
```

### 4. 文件写到哪里？

关键代码：

```js
const originalFilePath = await storeUploadedFile(req.file);
```

这句的意思是：

```text
把上传来的文件存起来，
然后返回这个文件以后可以访问的地址。
```

`storeUploadedFile` 的核心代码：

```js
const blob = await put(`cad/${createStoredFilename(file.originalname)}`, file.buffer, {
  access: 'public',
  contentType: file.mimetype || 'application/octet-stream',
  token: blobToken
});
return blob.url;
```

线上环境下，它会把 DWG 上传到：

```text
Vercel Blob
```

Vercel Blob 上传成功后返回一个公开 URL：

```text
https://xxxxx.public.blob.vercel-storage.com/cad/example.dwg
```

这个 URL 会被保存到变量：

```js
originalFilePath
```

所以：

```text
originalFilePath = DWG 文件在 Vercel Blob 里的公开 URL
```

### 5. 数据库记录写到哪里？

文件上传到 Blob 后，后端创建数据库记录：

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

这一步不是上传文件。

这一步是：

```text
把文件信息写入 Neon Postgres 的 cad_assets 表。
```

写进去的数据大概是：

```js
{
  id: "4e8bc93a-358c-4a5e-aab2-352e02a717e9",
  name: "X11",
  originalFilename: "x11.dwg",
  originalFormat: "dwg",
  originalFilePath: "https://xxxxx.public.blob.vercel-storage.com/cad/x11.dwg",
  convertedFormat: null,
  convertedFilePath: null,
  status: "uploaded"
}
```

Postgres 插入代码：

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

关键点：

```sql
INSERT INTO cad_assets
```

表示往 `cad_assets` 表插入一条记录。

```sql
RETURNING *
```

表示插入成功后，把刚插入的完整记录返回。

### 6. 后端返回什么给前端？

后端返回新创建的 CAD 记录：

```js
res.status(201).json(rowToCadAsset(asset));
```

返回大概是：

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

### 7. 前端拿返回结果做什么？

前端读取返回结果：

```js
const asset = await response.json();
assetUploadForm.reset();
await loadCadAssets();
```

它做三件事：

```text
1. 拿到刚创建的 asset
2. 清空上传表单
3. 重新调用 loadCadAssets()，刷新 CAD 列表
```

所以上传成功后，页面会出现新上传的 CAD 文件。

### 链路 2 总结

```text
前端开始：
  assetUploadForm submit handler

前端请求：
  POST `${API_BASE}/api/cad-assets`
  请求体是 FormData 文件

后端接住：
  app.post('/api/cad-assets', upload.single('file'))

文件写到：
  Vercel Blob

数据库记录写到：
  Neon Postgres 的 cad_assets 表

后端返回：
  新创建的 CAD asset JSON

前端处理：
  清空表单并重新加载 CAD 列表
```

## 链路 3：用户点击 Viewer 打开图纸

这条链路发生在 CAD 列表里已经有 DWG/DXF 文件，用户点击 Viewer 时。

目标是：

```text
打开 cad-viewer.html，
并把 DWG 文件 URL 通过地址栏传给 Viewer 页面。
```

### 1. Viewer 按钮从哪里来？

在链路 1 里，前端渲染 CAD 列表。

如果文件是 DWG/DXF：

```js
const canOpenCadViewer = ['dwg', 'dxf'].includes(asset.originalFormat);
```

就生成：

```js
`<a class="asset-button" href="${escapeHtml(cadViewerUrl(asset))}" target="_blank" rel="noopener">Viewer</a>`
```

这会变成页面上的 `Viewer` 按钮。

严格来说，它是一个 HTML 链接：

```html
<a href="...">Viewer</a>
```

### 2. Viewer 链接里的 URL 从哪里来？

来自这个函数：

```js
function cadViewerUrl(asset) {
  const params = new URLSearchParams({
    url: originalAssetUrl(asset),
    name: asset.name
  });
  return `/cad-viewer.html?${params.toString()}`;
}
```

最关键的数据是：

```js
asset.originalFilePath
```

它来自 Neon 数据库。

而数据库里的这个值，最早来自 Vercel Blob 返回的：

```js
blob.url
```

完整来源是：

```text
Vercel Blob 返回 blob.url
  -> 后端保存为 originalFilePath
  -> Neon 保存为 original_file_path
  -> 前端拿到 asset.originalFilePath
  -> cadViewerUrl(asset) 把它放进 url 参数
```

### 3. `originalAssetUrl(asset)` 做什么？

```js
function originalAssetUrl(asset) {
  if (!asset.originalFilePath) return null;
  if (/^https?:\/\//.test(asset.originalFilePath)) return asset.originalFilePath;
  return `${API_BASE}${asset.originalFilePath}`;
}
```

如果 `asset.originalFilePath` 已经是完整 URL：

```text
https://xxxxx.public.blob.vercel-storage.com/cad/example.dwg
```

它就直接返回这个 URL。

如果是本地相对路径：

```text
/uploads/cad/example.dwg
```

它会拼上 `API_BASE`。

### 4. 浏览器实际打开什么？

最终生成的 Viewer 链接大概是：

```text
/cad-viewer.html?url=https%3A%2F%2Fxxxxx.public.blob.vercel-storage.com%2Fcad%2Fexample.dwg&name=X11
```

用户点击 Viewer 后，浏览器打开：

```text
cad-viewer.html
```

同时地址栏里带着：

```text
url=<Blob DWG URL>
name=<asset name>
```

### 5. 哪个文件运行？

浏览器加载 `cad-viewer.html`。

这个 HTML 里加载：

```html
<script type="module" src="/src/cadViewerApp.js"></script>
```

所以真正运行的是：

```text
src/cadViewerApp.js
```

### 6. Viewer 页面怎么读取 DWG URL？

在 `src/cadViewerApp.js`：

```js
const params = new URLSearchParams(window.location.search);
const cadUrlParam = params.get('url') || undefined;
const cadUrl = cadUrlParam ? new URL(cadUrlParam, window.location.origin).href : undefined;
const cadName = params.get('name') || 'CAD Viewer';
```

这几行做的是：

```text
读取当前地址栏里 ? 后面的参数。
拿到 url 参数。
把它变成完整 URL。
```

### 7. mlightcad 怎么拿到 DWG URL？

仍然在 `src/cadViewerApp.js`：

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

关键是：

```js
url: cadUrl
```

这就是把 DWG 文件 URL 交给 `MlCadViewer`。

然后：

```js
app.mount('#cad-viewer-app');
```

把 Viewer 挂载到：

```html
<main id="cad-viewer-app" class="cad-viewer-app"></main>
```

### 链路 3 总结

```text
前端开始：
  CAD 列表渲染时生成 Viewer 链接

Viewer URL 来源：
  asset.originalFilePath

浏览器打开：
  /cad-viewer.html?url=<Blob URL>&name=<asset name>

Viewer 页面读取：
  params.get('url')

Viewer 组件接收：
  MlCadViewer({ url: cadUrl })

最终结果：
  DWG 在浏览器里打开
```

## 链路 4：本地和线上环境变量切换

这条链路解释为什么同一套代码，本地和线上能连接不同服务。

目标是：

```text
本地开发时用本地服务。
线上部署时用云服务。
```

### 1. 前端 API 地址怎么切换？

在 `src/main.js`：

```js
const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:3001';
```

意思是：

```text
如果 VITE_API_BASE 存在：
  用 VITE_API_BASE

如果不存在：
  用 http://127.0.0.1:3001
```

本地：

```env
VITE_API_BASE=http://127.0.0.1:3001
```

线上 Vercel：

```env
VITE_API_BASE=https://agentic-digital-twin.onrender.com
```

注意：

```text
Vite 前端能读取的环境变量必须以 VITE_ 开头。
```

所以前端变量叫：

```text
VITE_API_BASE
```

### 2. 后端数据库怎么切换？

在 `server/index.js`：

```js
const databaseUrl = process.env.DATABASE_URL;
```

然后：

```js
const store = databaseUrl ? await createPostgresStore(databaseUrl) : createSqliteStore();
```

意思是：

```text
如果 DATABASE_URL 存在：
  用 Neon Postgres

如果 DATABASE_URL 不存在：
  用本地 SQLite
```

本地兜底 SQLite 的好处是：

```text
即使没有云数据库，也可以开发和测试。
```

线上 Render 里配置了：

```env
DATABASE_URL=postgresql://...
```

所以线上用 Neon。

### 3. 后端文件存储怎么切换？

在 `server/index.js`：

```js
const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
const hasBlobToken = Boolean(blobToken);
```

然后：

```js
const upload = multer({
  storage: hasBlobToken ? multer.memoryStorage() : multer.diskStorage(...)
});
```

意思是：

```text
如果 BLOB_READ_WRITE_TOKEN 存在：
  上传文件先放内存，再上传到 Vercel Blob

如果 BLOB_READ_WRITE_TOKEN 不存在：
  上传文件保存到本地磁盘
```

另外还有一个检查：

```js
const hasValidBlobTokenShape = blobToken?.startsWith('vercel_blob_rw_') ?? false;
```

这是为了避免把 Blob URL 错当成 token。

正确 token 形状应该类似：

```text
vercel_blob_rw_...
```

### 4. 怎么确认当前环境用的是谁？

后端有健康检查接口：

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

打开：

```text
https://agentic-digital-twin.onrender.com/api/health
```

线上正确结果应该类似：

```json
{
  "ok": true,
  "database": "postgres",
  "storage": "blob",
  "blobToken": "valid-shape"
}
```

这说明：

```text
Render 收到了 DATABASE_URL
Render 收到了 BLOB_READ_WRITE_TOKEN
Blob token 格式正确
```

### 链路 4 总结

```text
前端 API 切换：
  VITE_API_BASE

后端数据库切换：
  DATABASE_URL

后端文件存储切换：
  BLOB_READ_WRITE_TOKEN

调试入口：
  GET /api/health
```

## 最终心智模型

你可以把整个 CAD 功能记成这样：

```text
页面加载：
  loadCadAssets()
  -> GET /api/cad-assets
  -> Neon records
  -> 渲染 CAD 列表

上传：
  表单 submit
  -> POST /api/cad-assets
  -> req.file
  -> Vercel Blob
  -> Neon cad_assets
  -> 刷新 CAD 列表

打开 Viewer：
  asset.originalFilePath
  -> cadViewerUrl(asset)
  -> /cad-viewer.html?url=<DWG URL>
  -> cadViewerApp.js
  -> MlCadViewer({ url: cadUrl })

环境切换：
  本地使用 127.0.0.1、SQLite、本地 uploads
  线上使用 Render、Neon、Vercel Blob
```

