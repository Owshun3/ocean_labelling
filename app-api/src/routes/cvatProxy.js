const express = require('express');
const axios = require('axios');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const CVAT_API = process.env.CVAT_API_URL || 'http://cvat_server:8080/api';

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailers', 'transfer-encoding', 'upgrade',
  'content-length', 'host',
]);

function filterHeaders(src) {
  const out = {};
  for (const [k, v] of Object.entries(src || {})) {
    if (HOP_BY_HOP.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}

// Endpoints CVAT atteignables sans session (inscription, mot de passe oublié).
const PUBLIC_PATHS = [
  /^\/auth\/register\/?($|\?)/,
  /^\/auth\/password\/reset\/?($|\?)/,
];

function isPublicCvatPath(cvatPath) {
  return PUBLIC_PATHS.some((re) => re.test(cvatPath));
}

async function proxyHandler(req, res) {
  const cvatPath = req.originalUrl.replace(/^\/app-api/, '').replace(/^\/cvat/, '');
  const url = `${CVAT_API}${cvatPath}`;
  const token = req.cvatToken;

  const upstreamHeaders = filterHeaders(req.headers);
  if (token) upstreamHeaders['Authorization'] = `Token ${token}`;
  upstreamHeaders['Host'] = 'localhost';

  try {
    const resp = await axios({
      method: req.method,
      url,
      data: ['GET', 'HEAD', 'DELETE'].includes(req.method) ? undefined : req,
      headers: upstreamHeaders,
      responseType: 'stream',
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      validateStatus: () => true,
      timeout: 60000,
    });

    res.status(resp.status);
    for (const [k, v] of Object.entries(resp.headers || {})) {
      if (HOP_BY_HOP.has(k.toLowerCase())) continue;
      res.setHeader(k, v);
    }
    resp.data.pipe(res);
  } catch (err) {
    if (res.headersSent) return res.destroy();
    console.warn('[cvat-proxy] error', req.method, cvatPath, err.message);
    res.status(502).json({ error: 'CVAT upstream error', detail: err.message });
  }
}

// Auth conditionnelle : si la route fait partie de l'allowlist publique (register,
// reset password), on saute `requireAuth`. Sinon, comportement standard.
router.use((req, res, next) => {
  const cvatPath = req.originalUrl.replace(/^\/app-api/, '').replace(/^\/cvat/, '');
  if (isPublicCvatPath(cvatPath)) return proxyHandler(req, res);
  return requireAuth(req, res, () => proxyHandler(req, res));
});

module.exports = router;
