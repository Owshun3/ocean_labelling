'use strict';

const express = require('express');
const axios = require('axios');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const CVAT = process.env.CVAT_API_URL || 'http://cvat_server:8080/api';

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

async function cvatPut(path, body, token) {
  try {
    return await axios.put(`${CVAT}${path}`, body, { headers: adminHeaders(token) });
  } catch (err) {
    if (err.response?.status === 401) {
      const fresh = await getAdminToken(true);
      return axios.put(`${CVAT}${path}`, body, { headers: adminHeaders(fresh) });
    }
    throw err;
  }
}

async function ensureJobAccess(jobId, cvatUser, token) {
  const jobResp = await cvatGet(`/jobs/${jobId}`, token);
  const job = jobResp.data;
  if (job.assignee?.id !== cvatUser.id) {
    const err = new Error('Tu n\'es pas assigné à ce job.');
    err.statusCode = 403;
    throw err;
  }
  return { job };
}

router.post('/labels/sync', requireAuth, async (req, res) => {
  const taskId = Number(req.body?.task_id);
  const names  = Array.isArray(req.body?.names)
    ? Array.from(new Set(req.body.names.filter((n) => typeof n === 'string' && n.trim().length > 0).map((n) => n.trim())))
    : [];
  if (!Number.isFinite(taskId)) return res.status(400).json({ error: 'task_id required' });
  if (names.length === 0)       return res.status(400).json({ error: 'names required (non-empty array)' });

  try {
    const token = await getAdminToken();

    const existingResp = await cvatGet(`/labels?task_id=${taskId}&page_size=200`, token);
    const existing = existingResp.data.results || [];
    const byName = new Map();
    existing.forEach((l) => byName.set(l.name, l.id));

    const missing = names.filter((n) => !byName.has(n));
    if (missing.length > 0) {
      await cvatPatch(`/tasks/${taskId}`, {
        labels: missing.map((name) => ({ name })),
      }, token);

      const refreshed = await cvatGet(`/labels?task_id=${taskId}&page_size=200`, token);
      (refreshed.data.results || []).forEach((l) => byName.set(l.name, l.id));
    }

    const mapping = {};
    names.forEach((n) => { if (byName.has(n)) mapping[n] = byName.get(n); });
    const unresolved = names.filter((n) => !(n in mapping));
    if (unresolved.length > 0) {
      return res.status(502).json({ error: `Labels non résolus côté CVAT : ${unresolved.join(', ')}` });
    }

    res.json({ mapping });
  } catch (err) {
    res.status(err.response?.status ?? 502).json({ error: err.response?.data ?? err.message });
  }
});

