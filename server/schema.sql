CREATE TABLE IF NOT EXISTS cad_assets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  original_format TEXT NOT NULL,
  original_file_path TEXT NOT NULL,
  converted_format TEXT,
  converted_file_path TEXT,
  status TEXT NOT NULL DEFAULT 'uploaded',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS twin_assets (
  id TEXT PRIMARY KEY,
  cad_asset_id TEXT,
  asset_type TEXT NOT NULL,
  label TEXT NOT NULL,
  location TEXT,
  transform_json TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cad_asset_id) REFERENCES cad_assets(id)
);
