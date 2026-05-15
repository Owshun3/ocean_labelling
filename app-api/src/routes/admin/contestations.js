'use strict';

const express = require('express');
const { pool } = require('../../db');
const { cvatGet, cvatDelete } = require('../../lib/cvatAdmin');
const { recordAction } = require('../../lib/auditLog');
const { fetchActionsTotals } = require('../../lib/userStats');

const router = express.Router();

const VALID_KINDS = new Set(['media', 'annotation']);
function resolveKind(req) {
  const raw = String(req.query.kind ?? req.body?.kind ?? 'media').toLowerCase();
  return VALID_KINDS.has(raw) ? raw : 'media';
}
function tableForKind(kind) {
  return kind === 'annotation' ? 'annotation_contestations' : 'moderation_contestations';
}

async function fetchUsersByIds(userIds) {
  const byId = {};
  await Promise.all(userIds.map(async (id) => {
    try {
      const resp = await cvatGet(`/users/${id}`);
      byId[id] = {
        id: resp.data.id,
        username: resp.data.username,
        email: resp.data.email,
        is_active: resp.data.is_active,
      };
    } catch (_) { /* ignore */ }
  }));
  return byId;
}

async function fetchAppRoles(userIds) {
  if (userIds.length === 0) return {};
  const { rows } = await pool.query(
    'SELECT cvat_user_id, role FROM user_roles WHERE cvat_user_id = ANY($1)',
    [userIds]
  );
  const map = {};
  rows.forEach((r) => { map[r.cvat_user_id] = r.role; });
  return map;
}