router.get('/tasks/:taskId/preview', requireAuth, async (req, res) => {
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

async function fetchTaskJobs(taskId, token) {
  const resp = await cvatGet(`/jobs?task_id=${taskId}&page_size=50`, token);
  return resp.data.results ?? [];
}

async function countShapesInJob(jobId, token) {
  try {
    const resp = await cvatGet(`/jobs/${jobId}/annotations`, token);
    return (resp.data?.shapes ?? []).length;
  } catch {
    return 0;
  }
}

router.get('/feed', requireAuth, async (req, res) => {
  const me = req.cvatUser.id;
  try {
    const { rows } = await pool.query(`
      SELECT cvat_task_id, uploader_id, status, created_at, curator_validated_at
      FROM media_moderation
      WHERE uploader_id = $1 OR status = 'validated'
    `, [me]);
    if (rows.length === 0) return res.json({ own: [], community: [] });

    const taskIds = rows.map((r) => r.cvat_task_id);
    const token = await getAdminToken();
    const tasksById = new Map();
    await Promise.all(taskIds.map(async (id) => {
      try {
        const r = await cvatGet(`/tasks/${id}`, token);
        tasksById.set(id, r.data);
      } catch (err) {
        if (err.response?.status !== 404) {
          console.warn(`[studio] failed to fetch task ${id}:`, err.message);
        }
      }
    }));

    const jobsByTask = new Map();
    await Promise.all(Array.from(tasksById.keys()).map(async (id) => {
      try { jobsByTask.set(id, await fetchTaskJobs(id, token)); }
      catch { jobsByTask.set(id, []); }
    }));

    const ownRows = rows.filter((r) => r.uploader_id === me && tasksById.has(r.cvat_task_id));
    const myShapesCounts = new Map();
    await Promise.all(ownRows.map(async (row) => {
      const jobs = jobsByTask.get(row.cvat_task_id) ?? [];
      const myJob = jobs.find((j) => j.assignee?.id === me);
      if (!myJob) { myShapesCounts.set(row.cvat_task_id, 0); return; }
      myShapesCounts.set(row.cvat_task_id, await countShapesInJob(myJob.id, token));
    }));

    const own = [];
    const community = [];

    for (const row of rows) {
      const task = tasksById.get(row.cvat_task_id);
      if (!task) continue;
      const jobs = jobsByTask.get(row.cvat_task_id) ?? [];
      const completed = jobs.filter((j) => j.state === 'completed').length;
      const myAssigned = jobs.find((j) => j.assignee?.id === me) ?? null;
      const freeJobs = jobs.filter((j) => !j.assignee && j.state !== 'completed');

      let annotationState = 'not_annotated';
      if (row.uploader_id === me) {
        if (row.curator_validated_at) annotationState = 'curator_validated';
        else if ((myShapesCounts.get(row.cvat_task_id) ?? 0) > 0) annotationState = 'annotated';
      }

      const summary = {
        cvat_task_id: row.cvat_task_id,
        name: task.name,
        created_date: task.created_date,
        moderation_status: row.status,
        jobs_count: jobs.length,
        completed_count: completed,
        my_job_id: myAssigned?.id ?? null,
        my_job_state: myAssigned?.state ?? null,
        free_job_count: freeJobs.length,
        annotation_state: annotationState,
      };

      if (row.uploader_id === me) {
        own.push(summary);
      } else if (row.status === 'validated' && (myAssigned || freeJobs.length > 0)) {
        community.push(summary);
      }
    }

    own.sort((a, b) => a.completed_count - b.completed_count
      || new Date(b.created_date) - new Date(a.created_date));
    community.sort((a, b) => a.completed_count - b.completed_count
      || new Date(b.created_date) - new Date(a.created_date));

    res.json({ own, community });
  } catch (err) {
    res.status(err.response?.status ?? 502).json({ error: err.response?.data ?? err.message });
  }
});

router.post('/claim', requireAuth, async (req, res) => {
  const taskId = Number(req.body?.task_id);
  if (!Number.isFinite(taskId)) return res.status(400).json({ error: 'task_id required' });
  const me = req.cvatUser.id;

  try {
    const { rows } = await pool.query(
      'SELECT uploader_id, status FROM media_moderation WHERE cvat_task_id = $1',
      [taskId],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'task not found' });
    const row = rows[0];
    const eligible = row.uploader_id === me || row.status === 'validated';
    if (!eligible) return res.status(403).json({ error: 'Tu ne peux pas annoter ce média.' });

    const token = await getAdminToken();
    const jobs = await fetchTaskJobs(taskId, token);
    const mine = jobs.find((j) => j.assignee?.id === me);
    if (mine) return res.json({ jobId: mine.id, alreadyClaimed: true });

    const free = jobs.find((j) => !j.assignee && j.state !== 'completed');
    if (!free) return res.status(409).json({ error: 'Tous les jobs de ce média sont déjà pris.' });

    await cvatPatch(`/jobs/${free.id}`, { assignee: me }, token);
    res.json({ jobId: free.id, alreadyClaimed: false });
  } catch (err) {
    res.status(err.response?.status ?? 502).json({ error: err.response?.data ?? err.message });
  }
});

router.get('/jobs/:jobId/annotations', requireAuth, async (req, res) => {
  const jobId = Number(req.params.jobId);
  if (!Number.isFinite(jobId)) return res.status(400).json({ error: 'invalid jobId' });
  try {
    const token = await getAdminToken();
    const { job } = await ensureJobAccess(jobId, req.cvatUser, token);

    const [annotResp, labelsResp] = await Promise.all([
      cvatGet(`/jobs/${jobId}/annotations`, token),
      cvatGet(`/labels?task_id=${job.task_id}&page_size=200`, token),
    ]);

    const labelById = new Map();
    (labelsResp.data?.results ?? []).forEach((l) => labelById.set(l.id, l.name));

    res.json({
      version: annotResp.data?.version ?? 0,
      tags:    annotResp.data?.tags ?? [],
      shapes:  (annotResp.data?.shapes ?? []).map((s) => ({
        ...s,
        label_name: labelById.get(s.label_id) ?? null,
      })),
      tracks:  annotResp.data?.tracks ?? [],
    });
  } catch (err) {
    if (err.statusCode === 403) return res.status(403).json({ error: err.message });
    res.status(err.response?.status ?? 502).json({ error: err.response?.data ?? err.message });
  }
});

router.put('/jobs/:jobId/annotations', requireAuth, async (req, res) => {
  const jobId = Number(req.params.jobId);
  if (!Number.isFinite(jobId)) return res.status(400).json({ error: 'invalid jobId' });
  try {
    const token = await getAdminToken();
    await ensureJobAccess(jobId, req.cvatUser, token);
    const putResp = await cvatPut(`/jobs/${jobId}/annotations`, req.body, token);
    res.json(putResp.data);
  } catch (err) {
    if (err.statusCode === 403) return res.status(403).json({ error: err.message });
    res.status(err.response?.status ?? 502).json({ error: err.response?.data ?? err.message });
  }
});

router.post('/contest-annotation', requireAuth, async (req, res) => {
  const taskId  = Number(req.body?.cvat_task_id);
  const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 2000) : '';
  if (!Number.isFinite(taskId)) return res.status(400).json({ error: 'cvat_task_id required' });
  if (!message)                  return res.status(400).json({ error: 'message required' });

  try {
    const { rows } = await pool.query(
      'SELECT curator_validated_at FROM media_moderation WHERE cvat_task_id = $1',
      [taskId],
    );
    if (rows.length === 0)            return res.status(404).json({ error: 'media inconnu' });
    if (!rows[0].curator_validated_at) return res.status(400).json({ error: 'l\'annotation finale n\'est pas encore validée par le curator' });

    const inserted = await pool.query(`
      INSERT INTO annotation_contestations (cvat_task_id, contester_id, message)
      VALUES ($1, $2, $3)
      RETURNING id, created_at
    `, [taskId, req.cvatUser.id, message]);
    res.status(201).json(inserted.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/comments', requireAuth, async (req, res) => {
  const cvatJobId   = Number(req.body?.cvat_job_id);
  const cvatShapeId = Number(req.body?.cvat_shape_id);
  const comment     = typeof req.body?.comment === 'string' ? req.body.comment.trim().slice(0, 2000) : '';
  if (!Number.isFinite(cvatJobId))   return res.status(400).json({ error: 'cvat_job_id required' });
  if (!Number.isFinite(cvatShapeId)) return res.status(400).json({ error: 'cvat_shape_id required' });
  if (!comment)                       return res.status(400).json({ error: 'comment required' });

  try {
    const { rows } = await pool.query(`
      INSERT INTO annotation_comments (cvat_job_id, cvat_shape_client_id, author_id, comment)
      VALUES ($1, $2, $3, $4)
      RETURNING id, created_at
    `, [cvatJobId, cvatShapeId, req.cvatUser.id, comment]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
