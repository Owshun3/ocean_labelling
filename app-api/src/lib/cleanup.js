'use strict';

const { pool } = require('../db');
const { cvatDelete } = require('./cvatAdmin');
const { recordAction } = require('./auditLog');
const { deleteVideoFiles } = require('./videoStorage');

const SYSTEM_ACTOR_ID = 0;
const BATCH_LIMIT = 200;

async function getRetentionDays() {
  try {
    const { rows } = await pool.query(
      "SELECT value FROM app_settings WHERE key = 'media_retention_rejected_days'"
    );
    const n = Number(rows[0]?.value);
    if (!Number.isInteger(n) || n < 0) return 30;
    return n;
  } catch {
    return 30;
  }
}

async function selectEligible(days) {
  if (days === 0) return [];
  const { rows } = await pool.query(`
    SELECT mm.media_kind, mm.cvat_task_id, mm.video_id, mm.uploader_id
    FROM media_moderation mm
    WHERE mm.status = 'rejected'
      AND mm.binaries_deleted_at IS NULL
      AND mm.reviewed_at < NOW() - ($1 || ' days')::interval
      AND NOT EXISTS (
        SELECT 1 FROM moderation_contestations c
        WHERE c.media_kind = mm.media_kind
          AND COALESCE(c.cvat_task_id, c.video_id) = COALESCE(mm.cvat_task_id, mm.video_id)
          AND c.resolved_at IS NULL
      )
    ORDER BY mm.reviewed_at ASC
    LIMIT $2
  `, [String(days), BATCH_LIMIT]);
  return rows;
}

async function markCleanedImage(taskIds) {
  if (taskIds.length === 0) return;
  await pool.query(
    "UPDATE media_moderation SET binaries_deleted_at = NOW() WHERE media_kind='image' AND cvat_task_id = ANY($1)",
    [taskIds],
  );
}

async function markCleanedVideo(videoIds) {
  if (videoIds.length === 0) return;
  await pool.query(
    "UPDATE media_moderation SET binaries_deleted_at = NOW() WHERE media_kind='video' AND video_id = ANY($1)",
    [videoIds],
  );
  await pool.query(
    'UPDATE user_videos SET deleted_at = NOW() WHERE id = ANY($1) AND deleted_at IS NULL',
    [videoIds],
  );
}

async function runCleanup() {
  const days = await getRetentionDays();
  const eligible = await selectEligible(days);
  if (eligible.length === 0) {
    return { ran_at: new Date().toISOString(), retention_days: days, deleted: 0, errors: 0 };
  }

  const imageRows = eligible.filter((r) => r.media_kind === 'image');
  const videoRows = eligible.filter((r) => r.media_kind === 'video');

  const cleanedTasks = [];
  const errors = [];
  for (const row of imageRows) {
    try {
      await cvatDelete(`/tasks/${row.cvat_task_id}`);
      cleanedTasks.push(row.cvat_task_id);
    } catch (err) {
      const status = err.response?.status;
      if (status === 404) cleanedTasks.push(row.cvat_task_id);
      else errors.push({ task_id: row.cvat_task_id, status, message: err.message });
    }
  }
  await markCleanedImage(cleanedTasks);

  const cleanedVideos = [];
  for (const row of videoRows) {
    try {
      await deleteVideoFiles(row.video_id);
      cleanedVideos.push(row.video_id);
    } catch (err) {
      errors.push({ video_id: row.video_id, message: err.message });
    }
  }
  await markCleanedVideo(cleanedVideos);

  const totalCleaned = cleanedTasks.length + cleanedVideos.length;
  if (totalCleaned > 0) {
    recordAction(SYSTEM_ACTOR_ID, 'media.auto_deleted', {
      payload: {
        retention_days: days,
        deleted_count: totalCleaned,
        task_ids: cleanedTasks,
        video_ids: cleanedVideos,
        errors: errors.length,
      },
    });
  }

  return {
    ran_at: new Date().toISOString(),
    retention_days: days,
    deleted: totalCleaned,
    errors: errors.length,
  };
}

let intervalHandle = null;
function startScheduler(intervalMs = 60 * 60 * 1000) {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => {
    runCleanup().catch((err) => console.warn('[cleanup] scheduled run failed:', err.message));
  }, intervalMs);
  setTimeout(() => {
    runCleanup()
      .then((r) => console.log('[cleanup] initial run:', r))
      .catch((err) => console.warn('[cleanup] initial run failed:', err.message));
  }, 30_000);
}

module.exports = { runCleanup, startScheduler, SYSTEM_ACTOR_ID };
