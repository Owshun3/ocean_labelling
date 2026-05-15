'use strict';

const express = require('express');
const { pool } = require('../../db');
const { cvatGet } = require('../../lib/cvatAdmin');
const { recordAction } = require('../../lib/auditLog');
const { fetchActionsTotals } = require('../../lib/userStats');
const { getConsensusThreshold, refreshAllPending } = require('../../lib/curationGate');

const router = express.Router();

const ELIGIBLE_CURATOR_ROLES = new Set(['admin', 'moderator', 'curator', 'chercheur']);

// Pool des médias éligibles à l'attribution :
//   passés en modération (validated), non encore curés, binaires intacts, sans attribution.
router.get('/pool', async (_req, res) => {
  try {
    const threshold = await getConsensusThreshold();
    const { rows } = await pool.query(`
      SELECT cvat_task_id, uploader_id, reviewed_at, annotated_jobs_count
      FROM media_moderation
      WHERE status = 'validated'
        AND curator_validated_at IS NULL
        AND binaries_deleted_at IS NULL
        AND assigned_curator_id IS NULL
        AND annotated_jobs_count >= $1
      ORDER BY reviewed_at ASC
      LIMIT 500
    `, [threshold]);
    if (rows.length === 0) return res.json({ results: [] });

    const uploaderIds = [...new Set(rows.map((r) => r.uploader_id))];
    const usersById = {};
    await Promise.all(uploaderIds.map(async (id) => {
      try {
        const r = await cvatGet(`/users/${id}`);
        usersById[id] = { id: r.data.id, username: r.data.username };
      } catch { usersById[id] = { id, username: null }; }
    }));

    const taskIds = rows.map((r) => r.cvat_task_id);
    const tasksById = {};
    await Promise.all(taskIds.map(async (id) => {
      try {
        const r = await cvatGet(`/tasks/${id}`);
        tasksById[id] = r.data;
      } catch (err) {
        if (err.response?.status !== 404) {
          console.warn(`[admin/curation] task ${id} fetch failed:`, err.message);
        }
      }
    }));

    const results = rows
      .filter((r) => tasksById[r.cvat_task_id])
      .map((r) => ({
        cvat_task_id: r.cvat_task_id,
        task_name:    tasksById[r.cvat_task_id].name,
        reviewed_at:  r.reviewed_at,
        uploader: usersById[r.uploader_id] ?? { id: r.uploader_id, username: null },
        annotated_jobs_count: r.annotated_jobs_count,
      }));

    res.json({ results, threshold });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Curators éligibles avec leur workload courant (pour aider l'admin à équilibrer).
router.get('/curators', async (_req, res) => {
  try {
    // 1. Tous les utilisateurs ayant un rôle éligible côté app_db
    const { rows: roleRows } = await pool.query(
      `SELECT cvat_user_id, role FROM user_roles WHERE role = ANY($1)`,
      [[...ELIGIBLE_CURATOR_ROLES]],
    );
    const roleMap = Object.fromEntries(roleRows.map((r) => [r.cvat_user_id, r.role]));
    const ids = roleRows.map((r) => r.cvat_user_id);

    // 2. Tous les superusers CVAT (= admin implicite) — fetch via users/self d'admin via le all-list helper
    // Au lieu de fetcher tous les CVAT users (lourd), on lit la liste pour récupérer les is_superuser.
    let cvatSuperuserIds = [];
    try {
      const allResp = await cvatGet('/users?page_size=200');
      cvatSuperuserIds = (allResp.data?.results ?? [])
        .filter((u) => u.is_superuser)
        .map((u) => u.id);
    } catch (err) {
      console.warn('[admin/curation] failed to list cvat users for superusers:', err.message);
    }

    const allCuratorIds = [...new Set([...ids, ...cvatSuperuserIds])];
    if (allCuratorIds.length === 0) return res.json({ results: [] });

    const usersById = {};
    await Promise.all(allCuratorIds.map(async (id) => {
      try {
        const r = await cvatGet(`/users/${id}`);
        usersById[id] = { id: r.data.id, username: r.data.username, is_superuser: r.data.is_superuser };
      } catch { /* ignore */ }
    }));

    const workloadQ = await pool.query(`
      SELECT assigned_curator_id AS id, COUNT(*)::int AS n
      FROM media_moderation
      WHERE assigned_curator_id = ANY($1)
        AND curator_validated_at IS NULL
        AND binaries_deleted_at IS NULL
      GROUP BY assigned_curator_id
    `, [allCuratorIds]);
    const workload = {};
    workloadQ.rows.forEach((r) => { workload[r.id] = r.n; });

    const actionsTotals = await fetchActionsTotals(allCuratorIds);

    const results = allCuratorIds
      .map((id) => {
        const u = usersById[id];
        if (!u || !u.username) return null;
        return {
          id,
          username: u.username,
          role: u.is_superuser ? 'admin' : (roleMap[id] ?? 'curator'),
          actions_validated_total: actionsTotals[id] ?? 0,
          pending_assignments: workload[id] ?? 0,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.username.localeCompare(b.username, 'fr'));

    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/refresh-counts', async (_req, res) => {
  try {
    const result = await refreshAllPending();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/assign', async (req, res) => {
  const taskIds = Array.isArray(req.body?.task_ids)
    ? req.body.task_ids.filter((n) => Number.isInteger(n) && n > 0)
    : [];
  const curatorId = Number(req.body?.curator_id);
  if (taskIds.length === 0) return res.status(400).json({ error: 'task_ids requis (entiers > 0)' });
  if (!Number.isFinite(curatorId)) return res.status(400).json({ error: 'curator_id requis' });

  // Vérifier que le curator a un rôle éligible (superuser ou role dans la whitelist)
  let curatorEligible = false;
  try {
    const r = await cvatGet(`/users/${curatorId}`);
    if (r.data.is_superuser || r.data.is_staff) curatorEligible = true;
  } catch {
    return res.status(404).json({ error: 'curator introuvable côté CVAT' });
  }
  if (!curatorEligible) {
    const { rows } = await pool.query('SELECT role FROM user_roles WHERE cvat_user_id = $1', [curatorId]);
    if (rows[0] && ELIGIBLE_CURATOR_ROLES.has(rows[0].role)) curatorEligible = true;
  }
  if (!curatorEligible) return res.status(400).json({ error: 'cet utilisateur n\'a pas un rôle de curator/chercheur/moderator/admin' });

  const adminId = req.cvatUser.id;
  try {
    const { rowCount } = await pool.query(`
      UPDATE media_moderation
      SET assigned_curator_id = $1, assigned_at = NOW(), assigned_by = $2
      WHERE cvat_task_id = ANY($3)
        AND status = 'validated'
        AND curator_validated_at IS NULL
        AND binaries_deleted_at IS NULL
        AND assigned_curator_id IS NULL
    `, [curatorId, adminId, taskIds]);

    if (rowCount > 0) {
      recordAction(adminId, 'curation.assigned', {
        targetType: 'user',
        targetId: curatorId,
        payload: { task_ids: taskIds, assigned: rowCount, requested: taskIds.length },
      });
    }

    res.json({ assigned: rowCount, requested: taskIds.length, curator_id: curatorId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
