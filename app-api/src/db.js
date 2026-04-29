const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'app.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS user_roles (
    cvat_user_id  INTEGER PRIMARY KEY,
    username      TEXT    NOT NULL DEFAULT '',
    email         TEXT    NOT NULL DEFAULT '',
    role          TEXT    NOT NULL DEFAULT 'annotator',
    updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS upload_history (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    cvat_user_id   INTEGER NOT NULL,
    cvat_task_id   INTEGER NOT NULL,
    batch_name     TEXT    NOT NULL,
    file_count     INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS invitation_tokens (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    token       TEXT    UNIQUE NOT NULL,
    role        TEXT    NOT NULL DEFAULT 'annotator',
    created_by  INTEGER NOT NULL,
    used_by     INTEGER,
    expires_at  TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

module.exports = db;
