'use strict';

const { pool } = require('../db');

async function recordAction(actorId, action, opts = {}) {
  const { targetType = null, targetId = null, payload = null } = opts;
  try {
    await pool.query(`
      INSERT INTO admin_actions (actor_id, action, target_type, target_id, payload)
      VALUES ($1, $2, $3, $4, $5)
    `, [actorId, action, targetType, targetId, payload ? JSON.stringify(payload) : null]);
  } catch (err) {
    console.warn('[audit] failed to record action', { action, err: err.message });
  }
}

module.exports = { recordAction };
