import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import type { WorkspaceMode } from '../src/types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const UPLOADS_BASE_DIR = path.resolve(process.cwd(), 'uploads');

for (const dir of [
  DATA_DIR,
  path.join(UPLOADS_BASE_DIR, 'prod'),
  path.join(UPLOADS_BASE_DIR, 'demo'),
]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const SCHEMA_SQL = `
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    jabatan TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin_humas', 'kreator', 'pimpinan')),
    official_level INTEGER CHECK(official_level IS NULL OR official_level IN (1, 2, 3)),
    is_active INTEGER NOT NULL DEFAULT 1,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    storage_key TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    media_type TEXT NOT NULL CHECK(media_type IN ('image', 'video')),
    uploaded_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS contents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    platforms TEXT NOT NULL,
    publish_date TEXT NOT NULL,
    publish_time TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('Menunggu Approval', 'Perlu Revisi', 'Ditolak', 'Siap Publikasi')),
    creator_id TEXT NOT NULL REFERENCES users(id),
    current_version INTEGER NOT NULL DEFAULT 1,
    current_step_order INTEGER,
    current_approver_id TEXT REFERENCES users(id),
    revision_note TEXT,
    rejection_reason TEXT,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS content_versions (
    id TEXT PRIMARY KEY,
    content_id TEXT NOT NULL REFERENCES contents(id),
    version_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    caption TEXT NOT NULL,
    file_id TEXT NOT NULL REFERENCES files(id),
    created_by TEXT NOT NULL REFERENCES users(id),
    revision_note_reference TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(content_id, version_number)
  );

  CREATE TABLE IF NOT EXISTS approval_steps (
    id TEXT PRIMARY KEY,
    content_id TEXT NOT NULL REFERENCES contents(id),
    step_order INTEGER NOT NULL,
    official_level INTEGER NOT NULL CHECK(official_level IN (1, 2, 3)),
    approver_id TEXT NOT NULL REFERENCES users(id),
    status TEXT NOT NULL CHECK(status IN ('Menunggu', 'Menunggu Antrean', 'Disetujui', 'Revisi', 'Ditolak')),
    decision_note TEXT,
    decided_at TEXT,
    decided_by_id TEXT REFERENCES users(id),
    UNIQUE(content_id, step_order)
  );

  CREATE TABLE IF NOT EXISTS activity_logs (
    id TEXT PRIMARY KEY,
    content_id TEXT NOT NULL REFERENCES contents(id),
    actor_id TEXT NOT NULL REFERENCES users(id),
    actor_name TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    action_type TEXT NOT NULL,
    description TEXT NOT NULL,
    metadata_json TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    content_id TEXT REFERENCES contents(id),
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_contents_status ON contents(status);
  CREATE INDEX IF NOT EXISTS idx_contents_approver ON contents(current_approver_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at);
  CREATE INDEX IF NOT EXISTS idx_activity_content ON activity_logs(content_id, created_at);
`;

const connections: Partial<Record<WorkspaceMode, Database.Database>> = {};

export function getDb(workspace: WorkspaceMode): Database.Database {
  if (!connections[workspace]) {
    const dbPath = path.join(DATA_DIR, workspace === 'demo' ? 'demo.db' : 'prod.db');
    const db = new Database(dbPath);
    db.exec(SCHEMA_SQL);
    connections[workspace] = db;
  }
  return connections[workspace]!;
}

export function getUploadsDir(workspace: WorkspaceMode): string {
  return path.join(UPLOADS_BASE_DIR, workspace === 'demo' ? 'demo' : 'prod');
}
