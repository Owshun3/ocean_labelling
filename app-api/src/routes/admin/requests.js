'use strict';

const express = require('express');
const { pool } = require('../../db');
const { cvatGet } = require('../../lib/cvatAdmin');
const { recordAction } = require('../../lib/auditLog');

const router = express.Router();

router.get('/summary', async (_req, res) => {
  try {
    const [contMedia, contAnnotation, researcher] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS n FROM moderation_contestations WHERE resolved_at IS NULL`),
      pool.query(`SELECT COUNT(*)::int AS n FROM annotation_contestations WHERE resolved_at IS NULL`),
      pool.query(`SELECT COUNT(*)::int AS n FROM chercheur_export_requests WHERE status = 'pending'`),
    ]);
    res.json({
      contestations: contMedia.rows[0].n + contAnnotation.rows[0].n,
      contestations_breakdown: {
        media:      contMedia.rows[0].n,
        annotation: contAnnotation.rows[0].n,
      },
      species_edits: 0, // tombstone : ancien client lit ce champ, ne pas supprimer
      researcher_access: researcher.rows[0].n,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/chercheur-exports', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, requester_id, message, organization, scope, status,
             reviewed_by, reviewed_at, review_comment, expires_at, created_at
      FROM chercheur_export_requests
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT 200
    `);
    if (rows.length === 0) return res.json({ results: [] });

    const ids = [...new Set(rows.map((r) => r.requester_id))];
    const usernames = {};
    await Promise.all(ids.map(async (id) => {
      try { const r = await cvatGet(`/users/${id}`); usernames[id] = r.data.username; }
      catch { /* ignore */ }
    }));

    res.json({
      results: rows.map((r) => ({ ...r, requester_username: usernames[r.requester_id] ?? null })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/chercheur-exports/:id/resolve', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
  const action = req.body?.action === 'approve' ? 'approve'
               : req.body?.action === 'reject'  ? 'reject'
               : null;
  if (!action) return res.status(400).json({ error: 'action must be approve|reject' });
  const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim().slice(0, 1000) : '';
  if (action === 'reject' && comment.length === 0) {
    return res.status(400).json({ error: 'comment requis pour un rejet' });
  }
  const durationDays = action === 'approve' && Number.isFinite(req.body?.duration_days)
    ? Math.min(365, Math.max(1, Number(req.body.duration_days)))
    : 7;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const lock = await client.query(
      `SELECT id, requester_id, status FROM chercheur_export_requests WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (lock.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'demande introuvable' }); }
    if (lock.rows[0].status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `demande déjà ${lock.rows[0].status}` });
    }

    if (action === 'approve') {
      await client.query(`
        UPDATE chercheur_export_requests
        SET status = 'approved', reviewed_by = $1, reviewed_at = NOW(),
            review_comment = $2, expires_at = NOW() + ($3 || ' days')::interval
        WHERE id = $4
      `, [req.cvatUser.id, comment || null, String(durationDays), id]);
    } else {
      await client.query(`
        UPDATE chercheur_export_requests
        SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), review_comment = $2
        WHERE id = $3
      `, [req.cvatUser.id, comment, id]);
    }

    await client.query('COMMIT');

    recordAction(req.cvatUser.id, 'chercheur_export.resolved', {
      payload: { id, action, comment: comment || undefined, duration_days: action === 'approve' ? durationDays : null },
    });

    res.json({ resolved: true, action });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
