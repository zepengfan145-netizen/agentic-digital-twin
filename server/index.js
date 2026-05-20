import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import multer from 'multer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const dataDir = path.join(__dirname, 'data');
const uploadDir = path.join(__dirname, 'uploads');
const cadDir = path.join(uploadDir, 'cad');
const modelDir = path.join(uploadDir, 'models');
const dbPath = path.join(dataDir, 'digital_twin.db');
const port = Number(process.env.PORT || 3001);

for (const dir of [dataDir, uploadDir, cadDir, modelDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

function decodeUploadName(filename) {
  const decoded = Buffer.from(filename, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? filename : decoded;
}

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, cadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(decodeUploadName(file.originalname)).toLowerCase();
      cb(null, `${Date.now()}-${randomUUID()}${ext}`);
    }
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
  res.json({ ok: true, database: dbPath });
});

app.get('/api/cad-assets', (_req, res) => {
  const rows = db.prepare('SELECT * FROM cad_assets ORDER BY created_at DESC').all();
  res.json(rows.map(rowToCadAsset));
});

app.post('/api/cad-assets', upload.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'file is required' });
    return;
  }

  const originalFilename = decodeUploadName(req.file.originalname);
  const originalExt = path.extname(originalFilename).replace('.', '').toLowerCase();
  const webFormats = new Set(['glb', 'gltf', 'stl']);
  const id = randomUUID();
  const name = req.body.name?.trim() || path.basename(originalFilename, path.extname(originalFilename));
  const originalFilePath = publicUploadPath(req.file.path);
  const convertedFormat = webFormats.has(originalExt) ? originalExt : null;
  const convertedFilePath = webFormats.has(originalExt) ? originalFilePath : null;
  const status = webFormats.has(originalExt) ? 'ready' : 'uploaded';

  db.prepare(`
    INSERT INTO cad_assets (
      id, name, original_filename, original_format, original_file_path,
      converted_format, converted_file_path, status, updated_at
    )
    VALUES (@id, @name, @originalFilename, @originalFormat, @originalFilePath, @convertedFormat, @convertedFilePath, @status, CURRENT_TIMESTAMP)
  `).run({
    id,
    name,
    originalFilename,
    originalFormat: originalExt || 'unknown',
    originalFilePath,
    convertedFormat,
    convertedFilePath,
    status
  });

  const asset = db.prepare('SELECT * FROM cad_assets WHERE id = ?').get(id);
  res.status(201).json(rowToCadAsset(asset));
});

app.patch('/api/cad-assets/:id/model-path', (req, res) => {
  const { convertedFilePath, convertedFormat } = req.body;
  if (!convertedFilePath || !convertedFormat) {
    res.status(400).json({ error: 'convertedFilePath and convertedFormat are required' });
    return;
  }

  const result = db.prepare(`
    UPDATE cad_assets
    SET converted_file_path = ?, converted_format = ?, status = 'ready', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(convertedFilePath, String(convertedFormat).toLowerCase(), req.params.id);

  if (!result.changes) {
    res.status(404).json({ error: 'asset not found' });
    return;
  }

  const asset = db.prepare('SELECT * FROM cad_assets WHERE id = ?').get(req.params.id);
  res.json(rowToCadAsset(asset));
});

app.listen(port, '127.0.0.1', () => {
  console.log(`API server running at http://127.0.0.1:${port}`);
  console.log(`SQLite database: ${path.relative(projectRoot, dbPath)}`);
});
