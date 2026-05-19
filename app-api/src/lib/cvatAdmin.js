'use strict';

const axios = require('axios');

const CVAT = process.env.CVAT_API_URL || 'http://cvat_server:8080/api';

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

async function withFreshTokenOn401(fn) {
  try {
    return await fn(await getAdminToken());
  } catch (err) {
    if (err.response?.status === 401) {
      return fn(await getAdminToken(true));
    }
    throw err;
  }
}

async function cvatGet(path) {
  return withFreshTokenOn401((token) =>
    axios.get(`${CVAT}${path}`, { headers: adminHeaders(token) })
  );
}

async function cvatPatch(path, body) {
  return withFreshTokenOn401((token) =>
    axios.patch(`${CVAT}${path}`, body, { headers: adminHeaders(token) })
  );
}

async function cvatDelete(path) {
  return withFreshTokenOn401((token) =>
    axios.delete(`${CVAT}${path}`, { headers: adminHeaders(token) })
  );
}

async function cvatPut(path, body) {
  return withFreshTokenOn401((token) =>
    axios.put(`${CVAT}${path}`, body, { headers: adminHeaders(token) })
  );
}

module.exports = { getAdminToken, cvatGet, cvatPatch, cvatPut, cvatDelete, CVAT };
