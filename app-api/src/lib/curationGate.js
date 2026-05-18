'use strict';

const { pool } = require('../db');
const { cvatGet, getAdminToken } = require('./cvatAdmin');

async function getConsensusThreshold() {
  try {
    const { rows } = await pool.query(
      "SELECT value FROM app_settings WHERE key = 'consensus_replicas_default'"
    );
    const n = Number(rows[0]?.value);
    return Number.isInteger(n) && n > 0 ? n : 2;
  } catch {
    return 2;
  }
}

// Compte les jobs d'un task qui ont ≥ 1 shape. Source de vérité = CVAT.
async function countAnnotatedJobsFromCvat(taskId, token) {
  const t = token ?? (await getAdminToken());
  const jobsResp = await cvatGet(`/jobs?task_id=${taskId}&page_size=50`, t);
  const jobs = jobsResp.data?.results ?? [];
  if (jobs.length === 0) return 0;
  const counts = await Promise.all(jobs.map(async (j) => {
    try {
      const ann = await cvatGet(`/jobs/${j.id}/annotations`, t);
      return (ann.data?.shapes ?? []).length;
    } catch { return 0; }
  }));
  return counts.filter((n) => n > 0).length;
}

// Met à jour la colonne dénormalisée pour un task. À appeler après toute modif d'annotations
// (PUT annotations annotateur, certify curator, etc.).
async function recomputeAnnotatedForTask(taskId) {
  try {
    const count = await countAnnotatedJobsFromCvat(taskId);
    await pool.query(
      `UPDATE media_moderation
       SET annotated_jobs_count = $1, annotated_jobs_synced_at = NOW()
       WHERE cvat_task_id = $2`,
      [count, taskId],
    );
    return count;
  } catch (err) {
    console.warn(`[curation-gate] recompute task ${taskId} failed:`, err.message);
    return null;
  }
}

// Variante : on connait le jobId, on remonte au taskId. Utilisé après PUT job annotations.
async function recomputeFromJob(jobId) {
  try {
    const token = await getAdminToken();
    const jobResp = await cvatGet(`/jobs/${jobId}`, token);
    const taskId = jobResp.data?.task_id ?? jobResp.data?.task?.id ?? jobResp.data?.task;
    if (!Number.isInteger(taskId)) {
      console.warn(`[curation-gate] recompute from job ${jobId}: task_id introuvable dans la réponse`, Object.keys(jobResp.data || {}));
      return null;
    }
    const count = await recomputeAnnotatedForTask(taskId);
    console.log(`[curation-gate] live recompute job=${jobId} task=${taskId} count=${count}`);
    return count;
  } catch (err) {
    console.warn(`[curation-gate] recompute from job ${jobId} failed:`, err.response?.status ?? err.message);
    return null;
  }
}

// Backfill / drift-fix : recalcule pour tous les médias modérés validés non encore curés.
// Appelé au boot et périodiquement (toutes les heures).
async function refreshAllPending() {
  const { rows } = await pool.query(`
    SELECT cvat_task_id FROM media_moderation
    WHERE media_kind = 'image'
      AND status = 'validated'
      AND curator_validated_at IS NULL
      AND binaries_deleted_at IS NULL
  `);
  if (rows.length === 0) return { refreshed: 0 };
  const token = await getAdminToken();
  let refreshed = 0;
  // Limite la concurrence à 10 pour ne pas saturer CVAT
  const queue = [...rows];
  await Promise.all(Array.from({ length: 10 }).map(async () => {
    while (queue.length > 0) {
      const row = queue.shift();
      try {
        const count = await countAnnotatedJobsFromCvat(row.cvat_task_id, token);
        await pool.query(
          'UPDATE media_moderation SET annotated_jobs_count = $1, annotated_jobs_synced_at = NOW() WHERE cvat_task_id = $2',
          [count, row.cvat_task_id],
        );
        refreshed++;
      } catch { /* ignore individual failures */ }
    }
  }));
  return { refreshed };
}

let schedulerHandle = null;
function startScheduler(intervalMs = 60 * 60 * 1000) {
  if (schedulerHandle) return;
  schedulerHandle = setInterval(() => {
    refreshAllPending()
      .then((r) => console.log('[curation-gate] periodic refresh:', r))
      .catch((err) => console.warn('[curation-gate] periodic refresh failed:', err.message));
  }, intervalMs);
  // Boot warm-up : 60s après le démarrage pour laisser CVAT se stabiliser
  setTimeout(() => {
    refreshAllPending()
      .then((r) => console.log('[curation-gate] initial refresh:', r))
      .catch((err) => console.warn('[curation-gate] initial refresh failed:', err.message));
  }, 60_000);
}

module.exports = {
  getConsensusThreshold,
  recomputeAnnotatedForTask,
  recomputeFromJob,
  refreshAllPending,
  startScheduler,
};
