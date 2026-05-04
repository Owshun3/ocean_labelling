'use strict';

const express = require('express');
const axios   = require('axios');
const { requireCuratorOrAbove } = require('../middleware/auth');

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

/* ── GET /curator/tasks
 * Liste toutes les tâches avec résumé des jobs.
 * Les curators voient toutes les tâches (pas de filtre d'assignation pour l'instant).
 */
router.get('/tasks', requireCuratorOrAbove, async (req, res) => {
  try {
    const token = await getAdminToken();
    const tasksResp = await cvatGet('/tasks?page_size=50', token);
    const tasks = tasksResp.data.results;

    const withJobs = await Promise.all(tasks.map(async (task) => {
      try {
        const jobsResp = await cvatGet(`/jobs?task_id=${task.id}&page_size=50`, token);
        const jobs = jobsResp.data.results.map(j => ({
          id: j.id,
          state: j.state,
          stage: j.stage,
          assignee: j.assignee ? { id: j.assignee.id, username: j.assignee.username } : null,
        }));
        return {
          id: task.id,
          name: task.name,
          status: task.status,
          created_date: task.created_date,
          updated_date: task.updated_date,
          jobs,
          jobs_count: jobs.length,
          completed_count: jobs.filter(j => j.state === 'completed').length,
        };
      } catch {
        return { id: task.id, name: task.name, status: task.status, jobs: [], jobs_count: 0, completed_count: 0 };
      }
    }));

    res.json({ results: withJobs, count: withJobs.length });
  } catch (err) {
    res.status(502).json({ error: err.message });
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

module.exports = router;
