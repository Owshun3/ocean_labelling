'use strict';

const express = require('express');
const { pool } = require('../../db');
const { cvatGet } = require('../../lib/cvatAdmin');

const router = express.Router();

const KNOWN_ACTIONS = [
  'user.banned',
  'user.active_changed',
  'user.role_changed',
  'contestation.resolved',
  'setting.changed',
  'media.validated',
  'media.rejected',
  'media.auto_deleted',
  'curation.assigned',
  'species.edited',
  'species_edit.proposed',
  'species_edit.withdrawn',
  'species_edit.resolved',
];

const SYSTEM_ACTOR_ID = 0;

router.get('/', async (req, res) => {
  const limitRaw  = Number(req.query.limit);
  const offsetRaw = Number(req.query.offset);
  const limit     = Number.isInteger(limitRaw)  && limitRaw  > 0 && limitRaw  <= 200 ? limitRaw  : 50;
  const offset    = Number.isInteger(offsetRaw) && offsetRaw >= 0                    ? offsetRaw : 0;

  const action = typeof req.query.action === 'string' ? req.query.action : null;
  const actorId = Number.isInteger(Number(req.query.actor_id)) ? Number(req.query.actor_id) : null;

  const conditions = [];
  const params = [];
  if (action && KNOWN_ACTIONS.includes(action)) {
    params.push(action);
    conditions.push(`action = $${params.length}`);
  }
  if (actorId !== null) {
    params.push(actorId);
    conditions.push(`actor_id = $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const totalResult = await pool.query(`SELECT COUNT(*) AS n FROM admin_actions ${where}`, params);
    const total = Number(totalResult.rows[0].n);

    params.push(limit, offset);
    const rowsResult = await pool.query(`
      SELECT id, actor_id, action, target_type, target_id, payload, created_at
      FROM admin_actions
      ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const rows = rowsResult.rows;
    const actorIds = [...new Set(rows.map((r) => r.actor_id))];
    const usersById = {};
    await Promise.all(actorIds.map(async (id) => {
      if (id === SYSTEM_ACTOR_ID) {
        usersById[id] = { id, username: 'Système', is_superuser: false, is_staff: false, system: true };
        return;
      }
      try {
        const r = await cvatGet(`/users/${id}`);
        usersById[id] = { id: r.data.id, username: r.data.username, is_superuser: r.data.is_superuser, is_staff: r.data.is_staff };
      } catch { usersById[id] = { id, username: null, is_superuser: false, is_staff: false }; }
    }));

    const rolesById = {};
    if (actorIds.length > 0) {
      const rs = await pool.query('SELECT cvat_user_id, role FROM user_roles WHERE cvat_user_id = ANY($1)', [actorIds]);
      rs.rows.forEach((r) => { rolesById[r.cvat_user_id] = r.role; });
    }

    const results = rows.map((r) => {
      const u = usersById[r.actor_id];
      const role = u?.system ? 'system'
        : (u?.is_superuser || u?.is_staff) ? 'admin'
        : (rolesById[r.actor_id] ?? 'annotator');
      return {
        id:           r.id,
        actor:        { id: r.actor_id, username: u?.username ?? null, role },
        action:       r.action,
        target_type:  r.target_type,
        target_id:    r.target_id,
        payload:      r.payload,
        created_at:   r.created_at,
      };
    });

    res.json({ results, total, limit, offset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/actions', (_req, res) => {
  res.json({ actions: KNOWN_ACTIONS });
});

module.exports = router;
