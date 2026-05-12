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

    CREATE TABLE IF NOT EXISTS media_moderation (
      cvat_task_id    INTEGER     PRIMARY KEY,
      uploader_id     INTEGER     NOT NULL,
      status          TEXT        NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'validated', 'rejected')),
      reviewed_by     INTEGER,
      review_comment  TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at     TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_media_moderation_status   ON media_moderation(status);
    CREATE INDEX IF NOT EXISTS idx_media_moderation_uploader ON media_moderation(uploader_id);
    ALTER TABLE media_moderation ADD COLUMN IF NOT EXISTS curator_validated_at TIMESTAMPTZ;
    ALTER TABLE media_moderation ADD COLUMN IF NOT EXISTS curator_validated_by INTEGER;

    CREATE TABLE IF NOT EXISTS user_bans (
      id            SERIAL      PRIMARY KEY,
      cvat_user_id  INTEGER     NOT NULL,
      banned_by     INTEGER     NOT NULL,
      reason        TEXT,
      banned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at    TIMESTAMPTZ
    );
    ALTER TABLE user_bans ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ;
    ALTER TABLE user_bans ADD COLUMN IF NOT EXISTS released_by INTEGER;
    CREATE INDEX IF NOT EXISTS idx_user_bans_user    ON user_bans(cvat_user_id);
    CREATE INDEX IF NOT EXISTS idx_user_bans_expires ON user_bans(expires_at);

    CREATE TABLE IF NOT EXISTS species (
      id            SERIAL      PRIMARY KEY,
      name          TEXT        UNIQUE NOT NULL,
      status        TEXT        NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
      proposed_by   INTEGER,
      approved_by   INTEGER,
      usage_count   INTEGER     NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_species_name_lower ON species (LOWER(name));
    CREATE INDEX IF NOT EXISTS idx_species_status     ON species (status);
    ALTER TABLE species ADD COLUMN IF NOT EXISTS scientific_name      TEXT;
    ALTER TABLE species ADD COLUMN IF NOT EXISTS polynesian_name      TEXT;
    ALTER TABLE species ADD COLUMN IF NOT EXISTS category             TEXT;
    ALTER TABLE species ADD COLUMN IF NOT EXISTS description          TEXT;
    ALTER TABLE species ADD COLUMN IF NOT EXISTS description_source   TEXT
      CHECK (description_source IS NULL OR description_source IN ('manual', 'wikipedia', 'annotator_proposal'));
    CREATE INDEX IF NOT EXISTS idx_species_scientific_lower ON species (LOWER(scientific_name));
    CREATE INDEX IF NOT EXISTS idx_species_polynesian_lower ON species (LOWER(polynesian_name));

    CREATE TABLE IF NOT EXISTS annotation_comments (
      id                    SERIAL      PRIMARY KEY,
      cvat_job_id           INTEGER     NOT NULL,
      cvat_shape_client_id  BIGINT      NOT NULL,
      author_id             INTEGER     NOT NULL,
      comment               TEXT        NOT NULL,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_annotation_comments_job
      ON annotation_comments (cvat_job_id);
    CREATE INDEX IF NOT EXISTS idx_annotation_comments_shape
      ON annotation_comments (cvat_job_id, cvat_shape_client_id);

    CREATE TABLE IF NOT EXISTS annotation_contestations (
      id            SERIAL      PRIMARY KEY,
      cvat_task_id  INTEGER     NOT NULL,
      contester_id  INTEGER     NOT NULL,
      message       TEXT        NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at   TIMESTAMPTZ,
      resolved_by   INTEGER,
      resolution    TEXT CHECK (resolution IN ('upheld', 'overturned'))
    );
    CREATE INDEX IF NOT EXISTS idx_annotation_contestations_open
      ON annotation_contestations(resolved_at)
      WHERE resolved_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_annotation_contestations_task
      ON annotation_contestations(cvat_task_id);

    CREATE TABLE IF NOT EXISTS moderation_contestations (
      id            SERIAL      PRIMARY KEY,
      cvat_task_id  INTEGER     NOT NULL,
      contester_id  INTEGER     NOT NULL,
      message       TEXT        NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at   TIMESTAMPTZ,
      resolved_by   INTEGER,
      resolution    TEXT CHECK (resolution IN ('upheld', 'overturned'))
    );
    CREATE INDEX IF NOT EXISTS idx_contestations_open
      ON moderation_contestations(resolved_at)
      WHERE resolved_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_contestations_contester
      ON moderation_contestations(contester_id);
  `);
  console.log('[app-api] DB schema ready');
}

module.exports = { pool, init };
