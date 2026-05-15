'use strict';

const express = require('express');
const { pool } = require('../../db');
const { cvatGet } = require('../../lib/cvatAdmin');
const { recordAction } = require('../../lib/auditLog');

const router = express.Router();

// Compteurs des onglets du hub /admin/requests.
router.get('/summary', async (_req, res) => {
  try {
    const [contMedia, contAnnotation, speciesEdits] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS n FROM moderation_contestations WHERE resolved_at IS NULL`),
      pool.query(`SELECT COUNT(*)::int AS n FROM annotation_contestations WHERE resolved_at IS NULL`),
      pool.query(`SELECT COUNT(*)::int AS n FROM species_edit_requests WHERE status = 'pending'`),
    ]);
    res.json({
      contestations: contMedia.rows[0].n + contAnnotation.rows[0].n,
      contestations_breakdown: {
        media:      contMedia.rows[0].n,
        annotation: contAnnotation.rows[0].n,
      },
      species_edits: speciesEdits.rows[0].n,
      researcher_access: 0, // placeholder — sera branché sur chercheur_export_scopes
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Liste des demandes d'édition de fiches d'espèces en attente.
router.get('/species-edits', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.id, r.species_id, r.proposed_by, r.proposed_at, r.proposed_payload, r.status,
             s.name, s.scientific_name, s.usage_name, s.polynesian_name, s.description,
             s.description_source, s.reference_image_url, s.tags
      FROM species_edit_requests r
      JOIN species s ON s.id = r.species_id
      WHERE r.status = 'pending'
      ORDER BY r.proposed_at ASC
      LIMIT 200
    `);
    if (rows.length === 0) return res.json({ results: [] });

    const proposerIds = [...new Set(rows.map((r) => r.proposed_by))];
    const usernames = {};
    await Promise.all(proposerIds.map(async (id) => {
      try { const r = await cvatGet(`/users/${id}`); usernames[id] = r.data.username; }
      catch { /* ignore */ }
    }));

    const results = rows.map((r) => ({
      id: r.id,
      species_id: r.species_id,
      proposed_at: r.proposed_at,
      proposer: { id: r.proposed_by, username: usernames[r.proposed_by] ?? null },
      current: {
        scientific_name:     r.scientific_name,
        usage_name:          r.usage_name,
        polynesian_name:     r.polynesian_name,
        description:         r.description,
        description_source:  r.description_source,
        reference_image_url: r.reference_image_url,
        tags:                r.tags ?? [],
      },
      proposed: r.proposed_payload,
    }));
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Résolution : approve (applique le payload) ou reject (motif obligatoire).
router.post('/species-edits/:id/resolve', async (req, res) => {
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

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const lock = await client.query(
      `SELECT id, species_id, proposed_payload, status FROM species_edit_requests
       WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (lock.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'request not found' }); }
    const reqRow = lock.rows[0];
    if (reqRow.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `demande déjà ${reqRow.status}` });
    }

    let appliedFields = null;
    if (action === 'approve') {
      const payload = reqRow.proposed_payload || {};
      const fields = [];
      const params = [];
      const ALLOWED = ['scientific_name', 'usage_name', 'polynesian_name', 'description', 'description_source', 'reference_image_url'];
      for (const k of ALLOWED) {
        if (k in payload) { params.push(payload[k]); fields.push(`${k} = $${params.length}`); }
      }
      if ('tags' in payload) { params.push(payload.tags); fields.push(`tags = $${params.length}`); }
      if (fields.length > 0) {
        params.push(reqRow.species_id);
        await client.query(
          `UPDATE species SET ${fields.join(', ')} WHERE id = $${params.length}`,
          params,
        );
      }
      appliedFields = fields.length;
    }

    await client.query(
      `UPDATE species_edit_requests
       SET status = $1, reviewed_by = $2, reviewed_at = NOW(), review_comment = $3
       WHERE id = $4`,
      [action === 'approve' ? 'approved' : 'rejected', req.cvatUser.id, comment || null, id],
    );

    await client.query('COMMIT');

    recordAction(req.cvatUser.id, 'species_edit.resolved', {
      targetType: 'species',
      targetId:   reqRow.species_id,
      payload:    {
        request_id: id,
        action,
        comment: comment || undefined,
        applied_fields: appliedFields,
        proposed_payload: reqRow.proposed_payload,
      },
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
