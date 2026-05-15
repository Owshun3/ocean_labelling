const express = require('express');
const { pool } = require('../../db');

const router = express.Router();

router.get('/summary', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM moderation_contestations    WHERE resolved_at IS NULL) AS open_media_contestations,
        (SELECT COUNT(*) FROM annotation_contestations    WHERE resolved_at IS NULL) AS open_annotation_contestations,
        (SELECT COUNT(*) FROM media_moderation
           WHERE status = 'validated' AND curator_validated_at IS NULL
             AND binaries_deleted_at IS NULL AND assigned_curator_id IS NULL
             AND annotated_jobs_count >= COALESCE(
               (SELECT value::int FROM app_settings WHERE key = 'consensus_replicas_default'),
               2
             ))                                                                       AS media_awaiting_curation,
        (SELECT COUNT(*) FROM app_sessions WHERE expires_at > NOW())                  AS active_sessions,
        (SELECT COUNT(*) FROM user_bans
           WHERE released_at IS NULL AND (expires_at IS NULL OR expires_at > NOW()))  AS active_bans,
        (SELECT COUNT(*) FROM species WHERE status = 'pending')                       AS pending_species,
        (SELECT value FROM app_settings WHERE key = 'upload_max_bytes')               AS upload_max_bytes
    `);
    const r = rows[0];
    res.json({
      contestations: {
        media:      Number(r.open_media_contestations),
        annotation: Number(r.open_annotation_contestations),
        total:      Number(r.open_media_contestations) + Number(r.open_annotation_contestations),
      },
      curation: {
        media_awaiting: Number(r.media_awaiting_curation),
      },
      accounts: {
        active_sessions: Number(r.active_sessions),
        active_bans:     Number(r.active_bans),
      },
      species: {
        pending: Number(r.pending_species),
      },
      settings: {
        upload_max_bytes: r.upload_max_bytes ? Number(r.upload_max_bytes) : null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
