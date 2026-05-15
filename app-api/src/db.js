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
    ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS username_changed_at TIMESTAMPTZ;
    ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS has_seen_welcome BOOLEAN NOT NULL DEFAULT FALSE;

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
    ALTER TABLE media_moderation ADD COLUMN IF NOT EXISTS binaries_deleted_at  TIMESTAMPTZ;
    ALTER TABLE media_moderation ADD COLUMN IF NOT EXISTS assigned_curator_id  INTEGER;
    ALTER TABLE media_moderation ADD COLUMN IF NOT EXISTS assigned_at          TIMESTAMPTZ;
    ALTER TABLE media_moderation ADD COLUMN IF NOT EXISTS assigned_by          INTEGER;
    CREATE INDEX IF NOT EXISTS idx_mm_assigned_curator ON media_moderation (assigned_curator_id) WHERE assigned_curator_id IS NOT NULL;

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
    ALTER TABLE species ADD COLUMN IF NOT EXISTS usage_name           TEXT;
    ALTER TABLE species ADD COLUMN IF NOT EXISTS tags                  TEXT[] NOT NULL DEFAULT '{}';
    ALTER TABLE species ADD COLUMN IF NOT EXISTS reference_image_url   TEXT;
    CREATE INDEX IF NOT EXISTS idx_species_usage_lower ON species (LOWER(usage_name));

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
    ALTER TABLE annotation_comments ADD COLUMN IF NOT EXISTS is_curator_comment BOOLEAN NOT NULL DEFAULT FALSE;

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

    CREATE TABLE IF NOT EXISTS media_metadata (
      cvat_task_id  INTEGER     PRIMARY KEY,
      gps_latitude  DOUBLE PRECISION,
      gps_longitude DOUBLE PRECISION,
      taken_at      TIMESTAMPTZ,
      camera_make   TEXT,
      camera_model  TEXT,
      image_width   INTEGER,
      image_height  INTEGER,
      raw_exif      JSONB,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS curator_certifications (
      id                       SERIAL      PRIMARY KEY,
      cvat_task_id             INTEGER     NOT NULL,
      cvat_job_id              INTEGER     NOT NULL,
      curator_id               INTEGER     NOT NULL,
      mode                     TEXT        NOT NULL CHECK (mode IN ('review', 'create')),
      chosen_bbox_annotator_id INTEGER,
      chosen_bbox_data         JSONB       NOT NULL,
      rejected_proposals       JSONB,
      species_id               INTEGER     REFERENCES species(id),
      curator_comment          TEXT,
      certified_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_curator_cert_task    ON curator_certifications (cvat_task_id);
    CREATE INDEX IF NOT EXISTS idx_curator_cert_chosen  ON curator_certifications (chosen_bbox_annotator_id);
    CREATE INDEX IF NOT EXISTS idx_curator_cert_curator ON curator_certifications (curator_id);

    CREATE TABLE IF NOT EXISTS app_sessions (
      id             UUID        PRIMARY KEY,
      cvat_user_id   INTEGER     NOT NULL,
      cvat_token     TEXT        NOT NULL,
      remember       BOOLEAN     NOT NULL DEFAULT FALSE,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at     TIMESTAMPTZ NOT NULL,
      user_agent     TEXT,
      ip             TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_app_sessions_user ON app_sessions (cvat_user_id);
    CREATE INDEX IF NOT EXISTS idx_app_sessions_exp  ON app_sessions (expires_at);

    CREATE TABLE IF NOT EXISTS admin_actions (
      id           SERIAL      PRIMARY KEY,
      actor_id     INTEGER     NOT NULL,
      action       TEXT        NOT NULL,
      target_type  TEXT,
      target_id    INTEGER,
      payload      JSONB,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_admin_actions_created ON admin_actions (created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_admin_actions_actor   ON admin_actions (actor_id);
    CREATE INDEX IF NOT EXISTS idx_admin_actions_action  ON admin_actions (action);
  `);

  const { ensureSchema: ensureSettingsSchema } = require('./lib/settingsRegistry');
  await ensureSettingsSchema(pool);

  console.log('[app-api] DB schema ready');
}

module.exports = { pool, init };
