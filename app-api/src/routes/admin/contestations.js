'use strict';

const express = require('express');
const fs = require('fs');
const { pool } = require('../../db');
const { cvatGet, cvatDelete, cvatPut } = require('../../lib/cvatAdmin');
const { recordAction } = require('../../lib/auditLog');
const { fetchActionsTotals } = require('../../lib/userStats');
const { deleteVideoFiles } = require('../../lib/videoStorage');

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

// Polymorphic JOIN: moderation_contestations ↔ media_moderation matches on (media_kind, cvat_task_id|video_id).
// For annotation_contestations (currently image-only) the JOIN is the legacy cvat_task_id match.
function buildModerationJoin(kind) {
  return kind === 'annotation'
    ? 'JOIN media_moderation mm ON mm.media_kind = \'image\' AND mm.cvat_task_id = c.cvat_task_id'
    : `JOIN media_moderation mm
         ON mm.media_kind = c.media_kind
        AND COALESCE(mm.cvat_task_id, mm.video_id) = COALESCE(c.cvat_task_id, c.video_id)`;
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
      ${buildModerationJoin(kind)}
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
    const query = kind === 'annotation' ? `
      SELECT
        c.id              AS contestation_id,
        'image'::text     AS media_kind,
        c.cvat_task_id,
        NULL::int         AS video_id,
        c.message,
        c.created_at,
        c.contester_id,
        mm.uploader_id,
        mm.curator_validated_by AS reviewer_id,
        mm.curator_validated_at AS reviewed_at,
        cc.species_id,
        cc.mode             AS certification_mode,
        cc.curator_comment  AS certification_comment,
        cc.chosen_bbox_data AS chosen_bbox_data,
        s.scientific_name   AS species_scientific_name,
        s.usage_name        AS species_usage_name,
        s.polynesian_name   AS species_polynesian_name,
        s.tags              AS species_tags,
        meta.image_width    AS image_width,
        meta.image_height   AS image_height
      FROM annotation_contestations c
      ${buildModerationJoin(kind)}
      LEFT JOIN LATERAL (
        SELECT species_id, mode, curator_comment, chosen_bbox_data
        FROM curator_certifications
        WHERE cvat_task_id = c.cvat_task_id
        ORDER BY certified_at DESC
        LIMIT 1
      ) cc ON TRUE
      LEFT JOIN species s ON s.id = cc.species_id
      LEFT JOIN media_metadata meta ON meta.cvat_task_id = c.cvat_task_id
      WHERE c.resolved_at IS NULL
        AND mm.uploader_id = $1
      ORDER BY c.created_at ASC
    ` : `
      SELECT
        c.id              AS contestation_id,
        c.media_kind,
        c.cvat_task_id,
        c.video_id,
        c.message,
        c.created_at,
        c.contester_id,
        mm.uploader_id,
        mm.reviewed_by    AS reviewer_id,
        mm.reviewed_at    AS reviewed_at,
        mm.review_comment AS rejection_reason
      FROM moderation_contestations c
      ${buildModerationJoin(kind)}
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

    const imageTaskIds = rows.filter((r) => r.media_kind === 'image' && r.cvat_task_id).map((r) => r.cvat_task_id);
    const videoIds     = rows.filter((r) => r.media_kind === 'video' && r.video_id).map((r) => r.video_id);

    const tasksById = {};
    await Promise.all(imageTaskIds.map(async (id) => {
      try { const r = await cvatGet(`/tasks/${id}`); tasksById[id] = r.data; }
      catch (err) { if (err.response?.status !== 404) console.warn(`[admin/contestations] task ${id}:`, err.message); }
    }));

    let videosById = {};
    if (videoIds.length) {
      const { rows: vs } = await pool.query(
        `SELECT id, filename, content_type, size_bytes, duration_seconds, width, height, has_poster, uploaded_at
         FROM user_videos WHERE id = ANY($1)`,
        [videoIds],
      );
      videosById = Object.fromEntries(vs.map((v) => [v.id, v]));
    }

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

      const reviewer  = r.reviewer_id  ? usersById[r.reviewer_id]  : null;
      const contester = r.contester_id ? usersById[r.contester_id] : null;

      const baseItem = {
        contestation_id: r.contestation_id,
        media_kind:      r.media_kind,
        cvat_task_id:    r.cvat_task_id,
        video_id:        r.video_id,
        contested_at:    r.created_at,
        reviewed_at:     r.reviewed_at,
        task:  r.media_kind === 'image' ? (tasksById[r.cvat_task_id] || null) : null,
        video: r.media_kind === 'video' ? (videosById[r.video_id] || null)   : null,
        reviewer: reviewer ? {
          id: reviewer.id, username: reviewer.username,
          role: rolesById[reviewer.id] || 'annotator',
          actions_validated_total: actionsTotals[reviewer.id] ?? 0,
        } : null,
        contester: contester ? {
          id: contester.id, username: contester.username,
          role: rolesById[contester.id] || 'annotator',
          actions_validated_total: actionsTotals[contester.id] ?? 0,
        } : null,
      };

      if (kind === 'annotation') {
        baseItem.species_id           = r.species_id;
        baseItem.certification_mode   = r.certification_mode;
        baseItem.certification_comment = r.certification_comment;
        baseItem.chosen_bbox          = r.chosen_bbox_data ?? null;
        baseItem.species              = r.species_id ? {
          id:               r.species_id,
          scientific_name:  r.species_scientific_name,
          usage_name:       r.species_usage_name,
          polynesian_name:  r.species_polynesian_name,
          tags:             r.species_tags || [],
        } : null;
        baseItem.image_width  = r.image_width  ?? null;
        baseItem.image_height = r.image_height ?? null;
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
  let imageTasksToDelete = [];
  let videosToDelete = [];
  let curatorJobsToReset = []; // [{ taskId, jobId }] — pour effacer les annotations CVAT après commit

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const selectCols = kind === 'annotation'
      ? 'id, cvat_task_id, \'image\'::text AS media_kind, NULL::int AS video_id'
      : 'id, cvat_task_id, video_id, media_kind';

    const { rows } = await client.query(`
      SELECT ${selectCols}
      FROM ${table}
      WHERE id = ANY($1) AND resolved_at IS NULL
      FOR UPDATE
    `, [ids]);

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'no open contestations matched' });
    }

    const resolvedIds = rows.map((r) => r.id);

    await client.query(`
      UPDATE ${table}
      SET resolution = $1, resolved_at = NOW(), resolved_by = $2
      WHERE id = ANY($3)
    `, [action, adminId, resolvedIds]);

    const imageTaskIds = rows.filter((r) => r.media_kind === 'image' && r.cvat_task_id).map((r) => r.cvat_task_id);
    const videoIds     = rows.filter((r) => r.media_kind === 'video' && r.video_id).map((r) => r.video_id);

    if (kind === 'media') {
      if (action === 'overturned') {
        if (imageTaskIds.length) {
          await client.query(`
            UPDATE media_moderation
            SET status='validated', reviewed_by=$1, reviewed_at=NOW()
            WHERE media_kind='image' AND cvat_task_id = ANY($2)
          `, [adminId, imageTaskIds]);
        }
        if (videoIds.length) {
          await client.query(`
            UPDATE media_moderation
            SET status='validated', reviewed_by=$1, reviewed_at=NOW()
            WHERE media_kind='video' AND video_id = ANY($2)
          `, [adminId, videoIds]);
        }
      } else {
        imageTasksToDelete = imageTaskIds;
        videosToDelete     = videoIds;
      }
    } else if (kind === 'annotation') {
      if (action === 'overturned' && imageTaskIds.length) {
        // Capture les jobs certifiés AVANT suppression, pour pouvoir vider
        // leurs annotations CVAT après commit.
        const certRows = await client.query(
          `SELECT cvat_task_id, cvat_job_id
           FROM curator_certifications
           WHERE cvat_task_id = ANY($1)`,
          [imageTaskIds],
        );
        curatorJobsToReset = certRows.rows.map((r) => ({
          taskId: r.cvat_task_id, jobId: r.cvat_job_id,
        }));

        // Efface l'audit de certification — le média repart vierge en pool curation.
        await client.query(
          `DELETE FROM curator_certifications WHERE cvat_task_id = ANY($1)`,
          [imageTaskIds],
        );

        await client.query(`
          UPDATE media_moderation
          SET curator_validated_at = NULL, curator_validated_by = NULL,
              assigned_curator_id = NULL, assigned_at = NULL, assigned_by = NULL
          WHERE media_kind='image' AND cvat_task_id = ANY($1)
        `, [imageTaskIds]);
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    client.release();
    return res.status(500).json({ error: err.message });
  }
  client.release();

  const deleteErrors = [];
  const cleanedTasks = [];
  for (const taskId of imageTasksToDelete) {
    try {
      await cvatDelete(`/tasks/${taskId}`);
      cleanedTasks.push(taskId);
    } catch (err) {
      const status = err.response?.status;
      if (status === 404) cleanedTasks.push(taskId);
      else {
        deleteErrors.push({ task_id: taskId, status, message: err.message });
        console.warn(`[admin/contestations] CVAT delete task ${taskId}:`, err.response?.data ?? err.message);
      }
    }
  }
  if (cleanedTasks.length > 0) {
    await pool.query(
      "UPDATE media_moderation SET binaries_deleted_at = NOW() WHERE media_kind='image' AND cvat_task_id = ANY($1)",
      [cleanedTasks],
    );
  }

  for (const { taskId, jobId } of curatorJobsToReset) {
    try {
      const existing = await cvatGet(`/jobs/${jobId}/annotations`);
      await cvatPut(`/jobs/${jobId}/annotations`, {
        version: existing.data?.version ?? 0,
        tags:    existing.data?.tags ?? [],
        shapes:  [],
        tracks:  existing.data?.tracks ?? [],
      });
    } catch (err) {
      deleteErrors.push({ task_id: taskId, job_id: jobId, message: err.message });
      console.warn(`[admin/contestations] CVAT reset job ${jobId} (task ${taskId}):`, err.response?.data ?? err.message);
    }
  }

  for (const vid of videosToDelete) {
    try {
      await pool.query('UPDATE user_videos SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL', [vid]);
      await deleteVideoFiles(vid);
      await pool.query(
        "UPDATE media_moderation SET binaries_deleted_at = NOW() WHERE media_kind='video' AND video_id = $1",
        [vid],
      );
    } catch (err) {
      deleteErrors.push({ video_id: vid, message: err.message });
      console.warn(`[admin/contestations] video delete ${vid}:`, err.message);
    }
  }

  recordAction(adminId, 'contestation.resolved', {
    payload: {
      kind, action, contestation_ids: ids,
      cvat_delete_errors: deleteErrors.length,
    },
  });

  res.json({
    resolved: ids.length, kind, action,
    cvat_delete_errors: deleteErrors.length > 0 ? deleteErrors : undefined,
  });
});

module.exports = router;
