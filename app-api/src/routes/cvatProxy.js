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

async function proxyHandler(req, res) {
  const cvatPath = req.originalUrl.replace(/^\/cvat/, '');
  const url = `${CVAT_API}${cvatPath}`;
  const token = req.cvatToken;

  const upstreamHeaders = filterHeaders(req.headers);
  upstreamHeaders['Authorization'] = `Token ${token}`;
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

router.use(requireAuth, proxyHandler);

module.exports = router;
