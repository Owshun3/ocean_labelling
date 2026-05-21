'use strict';

const express = require('express');
const axios   = require('axios');
const { pool } = require('../db');
const { requireAuth, requireModeratorOrAbove } = require('../middleware/auth');
const { recordAction } = require('../lib/auditLog');
const { fetchActionsTotals } = require('../lib/userStats');
const { fetchAppRole } = require('../middleware/auth');
const { assertCanSanction } = require('../lib/permissions');

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

function normalizeItems(body) {
  const out = { image: [], video: [] };
  const items = Array.isArray(body?.items) ? body.items : null;
  if (items) {
    for (const it of items) {
      if (!it || !Number.isInteger(it.id) || it.id <= 0) continue;
      if (it.kind === 'image' || it.kind === 'video') out[it.kind].push(it.id);
    }
    return out;
  }
  const legacy = Array.isArray(body?.ids) ? body.ids : null;
  if (legacy) out.image = legacy.filter((n) => Number.isInteger(n) && n > 0);
  return out;
}

router.get('/bans/check', async (req, res) => {
  const username = String(req.query.username || '').trim();
  if (!username) return res.status(400).json({ error: 'username required' });
  try {
    const token = await getAdminToken();
    const usersResp = await cvatGet(`/users?search=${encodeURIComponent(username)}&page_size=20`, token);
    const user = (usersResp.data.results || []).find((u) => u.username === username);
    if (!user) return res.json({ banned: false });

    const { rows: bans } = await pool.query(`
      SELECT reason, expires_at, banned_at, released_at
      FROM user_bans
      WHERE cvat_user_id = $1
      ORDER BY banned_at DESC
      LIMIT 1
    `, [user.id]);

    const lastBan = bans[0] || null;
    const now = new Date();
    const isActive = lastBan
      && !lastBan.released_at
      && new Date(lastBan.banned_at) <= now
      && (!lastBan.expires_at || new Date(lastBan.expires_at) > now);

    if (isActive) {
      return res.json({
        banned: true,
        reason: lastBan.reason,
        expires_at: lastBan.expires_at,
        banned_at: lastBan.banned_at,
      });
    }

    if (!user.is_active && lastBan && !lastBan.released_at && lastBan.expires_at && new Date(lastBan.expires_at) <= now) {
      try {
        await cvatPatch(`/users/${user.id}`, { is_active: true }, token);
      } catch (err) {
        console.warn(`[moderation] lazy reactivate ${user.id} failed:`, err.response?.data ?? err.message);
      }
      return res.json({ banned: false, deactivated: false });
    }

    if (!user.is_active) {
      return res.json({ banned: false, deactivated: true });
    }

    res.json({ banned: false, deactivated: false });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.post('/contest', requireAuth, async (req, res) => {
  const { image: imageIds, video: videoIds } = normalizeItems(req.body);
  const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 2000) : '';
  if (imageIds.length + videoIds.length === 0) return res.status(400).json({ error: 'items required' });
  if (!message) return res.status(400).json({ error: 'message required' });

  try {
    const eligible = { image: [], video: [] };

    if (imageIds.length) {
      const { rows } = await pool.query(`
        SELECT cvat_task_id FROM media_moderation
        WHERE cvat_task_id = ANY($1) AND media_kind = 'image'
          AND uploader_id = $2 AND status = 'rejected'
      `, [imageIds, req.cvatUser.id]);
      eligible.image = rows.map((r) => r.cvat_task_id);
    }
    if (videoIds.length) {
      const { rows } = await pool.query(`
        SELECT video_id FROM media_moderation
        WHERE video_id = ANY($1) AND media_kind = 'video'
          AND uploader_id = $2 AND status = 'rejected'
      `, [videoIds, req.cvatUser.id]);
      eligible.video = rows.map((r) => r.video_id);
    }

    // Tout-ou-rien : si un id n'est pas éligible (non rejeté ou non propriétaire),
    // on refuse l'ensemble pour ne pas créer silencieusement une contestation
    // partielle sur une sélection mixte.
    const ineligibleImages = imageIds.filter((id) => !eligible.image.includes(id));
    const ineligibleVideos = videoIds.filter((id) => !eligible.video.includes(id));
    if (ineligibleImages.length || ineligibleVideos.length) {
      return res.status(403).json({
        error: 'Tous les médias sélectionnés doivent être rejetés et t\'appartenir. Vérifie ta sélection.',
        ineligible: { image: ineligibleImages, video: ineligibleVideos },
      });
    }

    const already = { image: new Set(), video: new Set() };
    if (eligible.image.length) {
      const { rows } = await pool.query(
        `SELECT DISTINCT cvat_task_id FROM moderation_contestations
         WHERE media_kind = 'image' AND cvat_task_id = ANY($1)`,
        [eligible.image],
      );
      rows.forEach((r) => already.image.add(r.cvat_task_id));
    }
    if (eligible.video.length) {
      const { rows } = await pool.query(
        `SELECT DISTINCT video_id FROM moderation_contestations
         WHERE media_kind = 'video' AND video_id = ANY($1)`,
        [eligible.video],
      );
      rows.forEach((r) => already.video.add(r.video_id));
    }

    const toCreate = {
      image: eligible.image.filter((id) => !already.image.has(id)),
      video: eligible.video.filter((id) => !already.video.has(id)),
    };
    const totalCreate = toCreate.image.length + toCreate.video.length;
    if (totalCreate === 0) {
      return res.status(409).json({ error: 'Tous les médias sélectionnés ont déjà été contestés.' });
    }

    await Promise.all([
      ...toCreate.image.map((id) => pool.query(
        `INSERT INTO moderation_contestations (media_kind, cvat_task_id, contester_id, message)
         VALUES ('image', $1, $2, $3)`,
        [id, req.cvatUser.id, message],
      )),
      ...toCreate.video.map((id) => pool.query(
        `INSERT INTO moderation_contestations (media_kind, video_id, contester_id, message)
         VALUES ('video', $1, $2, $3)`,
        [id, req.cvatUser.id, message],
      )),
    ]);

    res.json({
      created: totalCreate,
      already_contested: already.image.size + already.video.size,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/my-statuses', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT media_kind, cvat_task_id, video_id, status, review_comment, reviewed_at
      FROM media_moderation
      WHERE uploader_id = $1
      ORDER BY created_at DESC
      LIMIT 500
    `, [req.cvatUser.id]);
    res.json({ results: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/queue', requireModeratorOrAbove, async (_req, res) => {
  try {
    const { rows: entries } = await pool.query(`
      SELECT mm.media_kind, mm.cvat_task_id, mm.video_id, mm.uploader_id, mm.created_at
      FROM media_moderation mm
      WHERE mm.status = 'pending'
        AND NOT EXISTS (
          SELECT 1 FROM user_bans ub
          WHERE ub.cvat_user_id = mm.uploader_id
            AND ub.released_at IS NULL
            AND ub.banned_at <= NOW()
            AND (ub.expires_at IS NULL OR ub.expires_at > NOW())
        )
      ORDER BY mm.created_at ASC
    `);
    if (entries.length === 0) return res.json({ results: [] });

    const token = await getAdminToken();
    const imageTaskIds = entries.filter((e) => e.media_kind === 'image').map((e) => e.cvat_task_id);
    const videoIds     = entries.filter((e) => e.media_kind === 'video').map((e) => e.video_id);

    const validTaskIds = new Set();
    await Promise.all(imageTaskIds.map(async (id) => {
      try { await cvatGet(`/tasks/${id}`, token); validTaskIds.add(id); }
      catch (err) { if (err.response?.status !== 404) console.warn(`[moderation] queue task ${id}:`, err.message); }
    }));

    const validVideoIds = new Set();
    if (videoIds.length) {
      const { rows } = await pool.query(
        'SELECT id FROM user_videos WHERE id = ANY($1) AND deleted_at IS NULL',
        [videoIds],
      );
      rows.forEach((r) => validVideoIds.add(r.id));
    }

    const validEntries = entries.filter((e) =>
      e.media_kind === 'image' ? validTaskIds.has(e.cvat_task_id) : validVideoIds.has(e.video_id)
    );
    if (validEntries.length === 0) return res.json({ results: [] });

    const grouped = new Map();
    for (const e of validEntries) {
      const g = grouped.get(e.uploader_id);
      if (g) {
        g.pending_count += 1;
        if (e.media_kind === 'video') g.video_count += 1; else g.image_count += 1;
        if (e.created_at < g.oldest) g.oldest = e.created_at;
      } else {
        grouped.set(e.uploader_id, {
          uploader_id: e.uploader_id,
          pending_count: 1,
          image_count: e.media_kind === 'image' ? 1 : 0,
          video_count: e.media_kind === 'video' ? 1 : 0,
          oldest: e.created_at,
        });
      }
    }
    const grouping = Array.from(grouped.values()).sort((a, b) => new Date(a.oldest) - new Date(b.oldest));
    const userIds = grouping.map((g) => g.uploader_id);

    const usersById = {};
    await Promise.all(userIds.map(async (id) => {
      try { const resp = await cvatGet(`/users/${id}`, token); usersById[id] = resp.data; }
      catch (_) {}
    }));
    const rolesById = await fetchAppRoles(userIds);

    const results = grouping.map((g) => ({
      uploader_id: g.uploader_id,
      username: usersById[g.uploader_id]?.username || null,
      role: rolesById[g.uploader_id] || 'annotator',
      pending_count: g.pending_count,
      image_count: g.image_count,
      video_count: g.video_count,
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
      SELECT media_kind, cvat_task_id, video_id, created_at
      FROM media_moderation
      WHERE uploader_id = $1 AND status = 'pending'
      ORDER BY created_at ASC
    `, [userId]);

    const token = await getAdminToken();
    const userResp = await cvatGet(`/users/${userId}`, token);
    const rolesById = await fetchAppRoles([userId]);
    const actionsTotals = await fetchActionsTotals([userId]);
    const userPayload = {
      id: userResp.data.id,
      username: userResp.data.username,
      email: userResp.data.email,
      role: rolesById[userId] || 'annotator',
      is_active: userResp.data.is_active,
      is_superuser: !!userResp.data.is_superuser,
      is_staff:     !!userResp.data.is_staff,
      date_joined: userResp.data.date_joined,
      actions_validated_total: actionsTotals[userId] ?? 0,
    };

    if (rows.length === 0) return res.json({ user: userPayload, results: [] });

    const imageIds = rows.filter((r) => r.media_kind === 'image').map((r) => r.cvat_task_id);
    const videoIds = rows.filter((r) => r.media_kind === 'video').map((r) => r.video_id);

    const tasksById = {};
    await Promise.all(imageIds.map(async (id) => {
      try { const r = await cvatGet(`/tasks/${id}`, token); tasksById[id] = r.data; }
      catch (err) { if (err.response?.status !== 404) console.warn(`[moderation] task ${id}:`, err.message); }
    }));

    let videosById = {};
    if (videoIds.length) {
      const { rows: vs } = await pool.query(
        `SELECT id, filename, content_type, size_bytes, duration_seconds, width, height, has_poster, uploaded_at
         FROM user_videos WHERE id = ANY($1) AND deleted_at IS NULL`,
        [videoIds],
      );
      videosById = Object.fromEntries(vs.map((v) => [v.id, v]));
    }

    const results = rows
      .map((r) => r.media_kind === 'image'
        ? {
            kind: 'image',
            cvat_task_id: r.cvat_task_id,
            submitted_at: r.created_at,
            task: tasksById[r.cvat_task_id] || null,
          }
        : {
            kind: 'video',
            video_id: r.video_id,
            submitted_at: r.created_at,
            video: videosById[r.video_id] || null,
          })
      .filter((r) => (r.kind === 'image' ? r.task : r.video));

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
      "SELECT * FROM media_moderation WHERE media_kind='image' AND cvat_task_id = $1",
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

router.get('/video/:videoId', requireModeratorOrAbove, async (req, res) => {
  const videoId = Number(req.params.videoId);
  if (!Number.isFinite(videoId)) return res.status(400).json({ error: 'invalid video id' });

  try {
    const { rows: mmRows } = await pool.query(
      "SELECT * FROM media_moderation WHERE media_kind='video' AND video_id = $1",
      [videoId],
    );
    if (mmRows.length === 0) return res.status(404).json({ error: 'media not found' });
    const moderation = mmRows[0];

    const { rows: videoRows } = await pool.query(
      'SELECT * FROM user_videos WHERE id = $1 AND deleted_at IS NULL',
      [videoId],
    );
    if (videoRows.length === 0) return res.status(404).json({ error: 'video not found' });

    const token = await getAdminToken();
    const userResp = await cvatGet(`/users/${moderation.uploader_id}`, token);
    const rolesById = await fetchAppRoles([moderation.uploader_id]);

    res.json({
      moderation,
      video: videoRows[0],
      uploader: {
        id: userResp.data.id,
        username: userResp.data.username,
        email: userResp.data.email,
        role: rolesById[moderation.uploader_id] || 'annotator',
        is_active: userResp.data.is_active,
        date_joined: userResp.data.date_joined,
      },
    });
  } catch (err) {
    res.status(err.response?.status ?? 502).json({ error: err.response?.data ?? err.message });
  }
});

router.post('/media/validate', requireModeratorOrAbove, async (req, res) => {
  const { image: imageIds, video: videoIds } = normalizeItems(req.body);
  if (imageIds.length + videoIds.length === 0) return res.status(400).json({ error: 'items required' });

  const client = await pool.connect();
  let updated = 0;
  try {
    await client.query('BEGIN');
    if (imageIds.length) {
      const r = await client.query(`
        UPDATE media_moderation
        SET status='validated', reviewed_by=$1, reviewed_at=NOW(), review_comment=NULL
        WHERE media_kind='image' AND cvat_task_id = ANY($2) AND status='pending'
      `, [req.cvatUser.id, imageIds]);
      updated += r.rowCount;
    }
    if (videoIds.length) {
      const r = await client.query(`
        UPDATE media_moderation
        SET status='validated', reviewed_by=$1, reviewed_at=NOW(), review_comment=NULL
        WHERE media_kind='video' AND video_id = ANY($2) AND status='pending'
      `, [req.cvatUser.id, videoIds]);
      updated += r.rowCount;
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    client.release();
    return res.status(500).json({ error: err.message });
  }
  client.release();

  if (updated > 0) recordAction(req.cvatUser.id, 'media.validated', {
    payload: { image_ids: imageIds, video_ids: videoIds, count: updated },
  });
  res.json({ updated });
});

router.post('/media/reject', requireModeratorOrAbove, async (req, res) => {
  const { image: imageIds, video: videoIds } = normalizeItems(req.body);
  const rawComment = typeof req.body?.comment === 'string' ? req.body.comment.trim() : '';
  if (imageIds.length + videoIds.length === 0) return res.status(400).json({ error: 'items required' });
  if (!rawComment) return res.status(400).json({ error: 'Un motif de rejet est obligatoire.' });
  const comment = rawComment.slice(0, 1000);

  const client = await pool.connect();
  let updated = 0;
  try {
    await client.query('BEGIN');
    if (imageIds.length) {
      const r = await client.query(`
        UPDATE media_moderation
        SET status='rejected', reviewed_by=$1, reviewed_at=NOW(), review_comment=$2
        WHERE media_kind='image' AND cvat_task_id = ANY($3) AND status='pending'
      `, [req.cvatUser.id, comment, imageIds]);
      updated += r.rowCount;
    }
    if (videoIds.length) {
      const r = await client.query(`
        UPDATE media_moderation
        SET status='rejected', reviewed_by=$1, reviewed_at=NOW(), review_comment=$2
        WHERE media_kind='video' AND video_id = ANY($3) AND status='pending'
      `, [req.cvatUser.id, comment, videoIds]);
      updated += r.rowCount;
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    client.release();
    return res.status(500).json({ error: err.message });
  }
  client.release();

  if (updated > 0) recordAction(req.cvatUser.id, 'media.rejected', {
    payload: { image_ids: imageIds, video_ids: videoIds, count: updated, reason: comment },
  });
  res.json({ updated });
});

async function assertSanctionAllowed(actorCvatUser, targetUserId, actionLabel) {
  const actorRole  = actorCvatUser.is_superuser ? 'admin' : await fetchAppRole(actorCvatUser.id);
  const targetCvat = await cvatGet(`/users/${targetUserId}`, await getAdminToken());
  const targetRole = (targetCvat.data?.is_superuser || targetCvat.data?.is_staff)
    ? 'admin'
    : await fetchAppRole(targetUserId);

  assertCanSanction(
    { id: actorCvatUser.id, role: actorRole, is_superuser: !!actorCvatUser.is_superuser, is_staff: !!actorCvatUser.is_staff },
    { id: targetUserId, role: targetRole, is_superuser: !!targetCvat.data?.is_superuser, is_staff: !!targetCvat.data?.is_staff },
    actionLabel,
  );
}

router.post('/users/:id/ban', requireModeratorOrAbove, async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isFinite(userId)) return res.status(400).json({ error: 'invalid user id' });

  try {
    await assertSanctionAllowed(req.cvatUser, userId, 'bannir');
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    return res.status(500).json({ error: err.message });
  }

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

  recordAction(req.cvatUser.id, 'user.banned', {
    targetType: 'user', targetId: userId,
    payload: { duration_days: durationDays ?? null, expires_at: expiresAt, reason },
  });

  res.json({ ok: true, expires_at: expiresAt, cvat_deactivated: cvatDeactivated });
});

module.exports = router;
