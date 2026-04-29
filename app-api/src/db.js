const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function init(retries = 10, delayMs = 2000) {
  for (let i = 1; i <= retries; i++) {
    try {
      return await _createSchema();
    } catch (err) {
      if (i === retries) throw err;
      console.warn(`[app-api] DB not ready (attempt ${i}/${retries}): ${err.message}`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

async function _createSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_roles (
      cvat_user_id  INTEGER PRIMARY KEY,
      username      TEXT        NOT NULL DEFAULT '',
      email         TEXT        NOT NULL DEFAULT '',
      role          TEXT        NOT NULL DEFAULT 'annotator',
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS upload_history (
      id             SERIAL PRIMARY KEY,
      cvat_user_id   INTEGER     NOT NULL,
      cvat_task_id   INTEGER     NOT NULL,
      batch_name     TEXT        NOT NULL,
      file_count     INTEGER     NOT NULL DEFAULT 0,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS invitation_tokens (
      id          SERIAL PRIMARY KEY,
      token       TEXT        UNIQUE NOT NULL,
      role        TEXT        NOT NULL DEFAULT 'annotator',
      created_by  INTEGER     NOT NULL,
      used_by     INTEGER,
      expires_at  TIMESTAMPTZ,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  console.log('[app-api] DB schema ready');
}

module.exports = { pool, init };
