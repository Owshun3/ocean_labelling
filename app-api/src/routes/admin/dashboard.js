const express = require('express');
const { pool } = require('../../db');

const router = express.Router();

router.get('/summary', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM moderation_contestations    WHERE resolved_at IS NULL) AS open_media_contestations,
        (SELECT COUNT(*) FROM annotation_contestations    WHERE resolved_at IS NULL) AS open_annotation_contestations,
        (SELECT COUNT(*) FROM chercheur_export_requests    WHERE status = 'pending')  AS open_chercheur_exports,
        (SELECT COUNT(*) FROM media_moderation
           WHERE status = 'validated' AND curator_validated_at IS NULL
             AND binaries_deleted_at IS NULL AND assigned_curator_id IS NULL
             AND annotated_jobs_count >= COALESCE(
               (SELECT value::int FROM app_settings WHERE key = 'consensus_replicas_default'),
               2
             ))                                                                       AS media_awaiting_curation,
        -- 1 user = 1 compte (DISTINCT) ; filtre idle 30 min pour exclure les
        -- sessions zombies de navigateurs fermés.
        (SELECT COUNT(DISTINCT cvat_user_id) FROM app_sessions
           WHERE expires_at > NOW()
             AND last_seen_at > NOW() - INTERVAL '30 minutes')                       AS active_sessions,
        (SELECT COUNT(*) FROM user_bans
           WHERE released_at IS NULL AND (expires_at IS NULL OR expires_at > NOW()))  AS active_bans,
        (SELECT COUNT(*) FROM species WHERE status = 'pending')                       AS pending_species,
        (SELECT value FROM app_settings WHERE key = 'upload_max_bytes')               AS upload_max_bytes
    `);
    const r = rows[0];
    const requestsTotal =
      Number(r.open_media_contestations) +
      Number(r.open_annotation_contestations) +
      Number(r.open_chercheur_exports);
    res.json({
      contestations: {
        media:      Number(r.open_media_contestations),
        annotation: Number(r.open_annotation_contestations),
        total:      Number(r.open_media_contestations) + Number(r.open_annotation_contestations),
      },
      requests: {
        total:             requestsTotal,
        contestations:     Number(r.open_media_contestations) + Number(r.open_annotation_contestations),
        species_edits:     0,
        chercheur_exports: Number(r.open_chercheur_exports),
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
