import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import 'dotenv/config';
import multer from 'multer';
import postgres from 'postgres';
import { put } from '@vercel/blob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const dataDir = path.join(__dirname, 'data');
const uploadDir = path.join(__dirname, 'uploads');
const cadDir = path.join(uploadDir, 'cad');
const modelDir = path.join(uploadDir, 'models');
const dbPath = path.join(dataDir, 'digital_twin.db');
const port = Number(process.env.PORT || 3001);
const databaseUrl = process.env.DATABASE_URL;
const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
const hasBlobToken = Boolean(blobToken);
const hasValidBlobTokenShape = blobToken?.startsWith('vercel_blob_rw_') ?? false;

for (const dir of [dataDir, uploadDir, cadDir, modelDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

function decodeUploadName(filename) {
  const decoded = Buffer.from(filename, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? filename : decoded;
}

function createSqliteStore() {
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

  return {
    kind: 'sqlite',
    location: dbPath,
    listCadAssets() {
      return db.prepare('SELECT * FROM cad_assets ORDER BY created_at DESC').all();
    },
    createCadAsset(asset) {
      db.prepare(`
        INSERT INTO cad_assets (
          id, name, original_filename, original_format, original_file_path,
          converted_format, converted_file_path, status, updated_at
        )
        VALUES (@id, @name, @originalFilename, @originalFormat, @originalFilePath, @convertedFormat, @convertedFilePath, @status, CURRENT_TIMESTAMP)
      `).run(asset);
      return db.prepare('SELECT * FROM cad_assets WHERE id = ?').get(asset.id);
    },
    updateCadAssetModelPath(id, convertedFilePath, convertedFormat) {
      const result = db.prepare(`
        UPDATE cad_assets
        SET converted_file_path = ?, converted_format = ?, status = 'ready', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(convertedFilePath, convertedFormat, id);
      if (!result.changes) return null;
      return db.prepare('SELECT * FROM cad_assets WHERE id = ?').get(id);
    }
  };
}

async function createPostgresStore(url) {
  const sql = postgres(url, { ssl: 'require' });
  await sql.unsafe(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

  return {
    kind: 'postgres',
    location: new URL(url).host,
    async listCadAssets() {
      return sql`SELECT * FROM cad_assets ORDER BY created_at DESC`;
    },
    async createCadAsset(asset) {
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
    },
    async updateCadAssetModelPath(id, convertedFilePath, convertedFormat) {
      const rows = await sql`
        UPDATE cad_assets
        SET converted_file_path = ${convertedFilePath}, converted_format = ${convertedFormat}, status = 'ready', updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id}
        RETURNING *
      `;
      return rows[0] || null;
    }
  };
}

const store = databaseUrl ? await createPostgresStore(databaseUrl) : createSqliteStore();

const upload = multer({
  storage: hasBlobToken ? multer.memoryStorage() : multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, cadDir),
    filename: (_req, file, cb) => cb(null, createStoredFilename(file.originalname))
  }),
  limits: { fileSize: 250 * 1024 * 1024 }
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(uploadDir));

function publicUploadPath(filePath) {
  const relative = path.relative(uploadDir, filePath).split(path.sep).join('/');
  return `/uploads/${relative}`;
}

function createStoredFilename(filename) {
  const ext = path.extname(decodeUploadName(filename)).toLowerCase();
  return `${Date.now()}-${randomUUID()}${ext}`;
}

async function storeUploadedFile(file) {
  if (!hasBlobToken) {
    return publicUploadPath(file.path);
  }

  if (!hasValidBlobTokenShape) {
    throw new Error('BLOB_READ_WRITE_TOKEN does not look like a Vercel Blob read/write token.');
  }

  const blob = await put(`cad/${createStoredFilename(file.originalname)}`, file.buffer, {
    access: 'public',
    contentType: file.mimetype || 'application/octet-stream',
    token: blobToken
  });
  return blob.url;
}

function rowToCadAsset(row) {
  return {
    id: row.id,
    name: row.name,
    originalFilename: row.original_filename,
    originalFormat: row.original_format,
    originalFilePath: row.original_file_path,
    convertedFormat: row.converted_format,
    convertedFilePath: row.converted_file_path,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    database: store.kind,
    location: store.location,
    storage: hasBlobToken ? 'blob' : 'local',
    blobToken: hasBlobToken ? (hasValidBlobTokenShape ? 'valid-shape' : 'invalid-shape') : 'missing'
  });
});

app.get('/api/cad-assets', async (_req, res) => {
  const rows = await store.listCadAssets();
  res.json(rows.map(rowToCadAsset));
});

app.post('/api/cad-assets', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'file is required' });
    return;
  }

  const originalFilename = decodeUploadName(req.file.originalname);
  const originalExt = path.extname(originalFilename).replace('.', '').toLowerCase();
  const webFormats = new Set(['glb', 'gltf', 'stl']);
  const id = randomUUID();
  const name = req.body.name?.trim() || path.basename(originalFilename, path.extname(originalFilename));
  const originalFilePath = await storeUploadedFile(req.file);
  const convertedFormat = webFormats.has(originalExt) ? originalExt : null;
  const convertedFilePath = webFormats.has(originalExt) ? originalFilePath : null;
  const status = webFormats.has(originalExt) ? 'ready' : 'uploaded';

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

  res.status(201).json(rowToCadAsset(asset));
});

app.patch('/api/cad-assets/:id/model-path', async (req, res) => {
  const { convertedFilePath, convertedFormat } = req.body;
  if (!convertedFilePath || !convertedFormat) {
    res.status(400).json({ error: 'convertedFilePath and convertedFormat are required' });
    return;
  }

  const asset = await store.updateCadAssetModelPath(req.params.id, convertedFilePath, String(convertedFormat).toLowerCase());

  if (!asset) {
    res.status(404).json({ error: 'asset not found' });
    return;
  }

  res.json(rowToCadAsset(asset));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: error.message || 'Internal server error' });
});

app.listen(port, () => {
  console.log(`API server running at http://127.0.0.1:${port}`);
  console.log(`${store.kind} database: ${store.kind === 'sqlite' ? path.relative(projectRoot, store.location) : store.location}`);
});
