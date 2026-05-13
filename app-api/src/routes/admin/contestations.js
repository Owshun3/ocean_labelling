'use strict';

const express = require('express');
const { pool } = require('../../db');
const { cvatGet, cvatDelete } = require('../../lib/cvatAdmin');

const router = express.Router();

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

router.get('/uploaders', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        mm.uploader_id,
        COUNT(*)                   AS contestation_count,
        MIN(c.created_at)          AS oldest_contestation,
        MAX(c.created_at)          AS newest_contestation
      FROM moderation_contestations c
      JOIN media_moderation         mm ON mm.cvat_task_id = c.cvat_task_id
      WHERE c.resolved_at IS NULL
      GROUP BY mm.uploader_id
      ORDER BY oldest_contestation ASC
    `);

    if (rows.length === 0) return res.json({ results: [] });

    const userIds  = rows.map((r) => r.uploader_id);
    const usersById = await fetchUsersByIds(userIds);
    const rolesById = await fetchAppRoles(userIds);

    const results = rows.map((r) => ({
      uploader_id:          r.uploader_id,
      username:             usersById[r.uploader_id]?.username || null,
      role:                 rolesById[r.uploader_id] || 'annotator',
      contestation_count:   Number(r.contestation_count),
      oldest_contestation:  r.oldest_contestation,
      newest_contestation:  r.newest_contestation,
    }));

    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/uploaders/:id', async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isFinite(userId)) return res.status(400).json({ error: 'invalid user id' });

  try {
    const { rows } = await pool.query(`
      SELECT
        c.id            AS contestation_id,
        c.cvat_task_id,
        c.message,
        c.created_at,
        c.contester_id,
        mm.reviewed_by  AS moderator_id,
        mm.reviewed_at  AS rejected_at,
        mm.review_comment AS rejection_reason
      FROM moderation_contestations c
      JOIN media_moderation         mm ON mm.cvat_task_id = c.cvat_task_id
      WHERE c.resolved_at IS NULL
        AND mm.uploader_id = $1
      ORDER BY c.created_at ASC
    `, [userId]);

    const userIdsToFetch = new Set([userId]);
    rows.forEach((r) => {
      if (r.moderator_id) userIdsToFetch.add(r.moderator_id);
    });
    const usersById = await fetchUsersByIds([...userIdsToFetch]);
    const rolesById = await fetchAppRoles([...userIdsToFetch]);

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
    } : { id: userId, username: null, email: null, is_active: null, role: 'annotator' };

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

      const moderator = r.moderator_id ? usersById[r.moderator_id] : null;
      const task = tasksById[r.cvat_task_id] || null;
      lot.items.push({
        contestation_id:   r.contestation_id,
        cvat_task_id:      r.cvat_task_id,
        contested_at:      r.created_at,
        rejected_at:       r.rejected_at,
        rejection_reason:  r.rejection_reason,
        task,
        moderator: moderator ? {
          id: moderator.id,
          username: moderator.username,
          role: rolesById[moderator.id] || 'annotator',
        } : null,
      });
    });

    const lots = Array.from(lotsByMessage.values())
      .sort((a, b) => new Date(a.first_contested_at) - new Date(b.first_contested_at));

    res.json({ uploader, lots });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/resolve', async (req, res) => {
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
      FROM moderation_contestations
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
      UPDATE moderation_contestations
      SET resolution = $1, resolved_at = NOW(), resolved_by = $2
      WHERE id = ANY($3)
    `, [action, adminId, resolvedIds]);

    if (action === 'overturned') {
      await client.query(`
        UPDATE media_moderation
        SET status = 'validated', reviewed_by = $1, reviewed_at = NOW()
        WHERE cvat_task_id = ANY($2)
      `, [adminId, taskIds]);
    } else {
      tasksToDeleteOnCvat = taskIds;
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    client.release();
    return res.status(500).json({ error: err.message });
  }
  client.release();

  const deleteErrors = [];
  if (action === 'upheld' && tasksToDeleteOnCvat.length > 0) {
    for (const taskId of tasksToDeleteOnCvat) {
      try {
        await cvatDelete(`/tasks/${taskId}`);
      } catch (err) {
        const status = err.response?.status;
        if (status !== 404) {
          deleteErrors.push({ task_id: taskId, status, message: err.message });
          console.warn(`[admin/contestations] CVAT delete failed for task ${taskId}:`, err.response?.data ?? err.message);
        }
      }
    }
  }

  res.json({
    resolved:       ids.length,
    action,
    cvat_delete_errors: deleteErrors.length > 0 ? deleteErrors : undefined,
  });
});

module.exports = router;
