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
    // Pour le studio annotateur : seuls les médias passés en modération sont annotables.
    // Mes pending/rejected n'apparaissent pas dans "Mes médias" du studio (ils sont visibles
    // dans /media qui est la vraie page de suivi modération).
    const { rows } = await pool.query(`
      SELECT cvat_task_id, uploader_id, status, created_at, curator_validated_at
      FROM media_moderation
      WHERE status = 'validated'
    `, []);
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

    // Calcule "mes shapes par task" pour TOUTES les tâches où j'ai un job (own + community).
    // Sert à : (a) marquer ma tâche perso en "annotated", (b) filtrer le mur communautaire
    // pour faire disparaître les médias que j'ai déjà annotés.
    const myShapesCounts = new Map();
    await Promise.all(rows.map(async (row) => {
      if (!tasksById.has(row.cvat_task_id)) return;
      const jobs = jobsByTask.get(row.cvat_task_id) ?? [];
      const myJob = jobs.find((j) => j.assignee?.id === me);
      if (!myJob) { myShapesCounts.set(row.cvat_task_id, 0); return; }
      myShapesCounts.set(row.cvat_task_id, await countShapesInJob(myJob.id, token));
    }));

    const ownRows = rows.filter((r) => r.uploader_id === me && tasksById.has(r.cvat_task_id));

    // Mes contestations annotation déjà déposées pour la certification courante
    const certifiedOwnIds = ownRows
      .filter((r) => r.curator_validated_at)
      .map((r) => r.cvat_task_id);
    const alreadyContestedSet = new Set();
    if (certifiedOwnIds.length > 0) {
      const contQ = await pool.query(`
        SELECT ac.cvat_task_id
        FROM annotation_contestations ac
        JOIN media_moderation mm ON mm.cvat_task_id = ac.cvat_task_id
        WHERE ac.contester_id = $1
          AND ac.cvat_task_id = ANY($2)
          AND mm.curator_validated_at IS NOT NULL
          AND ac.created_at >= mm.curator_validated_at
      `, [me, certifiedOwnIds]);
      contQ.rows.forEach((r) => alreadyContestedSet.add(r.cvat_task_id));
    }

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
        already_contested: alreadyContestedSet.has(row.cvat_task_id),
      };

      if (row.uploader_id === me) {
        own.push(summary);
      } else if (row.status === 'validated') {
        const myShapes = myShapesCounts.get(row.cvat_task_id) ?? 0;
        const myJobDone = myAssigned?.state === 'completed';
        // Une fois que j'ai déjà annoté (≥1 shape) ou que mon job est complété,
        // le média disparaît de MON mur communautaire.
        if (myShapes > 0 || myJobDone) continue;
        if (myAssigned || freeJobs.length > 0) {
          community.push(summary);
        }
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
    // Met à jour le compteur dénormalisé pour ce task (fire-and-forget, ne bloque pas la réponse)
    require('../lib/curationGate').recomputeFromJob(jobId).catch(() => {});
    res.json(putResp.data);
  } catch (err) {
    if (err.statusCode === 403) return res.status(403).json({ error: err.message });
    res.status(err.response?.status ?? 502).json({ error: err.response?.data ?? err.message });
  }
});

router.get('/tasks/:id/certified', requireAuth, async (req, res) => {
  const taskId = Number(req.params.id);
  if (!Number.isFinite(taskId)) return res.status(400).json({ error: 'invalid task id' });

  try {
    const certQ = await pool.query(`
      SELECT mode, chosen_bbox_annotator_id, chosen_bbox_data,
             species_id, curator_id, curator_comment, certified_at, cvat_job_id
      FROM curator_certifications
      WHERE cvat_task_id = $1
      ORDER BY certified_at DESC
      LIMIT 1
    `, [taskId]);
    if (certQ.rows.length === 0) {
      return res.status(404).json({ error: 'aucune certification trouvée pour ce média' });
    }
    const cert = certQ.rows[0];

    const moderationQ = await pool.query(
      'SELECT curator_validated_at FROM media_moderation WHERE cvat_task_id = $1',
      [taskId],
    );
    if (moderationQ.rows.length === 0 || !moderationQ.rows[0].curator_validated_at) {
      return res.status(409).json({ error: 'la certification a été révoquée (contestation acceptée)' });
    }

    const speciesQ = cert.species_id ? await pool.query(`
      SELECT id, name, scientific_name, usage_name, polynesian_name, tags,
             description, description_source, reference_image_url, status
      FROM species WHERE id = $1
    `, [cert.species_id]) : null;

    let curator = null;
    if (cert.curator_id) {
      try {
        const r = await cvatGet(`/users/${cert.curator_id}`, await getAdminToken());
        const role = (await pool.query('SELECT role FROM user_roles WHERE cvat_user_id = $1', [cert.curator_id])).rows[0]?.role ?? 'admin';
        const totals = await require('../lib/userStats').fetchActionsTotals([cert.curator_id]);
        curator = {
          id: cert.curator_id,
          username: r.data.username,
          role,
          actions_validated_total: totals[cert.curator_id] ?? 0,
        };
      } catch { /* ignore */ }
    }

    const token = await getAdminToken();
    const taskResp = await cvatGet(`/tasks/${taskId}`, token);

    res.json({
      task: {
        id: taskResp.data.id,
        name: taskResp.data.name,
        size: taskResp.data.size,
      },
      certification: {
        mode: cert.mode,
        bbox: cert.chosen_bbox_data,
        curator_comment: cert.curator_comment,
        certified_at: cert.certified_at,
        curator,
        cvat_job_id: cert.cvat_job_id,
      },
      species: speciesQ?.rows[0] ?? null,
    });
  } catch (err) {
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

    // Une seule contestation par utilisateur par certification.
    // On compare contre la date de certification courante : si un overturn admin
    // a rouvert la curation et qu'une nouvelle certification a eu lieu, l'utilisateur
    // pourra contester à nouveau (sa contestation précédente est "antérieure").
    const dup = await pool.query(`
      SELECT 1 FROM annotation_contestations
      WHERE cvat_task_id = $1 AND contester_id = $2 AND created_at >= $3
      LIMIT 1
    `, [taskId, req.cvatUser.id, rows[0].curator_validated_at]);
    if (dup.rows.length > 0) {
      return res.status(409).json({ error: 'Tu as déjà contesté cette certification.' });
    }

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
