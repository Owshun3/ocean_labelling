'use strict';

const express = require('express');
const net = require('net');
const fs = require('fs');
const os = require('os');
const axios = require('axios');
const { pool } = require('../../db');
const { getAdminToken } = require('../../lib/cvatAdmin');

const router = express.Router();
const CVAT_API = process.env.CVAT_API_URL || 'http://cvat_server:8080/api';

async function probeTcp(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const socket = new net.Socket();
    let done = false;
    const finish = (status, detail) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve({ status, latency_ms: Date.now() - t0, detail });
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish('ok', null));
    socket.once('timeout', () => finish('down', 'timeout'));
    socket.once('error',   (err) => finish('down', err.code || err.message));
    socket.connect(port, host);
  });
}

async function probePostgres() {
  const t0 = Date.now();
  try {
    await pool.query('SELECT 1');
    return { status: 'ok', latency_ms: Date.now() - t0, detail: null };
  } catch (err) {
    return { status: 'down', latency_ms: Date.now() - t0, detail: err.message };
  }
}

async function probeCvatApi() {
  const t0 = Date.now();
  try {
    const token = await getAdminToken();
    const resp = await axios.get(`${CVAT_API}/server/about`, {
      headers: { Authorization: `Token ${token}`, Host: 'localhost', Accept: 'application/vnd.cvat+json' },
      timeout: 3000,
    });
    const version = resp.data?.version || resp.data?.tag || null;
    return { status: 'ok', latency_ms: Date.now() - t0, detail: version ? `v${version}` : null };
  } catch (err) {
    return { status: 'down', latency_ms: Date.now() - t0, detail: err.response?.status ? `HTTP ${err.response.status}` : (err.code || err.message) };
  }
}

function readProcMeminfo() {
  try {
    const txt = fs.readFileSync('/proc/meminfo', 'utf-8');
    const grab = (key) => {
      const m = txt.match(new RegExp(`^${key}:\\s+(\\d+)\\s+kB`, 'm'));
      return m ? Number(m[1]) * 1024 : null;
    };
    return {
      mem_total_bytes:     grab('MemTotal'),
      mem_available_bytes: grab('MemAvailable'),
    };
  } catch {
    return { mem_total_bytes: null, mem_available_bytes: null };
  }
}

function readProcLoadavg() {
  try {
    const parts = fs.readFileSync('/proc/loadavg', 'utf-8').split(' ');
    return {
      loadavg_1m:  Number(parts[0]) || null,
      loadavg_5m:  Number(parts[1]) || null,
      loadavg_15m: Number(parts[2]) || null,
    };
  } catch {
    return { loadavg_1m: null, loadavg_5m: null, loadavg_15m: null };
  }
}

async function dbSize() {
  try {
    const { rows } = await pool.query('SELECT pg_database_size(current_database()) AS bytes');
    return Number(rows[0].bytes);
  } catch { return null; }
}

async function activeSessionsCount() {
  try {
    const { rows } = await pool.query('SELECT COUNT(*) AS n FROM app_sessions WHERE expires_at > NOW()');
    return Number(rows[0].n);
  } catch { return null; }
}

router.get('/', async (_req, res) => {
  const SERVICES = [
    { id: 'postgres',     name: 'PostgreSQL (app-api)', probe: probePostgres },
    { id: 'cvat_api',     name: 'CVAT API',             probe: probeCvatApi },
    { id: 'cvat_db',      name: 'PostgreSQL (CVAT)',    probe: () => probeTcp('cvat_db',          5432) },
    { id: 'cvat_redis_inmem',  name: 'Redis (in-memory)', probe: () => probeTcp('cvat_redis_inmem',  6379) },
    { id: 'cvat_redis_ondisk', name: 'Redis (on-disk)',   probe: () => probeTcp('cvat_redis_ondisk', 6666) },
    { id: 'cvat_clickhouse',   name: 'ClickHouse',        probe: () => probeTcp('cvat_clickhouse',   8123) },
    { id: 'cvat_opa',          name: 'OPA',               probe: () => probeTcp('cvat_opa',          8181) },
    { id: 'cvat_ui',           name: 'CVAT UI',           probe: () => probeTcp('cvat_ui',           8000) },
  ];

  const t0 = Date.now();
  const probed = await Promise.all(SERVICES.map(async (s) => {
    const r = await s.probe();
    return { id: s.id, name: s.name, ...r };
  }));

  const [bytes, sessions] = await Promise.all([dbSize(), activeSessionsCount()]);
  const mem = readProcMeminfo();
  const load = readProcLoadavg();

  res.json({
    checked_at: new Date().toISOString(),
    probe_duration_ms: Date.now() - t0,
    services: probed,
    storage: {
      postgres_db_bytes: bytes,
    },
    process: {
      uptime_seconds:  Math.round(process.uptime()),
      node_version:    process.version,
      rss_bytes:       process.memoryUsage().rss,
      heap_used_bytes: process.memoryUsage().heapUsed,
    },
    system: {
      ...mem,
      ...load,
      cpu_count: os.cpus().length,
    },
    sessions: {
      active: sessions,
    },
  });
});

module.exports = router;