router.get('/uploaders', async (req, res) => {
  const kind = resolveKind(req);
  const table = tableForKind(kind);
  try {
    const { rows } = await pool.query(`
      SELECT
        mm.uploader_id,
        COUNT(*)                   AS contestation_count,
        MIN(c.created_at)          AS oldest_contestation,
        MAX(c.created_at)          AS newest_contestation
      FROM ${table} c
      JOIN media_moderation mm ON mm.cvat_task_id = c.cvat_task_id
      WHERE c.resolved_at IS NULL
      GROUP BY mm.uploader_id
      ORDER BY oldest_contestation ASC
    `);

    if (rows.length === 0) return res.json({ results: [], kind });

    const userIds  = rows.map((r) => r.uploader_id);
    const usersById = await fetchUsersByIds(userIds);
    const rolesById = await fetchAppRoles(userIds);
    const actionsTotals = await fetchActionsTotals(userIds);

    const results = rows.map((r) => ({
      uploader_id:          r.uploader_id,
      username:             usersById[r.uploader_id]?.username || null,
      role:                 rolesById[r.uploader_id] || 'annotator',
      actions_validated_total: actionsTotals[r.uploader_id] ?? 0,
      contestation_count:   Number(r.contestation_count),
      oldest_contestation:  r.oldest_contestation,
      newest_contestation:  r.newest_contestation,
    }));

    res.json({ results, kind });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/uploaders/:id', async (req, res) => {
  const kind = resolveKind(req);
  const userId = Number(req.params.id);
  if (!Number.isFinite(userId)) return res.status(400).json({ error: 'invalid user id' });

  try {
    // Pour les contestations d'annotation, on joint aussi curator_certifications
    // pour identifier qui a certifié et quand.
    const query = kind === 'annotation' ? `
      SELECT
        c.id              AS contestation_id,
        c.cvat_task_id,
        c.message,
        c.created_at,
        c.contester_id,
        mm.uploader_id,
        mm.curator_validated_by AS reviewer_id,
        mm.curator_validated_at AS reviewed_at,
        cc.species_id,
        cc.mode             AS certification_mode,
        cc.curator_comment  AS certification_comment
      FROM annotation_contestations c
      JOIN media_moderation         mm ON mm.cvat_task_id = c.cvat_task_id
      LEFT JOIN LATERAL (
        SELECT species_id, mode, curator_comment
        FROM curator_certifications
        WHERE cvat_task_id = c.cvat_task_id
        ORDER BY certified_at DESC
        LIMIT 1
      ) cc ON TRUE
      WHERE c.resolved_at IS NULL
        AND mm.uploader_id = $1
      ORDER BY c.created_at ASC
    ` : `
      SELECT
        c.id            AS contestation_id,
        c.cvat_task_id,
        c.message,
        c.created_at,
        c.contester_id,
        mm.uploader_id,
        mm.reviewed_by  AS reviewer_id,
        mm.reviewed_at  AS reviewed_at,
        mm.review_comment AS rejection_reason
      FROM moderation_contestations c
      JOIN media_moderation         mm ON mm.cvat_task_id = c.cvat_task_id
      WHERE c.resolved_at IS NULL
        AND mm.uploader_id = $1
      ORDER BY c.created_at ASC
    `;
    const { rows } = await pool.query(query, [userId]);

    const userIdsToFetch = new Set([userId]);
    rows.forEach((r) => {
      if (r.reviewer_id)  userIdsToFetch.add(r.reviewer_id);
      if (r.contester_id) userIdsToFetch.add(r.contester_id);
    });
    const usersById = await fetchUsersByIds([...userIdsToFetch]);
    const rolesById = await fetchAppRoles([...userIdsToFetch]);
    const actionsTotals = await fetchActionsTotals([...userIdsToFetch]);

    const taskIds = rows.map((r) => r.cvat_task_id);
    const tasksById = {};
    await Promise.all(taskIds.map(async (id) => {
      try {
        const r = await cvatGet(`/tasks/${id}`);
        tasksById[id] = r.data;
      } catch (err) {
        if (err.response?.status !== 404) {
          console.warn(`[admin/contestations] failed to fetch task ${id}:`, err.message);
        }
      }
    }));

    const uploader = usersById[userId] ? {
      ...usersById[userId],
      role: rolesById[userId] || 'annotator',
      actions_validated_total: actionsTotals[userId] ?? 0,
    } : { id: userId, username: null, email: null, is_active: null, role: 'annotator', actions_validated_total: 0 };

    const lotsByMessage = new Map();
    rows.forEach((r) => {
      const key = r.message || '';
      if (!lotsByMessage.has(key)) {
        lotsByMessage.set(key, {
          message: r.message,
          first_contested_at: r.created_at,
          last_contested_at:  r.created_at,
          items: [],
        });
      }
      const lot = lotsByMessage.get(key);
      if (r.created_at < lot.first_contested_at) lot.first_contested_at = r.created_at;
      if (r.created_at > lot.last_contested_at)  lot.last_contested_at  = r.created_at;

      const reviewer = r.reviewer_id ? usersById[r.reviewer_id] : null;
      const contester = r.contester_id ? usersById[r.contester_id] : null;
      const task = tasksById[r.cvat_task_id] || null;

      const baseItem = {
        contestation_id: r.contestation_id,
        cvat_task_id:    r.cvat_task_id,
        contested_at:    r.created_at,
        reviewed_at:     r.reviewed_at,
        task,
        reviewer: reviewer ? {
          id: reviewer.id,
          username: reviewer.username,
          role: rolesById[reviewer.id] || 'annotator',
          actions_validated_total: actionsTotals[reviewer.id] ?? 0,
        } : null,
        contester: contester ? {
          id: contester.id,
          username: contester.username,
          role: rolesById[contester.id] || 'annotator',
          actions_validated_total: actionsTotals[contester.id] ?? 0,
        } : null,
      };

      if (kind === 'annotation') {
        baseItem.species_id           = r.species_id;
        baseItem.certification_mode   = r.certification_mode;
        baseItem.certification_comment = r.certification_comment;
      } else {
        baseItem.rejection_reason = r.rejection_reason;
      }
      lot.items.push(baseItem);
    });

    const lots = Array.from(lotsByMessage.values())
      .sort((a, b) => new Date(a.first_contested_at) - new Date(b.first_contested_at));

    res.json({ uploader, lots, kind });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/resolve', async (req, res) => {
  const kind = resolveKind(req);
  const table = tableForKind(kind);
  const ids = Array.isArray(req.body?.contestation_ids)
    ? req.body.contestation_ids.filter((n) => Number.isInteger(n) && n > 0)
    : [];
  const action = req.body?.action;
  if (ids.length === 0) return res.status(400).json({ error: 'contestation_ids required (non-empty integer array)' });
  if (action !== 'overturned' && action !== 'upheld') {
    return res.status(400).json({ error: "action must be 'overturned' or 'upheld'" });
  }

  const adminId = req.cvatUser.id;
  let tasksToDeleteOnCvat = [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(`
      SELECT id, cvat_task_id
      FROM ${table}
      WHERE id = ANY($1) AND resolved_at IS NULL
      FOR UPDATE
    `, [ids]);

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'no open contestations matched' });
    }

    const resolvedIds = rows.map((r) => r.id);
    const taskIds     = rows.map((r) => r.cvat_task_id);

    await client.query(`
      UPDATE ${table}
      SET resolution = $1, resolved_at = NOW(), resolved_by = $2
      WHERE id = ANY($3)
    `, [action, adminId, resolvedIds]);

    if (kind === 'media') {
      if (action === 'overturned') {
        // requalifie en validated, ne supprime pas les binaires
        await client.query(`
          UPDATE media_moderation
          SET status = 'validated', reviewed_by = $1, reviewed_at = NOW()
          WHERE cvat_task_id = ANY($2)
        `, [adminId, taskIds]);
      } else {
        tasksToDeleteOnCvat = taskIds;
      }
    } else if (kind === 'annotation') {
      if (action === 'overturned') {
        // rouvre la curation : le média redevient curateable, l'audit reste,
        // et l'attribution est remise à zéro pour que l'admin réattribue
        // (potentiellement à un autre curator pour un avis frais).
        await client.query(`
          UPDATE media_moderation
          SET curator_validated_at = NULL, curator_validated_by = NULL,
              assigned_curator_id = NULL, assigned_at = NULL, assigned_by = NULL
          WHERE cvat_task_id = ANY($1)
        `, [taskIds]);
      }
      // upheld → rien à faire côté média, juste résolution
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    client.release();
    return res.status(500).json({ error: err.message });
  }
  client.release();

  const deleteErrors = [];
  const successfullyCleaned = [];
  if (action === 'upheld' && tasksToDeleteOnCvat.length > 0) {
    for (const taskId of tasksToDeleteOnCvat) {
      try {
        await cvatDelete(`/tasks/${taskId}`);
        successfullyCleaned.push(taskId);
      } catch (err) {
        const status = err.response?.status;
        if (status === 404) {
          successfullyCleaned.push(taskId);
        } else {
          deleteErrors.push({ task_id: taskId, status, message: err.message });
          console.warn(`[admin/contestations] CVAT delete failed for task ${taskId}:`, err.response?.data ?? err.message);
        }
      }
    }
    if (successfullyCleaned.length > 0) {
      await pool.query(
        'UPDATE media_moderation SET binaries_deleted_at = NOW() WHERE cvat_task_id = ANY($1)',
        [successfullyCleaned],
      );
    }
  }

  recordAction(adminId, 'contestation.resolved', {
    payload: { kind, action, contestation_ids: ids, cvat_delete_errors: deleteErrors.length },
  });

  res.json({
    resolved:       ids.length,
    kind,
    action,
    cvat_delete_errors: deleteErrors.length > 0 ? deleteErrors : undefined,
  });
});

module.exports = router;
