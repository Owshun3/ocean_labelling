'use strict';

const express = require('express');
const axios   = require('axios');
const { pool } = require('../db');
const { requireModeratorOrAbove } = require('../middleware/auth');

const router = express.Router();
const CVAT   = process.env.CVAT_API_URL || 'http://cvat_server:8080/api';

let cachedAdminToken = null;

async function getAdminToken(forceRefresh = false) {
  if (cachedAdminToken && !forceRefresh) return cachedAdminToken;
  const resp = await axios.post(`${CVAT}/auth/login`, {
    username: process.env.CVAT_ADMIN_USER || 'admin',
    password: process.env.CVAT_ADMIN_PASS,
  }, { headers: { Host: 'localhost' } });
  cachedAdminToken = resp.data.key;
  return cachedAdminToken;
}

function adminHeaders(token) {
  return {
    Authorization: `Token ${token}`,
    Accept: 'application/vnd.cvat+json',
    'Content-Type': 'application/json',
    Host: 'localhost',
  };
}

async function cvatGet(path, token) {
  try {
    return await axios.get(`${CVAT}${path}`, { headers: adminHeaders(token) });
  } catch (err) {
    if (err.response?.status === 401) {
      const fresh = await getAdminToken(true);
      return axios.get(`${CVAT}${path}`, { headers: adminHeaders(fresh) });
    }
    throw err;
  }
}

