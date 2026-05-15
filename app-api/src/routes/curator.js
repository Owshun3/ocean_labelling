'use strict';

const express = require('express');
const axios   = require('axios');
const { pool } = require('../db');
const { requireCuratorOrAbove } = require('../middleware/auth');
const { fetchActionsTotals } = require('../lib/userStats');
const { getConsensusThreshold } = require('../lib/curationGate');

const router  = express.Router();
const CVAT    = process.env.CVAT_API_URL || 'http://cvat_server:8080/api';

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

async function cvatPost(path, body, token) {
  try {
    return await axios.post(`${CVAT}${path}`, body, { headers: adminHeaders(token) });
  } catch (err) {
    if (err.response?.status === 401) {
      const fresh = await getAdminToken(true);
      return axios.post(`${CVAT}${path}`, body, { headers: adminHeaders(fresh) });
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

/* ── GET /curator/tasks
 * Liste toutes les tâches avec résumé des jobs.
 * Les curators voient toutes les tâches (pas de filtre d'assignation pour l'instant).
 */
router.get('/tasks', requireCuratorOrAbove, async (req, res) => {
  try {
    const me = req.cvatUser;
    const isAdmin = me.is_superuser || me.is_staff;
    let appRole = null;
    if (!isAdmin) {
      const { rows: roleRows } = await pool.query('SELECT role FROM user_roles WHERE cvat_user_id = $1', [me.id]);
      appRole = roleRows[0]?.role ?? 'annotator';
    }
    const treatAsAdmin = isAdmin || appRole === 'admin';

    const threshold = await getConsensusThreshold();
    const params = treatAsAdmin ? [threshold] : [me.id, threshold];
    const assignmentFilter = treatAsAdmin ? '' : 'AND assigned_curator_id = $1';
    const thresholdIdx = treatAsAdmin ? 1 : 2;

    const { rows: eligibleRows } = await pool.query(`
      SELECT cvat_task_id, assigned_curator_id, annotated_jobs_count
      FROM media_moderation
      WHERE status = 'validated'
        AND curator_validated_at IS NULL
        AND binaries_deleted_at IS NULL
        AND annotated_jobs_count >= $${thresholdIdx}
        ${assignmentFilter}
      ORDER BY reviewed_at ASC
      LIMIT 200
    `, params);
    if (eligibleRows.length === 0) return res.json({ results: [], count: 0, admin_view: treatAsAdmin });
    const eligibleIds = eligibleRows.map((r) => r.cvat_task_id);
    const assignedByTask = new Map();
    eligibleRows.forEach((r) => assignedByTask.set(r.cvat_task_id, r.assigned_curator_id));

    // Résoudre les usernames des curators assignés (pour affichage admin)
    const assignedCuratorIds = [...new Set(eligibleRows.map((r) => r.assigned_curator_id).filter(Boolean))];
    const curatorUsernames = {};
    if (treatAsAdmin && assignedCuratorIds.length > 0) {
      await Promise.all(assignedCuratorIds.map(async (id) => {
        try {
          const r = await cvatGet(`/users/${id}`, await getAdminToken());
          curatorUsernames[id] = r.data.username;
        } catch { /* ignore */ }
      }));
    }

    const token = await getAdminToken();
    const tasks = [];
    await Promise.all(eligibleIds.map(async (id) => {
      try {
        const r = await cvatGet(`/tasks/${id}`, token);
        tasks.push(r.data);
      } catch (err) {
        if (err.response?.status !== 404) {
          console.warn(`[curator] failed to fetch task ${id}:`, err.message);
        }
      }
    }));

    const withJobs = await Promise.all(tasks.map(async (task) => {
      try {
        const jobsResp = await cvatGet(`/jobs?task_id=${task.id}&page_size=50`, token);
        const rawJobs = jobsResp.data.results;
        const jobs = rawJobs.map(j => ({
          id: j.id,
          state: j.state,
          stage: j.stage,
          assignee: j.assignee ? { id: j.assignee.id, username: j.assignee.username } : null,
        }));
        const shapeCounts = await Promise.all(rawJobs.map(async (j) => {
          try {
            const ann = await cvatGet(`/jobs/${j.id}/annotations`, token);
            return (ann.data?.shapes ?? []).length;
          } catch { return 0; }
        }));
        const annotationsCount = shapeCounts.reduce((a, b) => a + b, 0);
        const annotatedJobsCount = shapeCounts.filter((n) => n > 0).length;
        const assignedId = assignedByTask.get(task.id) ?? null;
        return {
          id: task.id,
          name: task.name,
          status: task.status,
          created_date: task.created_date,
          updated_date: task.updated_date,
          jobs,
          jobs_count: jobs.length,
          completed_count: jobs.filter(j => j.state === 'completed').length,
          annotations_count:      annotationsCount,
          annotated_jobs_count:   annotatedJobsCount,
          assigned_to: assignedId ? { id: assignedId, username: curatorUsernames[assignedId] ?? null } : null,
          is_assigned_to_me: assignedId === me.id,
        };
      } catch {
        const assignedId = assignedByTask.get(task.id) ?? null;
        return {
          id: task.id, name: task.name, status: task.status,
          jobs: [], jobs_count: 0, completed_count: 0, annotations_count: 0, annotated_jobs_count: 0,
          assigned_to: assignedId ? { id: assignedId, username: curatorUsernames[assignedId] ?? null } : null,
          is_assigned_to_me: assignedId === me.id,
        };
      }
    }));

    // Le gate par seuil est déjà appliqué côté SQL (annotated_jobs_count >= $threshold).
    res.json({ results: withJobs, count: withJobs.length, admin_view: treatAsAdmin, threshold });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.get('/jobs/:jobId/frame', requireCuratorOrAbove, async (req, res) => {
  const jobId   = Number(req.params.jobId);
  const number  = Number.isFinite(Number(req.query.number)) ? Number(req.query.number) : 0;
  const quality = req.query.quality === 'original' ? 'original' : 'compressed';
  if (!Number.isFinite(jobId)) return res.status(400).json({ error: 'invalid jobId' });
  try {
    const token = await getAdminToken();
    const cvatResp = await axios.get(`${CVAT}/jobs/${jobId}/data`, {
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

router.get('/tasks/:taskId/preview', requireCuratorOrAbove, async (req, res) => {
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

/* ── GET /curator/tasks/:id/jobs
 * Détail des jobs d'une tâche avec assignations.
 */
router.get('/tasks/:id/jobs', requireCuratorOrAbove, async (req, res) => {
  try {
    const token = await getAdminToken();
    const jobsResp = await cvatGet(`/jobs?task_id=${req.params.id}&page_size=50`, token);
    const jobs = jobsResp.data.results.map(j => ({
      id: j.id,
      state: j.state,
      stage: j.stage,
      assignee: j.assignee ? { id: j.assignee.id, username: j.assignee.username } : null,
      start_frame: j.start_frame,
      stop_frame: j.stop_frame,
    }));
    res.json({ results: jobs });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/* ── POST /curator/tasks/:id/quality
 * Déclenche la génération d'un rapport qualité CVAT (async).
 */
router.post('/tasks/:id/quality', requireCuratorOrAbove, async (req, res) => {
  try {
    const token = await getAdminToken();
    const resp = await cvatPost('/quality/reports', { task_id: Number(req.params.id) }, token);
    res.status(202).json(resp.data);
  } catch (err) {
    res.status(err.response?.status ?? 502).json({ error: err.response?.data ?? err.message });
  }
});

/* ── GET /curator/tasks/:id/quality
 * Récupère le dernier rapport qualité + liste des conflits pour une tâche.
 */
router.get('/tasks/:id/quality', requireCuratorOrAbove, async (req, res) => {
  try {
    const token = await getAdminToken();
    const [reportsResp, conflictsResp] = await Promise.all([
      cvatGet(`/quality/reports?task_id=${req.params.id}&page_size=1`, token),
      cvatGet(`/quality/conflicts?task_id=${req.params.id}&page_size=100`, token),
    ]);
    const report = reportsResp.data.results[0] ?? null;
    res.json({ report, conflicts: conflictsResp.data.results, conflicts_count: conflictsResp.data.count });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/* ── POST /curator/tasks/:id/merge
 * Déclenche la fusion par consensus (IoU) des jobs d'une tâche.
 * Retourne l'objet merge avec son id pour polling.
 */
router.post('/tasks/:id/merge', requireCuratorOrAbove, async (req, res) => {
  try {
    const token = await getAdminToken();
    const resp = await cvatPost('/consensus/merges', { task_id: Number(req.params.id) }, token);
    res.status(202).json(resp.data);
  } catch (err) {
    res.status(err.response?.status ?? 502).json({ error: err.response?.data ?? err.message });
  }
});

/* ── GET /curator/merges/:mergeId
 * Polling du statut d'un merge en cours.
 */
router.get('/merges/:mergeId', requireCuratorOrAbove, async (req, res) => {
  try {
    const token = await getAdminToken();
    const resp = await cvatGet(`/consensus/merges/${req.params.mergeId}`, token);
    res.json(resp.data);
  } catch (err) {
    res.status(err.response?.status ?? 502).json({ error: err.message });
  }
});

router.get('/tasks/:taskId/proposals', requireCuratorOrAbove, async (req, res) => {
  const taskId = Number(req.params.taskId);
  if (!Number.isFinite(taskId)) return res.status(400).json({ error: 'invalid taskId' });

  try {
    const token = await getAdminToken();

    const [taskResp, jobsResp, labelsResp] = await Promise.all([
      cvatGet(`/tasks/${taskId}`, token),
      cvatGet(`/jobs?task_id=${taskId}&page_size=50`, token),
      cvatGet(`/labels?task_id=${taskId}&page_size=200`, token),
    ]);

    const task   = taskResp.data;
    const jobs   = jobsResp.data?.results ?? [];
    const labels = labelsResp.data?.results ?? [];
    const labelById = new Map();
    labels.forEach((l) => labelById.set(l.id, l.name));

    const speciesByName = new Map();
    if (labels.length > 0) {
      const names = labels.map((l) => l.name);
      const { rows } = await pool.query(
        `SELECT id, name, scientific_name, usage_name, polynesian_name, tags, status,
                description, description_source, reference_image_url
         FROM species
         WHERE name = ANY($1)`,
        [names],
      );
      rows.forEach((s) => speciesByName.set(s.name, s));
    }

    const proposals = await Promise.all(jobs.map(async (job) => {
      try {
        const annResp = await cvatGet(`/jobs/${job.id}/annotations`, token);
        const rawShapes = annResp.data?.shapes ?? [];
        const annotatorId       = job.assignee?.id ?? null;
        const annotatorUsername = job.assignee?.username ?? 'Anonyme';
        const shapes = rawShapes
          .filter((s) => s.type === 'rectangle' && Array.isArray(s.points) && s.points.length >= 4)
          .map((s) => {
            const [x1, y1, x2, y2] = s.points;
            const labelName = labelById.get(s.label_id) ?? null;
            const speciesRow = labelName ? (speciesByName.get(labelName) ?? null) : null;
            return {
              cvat_shape_id: s.id,
              points: s.points,
              x: Math.min(x1, x2),
              y: Math.min(y1, y2),
              width:  Math.abs(x2 - x1),
              height: Math.abs(y2 - y1),
              label_id: s.label_id,
              label_name: labelName,
              species: speciesRow,
              cvat_job_id: job.id,
              annotator_id: annotatorId,
              annotator_username: annotatorUsername,
            };
          });
        return shapes;
      } catch (e) {
        console.warn(`[curator] fetch annotations job ${job.id} failed:`, e.response?.status ?? e.message);
        return [];
      }
    }));

    const flatProposals = proposals.flat();
    console.log(`[curator] proposals task=${taskId} jobs=${jobs.length} shapes=${flatProposals.length}`);

    const annotatorIds = [...new Set(flatProposals.map((p) => p.annotator_id).filter(Boolean))];
    const annotatorTotals = await fetchActionsTotals(annotatorIds);
    flatProposals.forEach((p) => {
      p.annotator_actions_total = annotatorTotals[p.annotator_id] ?? 0;
    });

    let metadata = null;
    try {
      const metaQ = await pool.query(
        `SELECT cvat_task_id, gps_latitude, gps_longitude, taken_at, camera_make,
                camera_model, image_width, image_height
         FROM media_metadata WHERE cvat_task_id = $1`,
        [taskId],
      );
      metadata = metaQ.rows[0] ?? null;
    } catch (_) {}

    const moderationQ = await pool.query(
      `SELECT uploader_id, status, created_at, curator_validated_at
       FROM media_moderation WHERE cvat_task_id = $1`,
      [taskId],
    );
    const moderation = moderationQ.rows[0] ?? null;

    res.json({
      task: {
        id: task.id,
        name: task.name,
        status: task.status,
        created_date: task.created_date,
        size: task.size,
      },
      moderation,
      metadata,
      jobs: jobs.map((j) => ({
        id: j.id,
        state: j.state,
        stage: j.stage,
        assignee: j.assignee ? { id: j.assignee.id, username: j.assignee.username } : null,
      })),
      proposals: flatProposals,
    });
  } catch (err) {
    res.status(err.response?.status ?? 502).json({ error: err.response?.data ?? err.message });
  }
});

router.post('/tasks/:taskId/certify', requireCuratorOrAbove, async (req, res) => {
  const taskId = Number(req.params.taskId);
  if (!Number.isFinite(taskId)) return res.status(400).json({ error: 'invalid taskId' });

  const body = req.body || {};
  const jobId = Number(body.cvat_job_id);
  const mode  = body.mode;
  const shape = body.shape;
  const sp    = body.species || {};
  const chosenAnnotatorId = body.chosen_bbox_annotator_id ?? null;
  const rejectedProposals = body.rejected_proposals ?? null;
  const curatorComment    = typeof body.comment === 'string' ? body.comment.trim().slice(0, 2000) : '';

  if (!Number.isFinite(jobId)) return res.status(400).json({ error: 'cvat_job_id required' });
  if (!['review', 'create'].includes(mode)) return res.status(400).json({ error: "mode must be 'review' or 'create'" });
  if (!shape || !Array.isArray(shape.points) || shape.points.length < 4) {
    return res.status(400).json({ error: 'shape.points required (4 numbers)' });
  }
  if (!sp.scientific_name || !sp.usage_name || !sp.polynesian_name) {
    return res.status(400).json({ error: 'species.scientific_name, usage_name, polynesian_name required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Garde de concurrence : verrouille la ligne et vérifie qu'elle n'est pas déjà certifiée.
    // Deux requêtes simultanées seront sérialisées par le FOR UPDATE.
    const lockResult = await client.query(
      `SELECT curator_validated_at, curator_validated_by
       FROM media_moderation
       WHERE cvat_task_id = $1
       FOR UPDATE`,
      [taskId],
    );
    if (lockResult.rows.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(404).json({ error: 'Média introuvable en modération.' });
    }
    if (lockResult.rows[0].curator_validated_at) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(409).json({
        error: 'Ce média vient d\'être certifié par un autre curator. Recharge la page.',
        already_certified_by: lockResult.rows[0].curator_validated_by,
        already_certified_at: lockResult.rows[0].curator_validated_at,
      });
    }

    const speciesRow = await upsertSpeciesFull(client, {
      scientific_name: sp.scientific_name,
      usage_name:      sp.usage_name,
      polynesian_name: sp.polynesian_name,
      tags:            Array.isArray(sp.tags) ? sp.tags : [],
      source_name:     sp.source_name,
      proposed_by:     req.cvatUser.id,
    });

    const token = await getAdminToken();
    const labelName = speciesRow.name;

    const existingLabelsResp = await cvatGet(`/labels?task_id=${taskId}&page_size=200`, token);
    const existingLabels = existingLabelsResp.data?.results ?? [];
    let labelId = existingLabels.find((l) => l.name === labelName)?.id;

    if (!labelId) {
      await cvatPatch(`/tasks/${taskId}`, { labels: [{ name: labelName }] }, token);
      const refreshed = await cvatGet(`/labels?task_id=${taskId}&page_size=200`, token);
      labelId = (refreshed.data?.results ?? []).find((l) => l.name === labelName)?.id;
    }
    if (!labelId) throw new Error('Impossible de résoudre le label_id côté CVAT');

    const existingAnn = await cvatGet(`/jobs/${jobId}/annotations`, token);
    const fullState = {
      version: existingAnn.data?.version ?? 0,
      tags:    existingAnn.data?.tags ?? [],
      shapes: [{
        type:      'rectangle',
        points:    shape.points,
        frame:     0,
        label_id:  labelId,
        occluded:  false,
        outside:   false,
        z_order:   0,
        rotation:  0,
        group:     0,
        source:    'manual',
        attributes: [],
      }],
      tracks:  existingAnn.data?.tracks ?? [],
    };
    const putResp = await cvatPut(`/jobs/${jobId}/annotations`, fullState, token);
    const writtenShape = (putResp.data?.shapes ?? [])[0];

    const upd = await client.query(
      `UPDATE media_moderation
       SET curator_validated_at = NOW(), curator_validated_by = $1
       WHERE cvat_task_id = $2 AND curator_validated_at IS NULL`,
      [req.cvatUser.id, taskId],
    );
    if (upd.rowCount === 0) {
      // Devrait être impossible grâce au FOR UPDATE plus haut, mais on garde le filet.
      await client.query('ROLLBACK');
      client.release();
      return res.status(409).json({ error: 'Ce média a été certifié entre-temps.' });
    }

    const certInsert = await client.query(
      `INSERT INTO curator_certifications
         (cvat_task_id, cvat_job_id, curator_id, mode,
          chosen_bbox_annotator_id, chosen_bbox_data, rejected_proposals,
          species_id, curator_comment)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, certified_at`,
      [
        taskId, jobId, req.cvatUser.id, mode,
        chosenAnnotatorId,
        JSON.stringify({ points: shape.points }),
        rejectedProposals ? JSON.stringify(rejectedProposals) : null,
        speciesRow.id,
        curatorComment || null,
      ],
    );

    if (curatorComment && writtenShape?.id) {
      await client.query(
        `INSERT INTO annotation_comments
           (cvat_job_id, cvat_shape_client_id, author_id, comment, is_curator_comment)
         VALUES ($1, $2, $3, $4, TRUE)`,
        [jobId, writtenShape.id, req.cvatUser.id, curatorComment],
      );
    }

    await client.query('COMMIT');

    res.json({
      ok: true,
      certification_id: certInsert.rows[0].id,
      certified_at:     certInsert.rows[0].certified_at,
      species:          speciesRow,
      cvat_shape_id:    writtenShape?.id ?? null,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(err.response?.status ?? 500).json({ error: err.response?.data ?? err.message });
  } finally {
    client.release();
  }
});

async function upsertSpeciesFull(client, { scientific_name, usage_name, polynesian_name, tags, source_name, proposed_by }) {
  const sName  = scientific_name.trim();
  const uName  = usage_name.trim();
  const pName  = polynesian_name.trim();
  const tagArr = Array.isArray(tags) ? tags.filter((t) => typeof t === 'string') : [];

  const match = await client.query(
    `SELECT * FROM species
     WHERE LOWER(scientific_name) = LOWER($1)
       AND LOWER(usage_name)      = LOWER($2)
       AND LOWER(polynesian_name) = LOWER($3)
     LIMIT 1`,
    [sName, uName, pName],
  );
  if (match.rows.length > 0) {
    const row = match.rows[0];
    const upd = await client.query(
      `UPDATE species SET tags = $1, status = 'approved', approved_by = COALESCE(approved_by, $2)
       WHERE id = $3 RETURNING *`,
      [tagArr, proposed_by, row.id],
    );
    return upd.rows[0];
  }

  if (source_name) {
    const legacy = await client.query(
      `SELECT * FROM species WHERE LOWER(name) = LOWER($1) LIMIT 1`,
      [source_name.trim()],
    );
    if (legacy.rows.length > 0) {
      const upd = await client.query(
        `UPDATE species
         SET scientific_name = $1, usage_name = $2, polynesian_name = $3,
             tags = $4, status = 'approved', approved_by = COALESCE(approved_by, $5)
         WHERE id = $6 RETURNING *`,
        [sName, uName, pName, tagArr, proposed_by, legacy.rows[0].id],
      );
      return upd.rows[0];
    }
  }

  // Dernière garde case-insensitive sur le legacy `name`
  const dup = await client.query(`SELECT * FROM species WHERE LOWER(name) = LOWER($1) LIMIT 1`, [sName]);
  if (dup.rows.length > 0) {
    const upd = await client.query(
      `UPDATE species
       SET scientific_name=$1, usage_name=$2, polynesian_name=$3, tags=$4,
           status='approved', approved_by=COALESCE(approved_by, $5)
       WHERE id=$6 RETURNING *`,
      [sName, uName, pName, tagArr, proposed_by, dup.rows[0].id],
    );
    return upd.rows[0];
  }

  const ins = await client.query(
    `INSERT INTO species (name, scientific_name, usage_name, polynesian_name, tags, status, proposed_by, approved_by)
     VALUES ($1, $2, $3, $4, $5, 'approved', $6, $6)
     RETURNING *`,
    [sName, sName, uName, pName, tagArr, proposed_by],
  );
  return ins.rows[0];
}

module.exports = router;
