'use strict';

const { pool } = require('../db');

const TTL_MS = 30_000;
let cache = { value: false, message: 'Maintenance en cours, merci de revenir plus tard.', expiresAt: 0 };

async function refresh() {
  try {
    const { rows } = await pool.query(`
      SELECT key, value FROM app_settings
      WHERE key IN ('platform.maintenance_mode', 'platform.maintenance_message')
    `);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    cache = {
      value:     byKey['platform.maintenance_mode'] === 'true',
      message:   byKey['platform.maintenance_message'] || cache.message,
      expiresAt: Date.now() + TTL_MS,
    };
  } catch (err) {
    console.warn('[maintenance] refresh failed:', err.message);
    cache.expiresAt = Date.now() + 5_000;
  }
}

async function getMaintenanceState() {
  if (Date.now() >= cache.expiresAt) await refresh();
  return { active: cache.value, message: cache.message };
}

function invalidateMaintenanceCache() {
  cache.expiresAt = 0;
}

module.exports = { getMaintenanceState, invalidateMaintenanceCache };