async function cvatPatch(path, body, token) {
  try {
    return await axios.patch(`${CVAT}${path}`, body, { headers: adminHeaders(token) });
  } catch (err) {
    if (err.response?.status === 401) {
      const fresh = await getAdminToken(true);
      return axios.patch(`${CVAT}${path}`, body, { headers: adminHeaders(fresh) });
    }
    throw err;
  }
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

router.get('/bans/check', async (req, res) => {
  const username = String(req.query.username || '').trim();
  if (!username) return res.status(400).json({ error: 'username required' });
  try {
    const token = await getAdminToken();
    const usersResp = await cvatGet(`/users?search=${encodeURIComponent(username)}&page_size=20`, token);
    const user = (usersResp.data.results || []).find((u) => u.username === username);
    if (!user) return res.json({ banned: false });

    const { rows } = await pool.query(`
      SELECT reason, expires_at, banned_at
      FROM user_bans
      WHERE cvat_user_id = $1
        AND banned_at <= NOW()
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY banned_at DESC
      LIMIT 1
    `, [user.id]);

    if (rows.length === 0) return res.json({ banned: false });

    res.json({
      banned: true,
      reason: rows[0].reason,
      expires_at: rows[0].expires_at,
      banned_at: rows[0].banned_at,
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.get('/queue', requireModeratorOrAbove, async (_req, res) => {
  try {
    const { rows: entries } = await pool.query(`
      SELECT mm.cvat_task_id, mm.uploader_id, mm.created_at
      FROM media_moderation mm
      WHERE mm.status = 'pending'
        AND NOT EXISTS (
          SELECT 1 FROM user_bans ub
          WHERE ub.cvat_user_id = mm.uploader_id
            AND ub.banned_at <= NOW()
            AND (ub.expires_at IS NULL OR ub.expires_at > NOW())
        )
      ORDER BY mm.created_at ASC
    `);

    if (entries.length === 0) return res.json({ results: [] });

    const token = await getAdminToken();
    const allTaskIds = entries.map((e) => e.cvat_task_id);
    const tasksResp = await cvatGet(`/tasks?id__in=${allTaskIds.join(',')}&page_size=${allTaskIds.length}`, token);
    const validTaskIds = new Set((tasksResp.data.results || []).map((t) => t.id));

    const orphans = allTaskIds.filter((id) => !validTaskIds.has(id));
    if (orphans.length > 0) {
      await pool.query(`
        UPDATE media_moderation
        SET status = 'rejected',
            review_comment = COALESCE(review_comment, 'Auto-rejeté : tâche CVAT introuvable'),
            reviewed_at = NOW()
        WHERE cvat_task_id = ANY($1) AND status = 'pending'
      `, [orphans]);
    }

    const validEntries = entries.filter((e) => validTaskIds.has(e.cvat_task_id));
    if (validEntries.length === 0) return res.json({ results: [] });

    const grouped = new Map();
    for (const e of validEntries) {
      const g = grouped.get(e.uploader_id);
      if (g) {
        g.pending_count += 1;
        if (e.created_at < g.oldest) g.oldest = e.created_at;
      } else {
        grouped.set(e.uploader_id, { uploader_id: e.uploader_id, pending_count: 1, oldest: e.created_at });
      }
    }
    const grouping = Array.from(grouped.values()).sort((a, b) => new Date(a.oldest) - new Date(b.oldest));
    const userIds = grouping.map((g) => g.uploader_id);

    const usersById = {};
    await Promise.all(userIds.map(async (id) => {
      try {
        const resp = await cvatGet(`/users/${id}`, token);
        usersById[id] = resp.data;
      } catch (_) {}
    }));

    const rolesById = await fetchAppRoles(userIds);

    const results = grouping.map((g) => ({
      uploader_id: g.uploader_id,
      username: usersById[g.uploader_id]?.username || null,
      role: rolesById[g.uploader_id] || 'annotator',
      pending_count: g.pending_count,
      oldest: g.oldest,
    }));

    res.json({ results });
  } catch (err) {
    res.status(err.response?.status ?? 502).json({ error: err.response?.data ?? err.message });
  }
});

router.get('/media/:taskId/preview', requireModeratorOrAbove, async (req, res) => {
  const taskId = Number(req.params.taskId);
  if (!Number.isFinite(taskId)) return res.status(400).json({ error: 'invalid taskId' });
  try {
    const token = await getAdminToken();
    const cvatResp = await axios.get(`${CVAT}/tasks/${taskId}/preview`, {
      headers: adminHeaders(token),
      responseType: 'arraybuffer',
    });
    res.setHeader('Content-Type', cvatResp.headers['content-type'] || 'image/jpeg');
    res.send(Buffer.from(cvatResp.data));
  } catch (err) {
    res.status(err.response?.status ?? 502).json({ error: err.message });
  }
});

router.get('/media/:taskId/frame', requireModeratorOrAbove, async (req, res) => {
  const taskId = Number(req.params.taskId);
  if (!Number.isFinite(taskId)) return res.status(400).json({ error: 'invalid taskId' });
  const number  = Number.isFinite(Number(req.query.number)) ? Number(req.query.number) : 0;
  const quality = req.query.quality === 'compressed' ? 'compressed' : 'original';
  try {
    const token = await getAdminToken();
    const cvatResp = await axios.get(`${CVAT}/tasks/${taskId}/data`, {
      params: { type: 'frame', number, quality },
      headers: adminHeaders(token),
      responseType: 'arraybuffer',
    });
    res.setHeader('Content-Type', cvatResp.headers['content-type'] || 'image/jpeg');
    res.send(Buffer.from(cvatResp.data));
  } catch (err) {
    res.status(err.response?.status ?? 502).json({ error: err.message });
  }
});

router.get('/users/:id/media', requireModeratorOrAbove, async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isFinite(userId)) return res.status(400).json({ error: 'invalid user id' });

  try {
    const { rows } = await pool.query(`
      SELECT cvat_task_id, created_at
      FROM media_moderation
      WHERE uploader_id = $1 AND status = 'pending'
      ORDER BY created_at ASC
    `, [userId]);

    const token = await getAdminToken();
    const userResp = await cvatGet(`/users/${userId}`, token);
    const rolesById = await fetchAppRoles([userId]);

    const userPayload = {
      id: userResp.data.id,
      username: userResp.data.username,
      email: userResp.data.email,
      role: rolesById[userId] || 'annotator',
      is_active: userResp.data.is_active,
      date_joined: userResp.data.date_joined,
    };

    if (rows.length === 0) return res.json({ user: userPayload, results: [] });

    const ids = rows.map((r) => r.cvat_task_id);
    const tasksResp = await cvatGet(`/tasks?id__in=${ids.join(',')}&page_size=${ids.length}`, token);
    const tasksById = {};
    (tasksResp.data.results || []).forEach((t) => { tasksById[t.id] = t; });

    const orphans = ids.filter((id) => !tasksById[id]);
    if (orphans.length > 0) {
      await pool.query(`
        UPDATE media_moderation
        SET status = 'rejected',
            review_comment = COALESCE(review_comment, 'Auto-rejeté : tâche CVAT introuvable'),
            reviewed_at = NOW()
        WHERE cvat_task_id = ANY($1) AND status = 'pending'
      `, [orphans]);
    }

    const results = rows
      .map((r) => ({
        cvat_task_id: r.cvat_task_id,
        submitted_at: r.created_at,
        task: tasksById[r.cvat_task_id] || null,
      }))
      .filter((r) => r.task);

    res.json({ user: userPayload, results });
  } catch (err) {
    res.status(err.response?.status ?? 502).json({ error: err.response?.data ?? err.message });
  }
});

router.get('/media/:taskId', requireModeratorOrAbove, async (req, res) => {
  const taskId = Number(req.params.taskId);
  if (!Number.isFinite(taskId)) return res.status(400).json({ error: 'invalid task id' });

  try {
    const { rows } = await pool.query(
      'SELECT * FROM media_moderation WHERE cvat_task_id = $1',
      [taskId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'media not found' });

    const token = await getAdminToken();
    const [taskResp, userResp] = await Promise.all([
      cvatGet(`/tasks/${taskId}`, token),
      cvatGet(`/users/${rows[0].uploader_id}`, token),
    ]);
    const rolesById = await fetchAppRoles([rows[0].uploader_id]);

    res.json({
      moderation: rows[0],
      task: taskResp.data,
      uploader: {
        id: userResp.data.id,
        username: userResp.data.username,
        email: userResp.data.email,
        role: rolesById[rows[0].uploader_id] || 'annotator',
        is_active: userResp.data.is_active,
        date_joined: userResp.data.date_joined,
      },
    });
  } catch (err) {
    res.status(err.response?.status ?? 502).json({ error: err.response?.data ?? err.message });
  }
});

router.post('/media/validate', requireModeratorOrAbove, async (req, res) => {
  const ids = Array.isArray(req.body?.ids)
    ? req.body.ids.filter((n) => Number.isInteger(n) && n > 0)
    : [];
  if (ids.length === 0) return res.status(400).json({ error: 'ids required (non-empty integer array)' });

  try {
    const { rowCount } = await pool.query(`
      UPDATE media_moderation
      SET status = 'validated', reviewed_by = $1, reviewed_at = NOW(), review_comment = NULL
      WHERE cvat_task_id = ANY($2) AND status = 'pending'
    `, [req.cvatUser.id, ids]);
    res.json({ updated: rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/media/reject', requireModeratorOrAbove, async (req, res) => {
  const ids = Array.isArray(req.body?.ids)
    ? req.body.ids.filter((n) => Number.isInteger(n) && n > 0)
    : [];
  const comment = typeof req.body?.comment === 'string' ? req.body.comment.slice(0, 1000) : null;
  if (ids.length === 0) return res.status(400).json({ error: 'ids required (non-empty integer array)' });

  try {
    const { rowCount } = await pool.query(`
      UPDATE media_moderation
      SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), review_comment = $2
      WHERE cvat_task_id = ANY($3) AND status = 'pending'
    `, [req.cvatUser.id, comment, ids]);
    res.json({ updated: rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/users/:id/ban', requireModeratorOrAbove, async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isFinite(userId)) return res.status(400).json({ error: 'invalid user id' });

  const durationDays = req.body?.duration_days;
  let expiresAt = null;
  if (durationDays !== null && durationDays !== undefined) {
    if (!Number.isFinite(durationDays) || durationDays <= 0) {
      return res.status(400).json({ error: 'duration_days must be a positive number or null' });
    }
    expiresAt = new Date(Date.now() + durationDays * 86400 * 1000).toISOString();
  }
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 1000) : null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      INSERT INTO user_bans (cvat_user_id, banned_by, reason, expires_at)
      VALUES ($1, $2, $3, $4)
    `, [userId, req.cvatUser.id, reason, expiresAt]);

    await client.query(`
      UPDATE media_moderation
      SET status = 'rejected',
          reviewed_by = $1,
          reviewed_at = NOW(),
          review_comment = COALESCE(review_comment, 'Auto-rejeté : utilisateur banni')
      WHERE uploader_id = $2 AND status = 'pending'
    `, [req.cvatUser.id, userId]);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    client.release();
    return res.status(500).json({ error: err.message });
  }
  client.release();

  let cvatDeactivated = false;
  try {
    const token = await getAdminToken();
    await cvatPatch(`/users/${userId}`, { is_active: false }, token);
    cvatDeactivated = true;
  } catch (err) {
    console.warn(`[moderation] failed to deactivate CVAT user ${userId}:`, err.response?.data ?? err.message);
  }

  res.json({ ok: true, expires_at: expiresAt, cvat_deactivated: cvatDeactivated });
});

module.exports = router;
