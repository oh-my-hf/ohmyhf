import { join } from 'node:path'
import Database from 'better-sqlite3'
import { app } from 'electron'

export type AppDatabase = Database.Database

/**
 * All local state lives in one SQLite file under userData:
 * favorites, history, download tasks, follows, inbox, settings, and the
 * app metadata. Access tokens use the separate safeStorage-encrypted credentials
 * file; the auth table remains only for one-way migration from older releases.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE favorites (
    repo_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    added_at TEXT NOT NULL,
    summary_json TEXT NOT NULL,
    PRIMARY KEY (repo_id, kind)
  );
  CREATE TABLE history (
    repo_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    viewed_at TEXT NOT NULL,
    summary_json TEXT NOT NULL,
    PRIMARY KEY (repo_id, kind)
  );
  CREATE TABLE downloads (
    id TEXT PRIMARY KEY,
    repo_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    revision TEXT NOT NULL,
    status TEXT NOT NULL,
    total_bytes INTEGER NOT NULL DEFAULT 0,
    received_bytes INTEGER NOT NULL DEFAULT 0,
    files_json TEXT NOT NULL,
    error TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT
  );
  CREATE TABLE follows (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    target TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_checked_at TEXT,
    state_json TEXT,
    UNIQUE (type, target)
  );
  CREATE TABLE inbox (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    route TEXT NOT NULL,
    created_at TEXT NOT NULL,
    read_at TEXT
  );
  CREATE TABLE auth (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    token_cipher BLOB NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_inbox_created ON inbox (created_at DESC);
  `,
  `
  ALTER TABLE downloads ADD COLUMN resolved_commit TEXT;
  ALTER TABLE downloads ADD COLUMN endpoint TEXT;
  ALTER TABLE downloads ADD COLUMN proxy_url TEXT;
  ALTER TABLE downloads ADD COLUMN cache_dir TEXT;
  ALTER TABLE downloads ADD COLUMN environment_version INTEGER;
  ALTER TABLE downloads ADD COLUMN error_code TEXT;

  -- Pre-environment downloads cannot be resumed safely: their endpoint,
  -- proxy, and cache root are unknowable. Terminal rows remain visible.
  UPDATE downloads
     SET status = 'error',
         error_code = 'legacy-task',
         error = 'This download was created by an older version and cannot be resumed.'
   WHERE status IN ('queued', 'running', 'paused', 'error');
  `
]

export function openDatabase(filePath?: string): AppDatabase {
  const file = filePath ?? join(app.getPath('userData'), 'oh-my-huggingface.db')
  const db: AppDatabase = new Database(file)
  db.pragma('journal_mode = WAL')
  migrate(db)
  return db
}

function migrate(db: AppDatabase): void {
  const current = db.pragma('user_version', { simple: true }) as number
  for (let v = current; v < MIGRATIONS.length; v++) {
    const sql = MIGRATIONS[v]
    if (!sql) continue
    db.transaction(() => {
      db.exec(sql)
      db.pragma(`user_version = ${v + 1}`)
    })()
  }
}
