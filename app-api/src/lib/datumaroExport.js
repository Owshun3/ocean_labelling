'use strict';

const archiver = require('archiver');
const axios    = require('axios');
const { pool } = require('../db');
const { getAdminToken } = require('./cvatAdmin');

const CVAT = process.env.CVAT_API_URL || 'http://cvat_server:8080/api';

const VALID_SOURCE_TYPES = new Set(['all', 'image', 'video_frame']);

async function getPlatformName() {
  try {
    const { rows } = await pool.query("SELECT value FROM app_settings WHERE key = 'platform.name'");
    const v = rows[0]?.value;
    return (typeof v === 'string' && v.trim().length > 0) ? v.trim() : 'Ora te Fenua';
  } catch { return 'Ora te Fenua'; }
}

function readJpegSize(buf) {
  if (!buf || buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length - 8) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0xd9) return null;
    const segLen = buf.readUInt16BE(i + 2);
    const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSOF) {
      const height = buf.readUInt16BE(i + 5);
      const width  = buf.readUInt16BE(i + 7);
      return { width, height };
    }
    i += 2 + segLen;
  }
  return null;
}

function parseFilters(body) {
  const b = body && typeof body === 'object' ? body : {};
  const f = {};
  const from = typeof b.date_from === 'string' && b.date_from.length >= 10 ? b.date_from : null;
  const to   = typeof b.date_to   === 'string' && b.date_to.length   >= 10 ? b.date_to   : null;
  if (from && to && from > to) { f.date_from = to; f.date_to = from; }
  else { if (from) f.date_from = from; if (to) f.date_to = to; }
  f.species_ids = Array.isArray(b.species_ids)
    ? b.species_ids.filter((n) => Number.isInteger(n) && n > 0) : [];
  f.tags        = Array.isArray(b.tags)
    ? b.tags.filter((t) => typeof t === 'string' && t.length > 0).slice(0, 50) : [];
  f.source_type = VALID_SOURCE_TYPES.has(b.source_type) ? b.source_type : 'all';
  f.include_metadata = b.include_metadata !== false;
  return f;
}

function buildWhere(filters) {
  const where = [
    "mm.media_kind = 'image'",
    "mm.curator_validated_at IS NOT NULL",
    "mm.binaries_deleted_at IS NULL",
  ];
  const params = [];
  let p = 1;
  if (filters.date_from)  { where.push(`mm.curator_validated_at >= $${p++}`); params.push(filters.date_from); }
  if (filters.date_to)    { where.push(`mm.curator_validated_at <= $${p++}`); params.push(filters.date_to); }
  if (filters.species_ids.length) { where.push(`cc.species_id = ANY($${p++})`); params.push(filters.species_ids); }
  if (filters.tags.length)        { where.push(`s.tags && $${p++}`);            params.push(filters.tags); }
  if (filters.source_type === 'image')        where.push('md.source_video_id IS NULL');
  if (filters.source_type === 'video_frame')  where.push('md.source_video_id IS NOT NULL');
  return { sql: `WHERE ${where.join(' AND ')}`, params };
}

const FROM_JOIN = `
  FROM media_moderation mm
  JOIN LATERAL (
    SELECT * FROM curator_certifications c
    WHERE c.cvat_task_id = mm.cvat_task_id
    ORDER BY c.certified_at DESC
    LIMIT 1
  ) cc ON TRUE
  LEFT JOIN species        s  ON s.id = cc.species_id
  LEFT JOIN media_metadata md ON md.cvat_task_id = mm.cvat_task_id
`;

function bboxFromChosen(chosen) {
  if (!chosen) return null;
  const pts = chosen.points || chosen.bbox || null;
  if (!Array.isArray(pts) || pts.length < 4) return null;
  const [x1, y1, x2, y2] = pts.map(Number);
  if ([x1, y1, x2, y2].some((n) => !Number.isFinite(n))) return null;
  return [Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)];
}

async function computePreview(filters) {
  const { sql, params } = buildWhere(filters);
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n ${FROM_JOIN} ${sql}`, params);
  const breakdownQ = await pool.query(`
    SELECT
      SUM(CASE WHEN md.source_video_id IS NULL     THEN 1 ELSE 0 END)::int AS image_count,
      SUM(CASE WHEN md.source_video_id IS NOT NULL THEN 1 ELSE 0 END)::int AS frame_count,
      COUNT(DISTINCT s.id)::int                                            AS distinct_species,
      COUNT(DISTINCT mm.uploader_id)::int                                  AS distinct_uploaders
    ${FROM_JOIN} ${sql}
  `, params);
  return { count: rows[0].n, breakdown: breakdownQ.rows[0], filters };
}

async function streamExportZip(res, filters, actor, originContext = 'admin') {
  const { recordAction } = require('./auditLog');
  const { sql, params } = buildWhere(filters);

  const SELECT = `
    SELECT
      mm.cvat_task_id, mm.uploader_id, mm.curator_validated_at,
      cc.id              AS certification_id,
      cc.curator_id, cc.mode, cc.chosen_bbox_data, cc.certified_at, cc.curator_comment,
      s.id               AS species_id,
      s.name             AS species_name,
      s.scientific_name, s.usage_name, s.polynesian_name,
      s.tags             AS species_tags,
      md.gps_latitude, md.gps_longitude, md.taken_at,
      md.camera_make, md.camera_model, md.image_width, md.image_height,
      md.source_video_id, md.source_frame_time_ms
  `;

  let rows;
  try {
    const result = await pool.query(`${SELECT} ${FROM_JOIN} ${sql} ORDER BY mm.curator_validated_at ASC`, params);
    rows = result.rows;
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Aucun média ne correspond aux filtres.' });
  }

  const labelIndex = new Map();
  const labels = [];
  rows.forEach((r) => {
    if (r.species_id === null || labelIndex.has(r.species_id)) return;
    labelIndex.set(r.species_id, labels.length);
    labels.push({
      name: r.scientific_name || r.usage_name || r.species_name || `species_${r.species_id}`,
      parent: '',
      attributes: ['species_id', 'usage_name', 'polynesian_name', 'tags'],
    });
  });

  const items = rows.map((r) => {
    const bbox = bboxFromChosen(r.chosen_bbox_data);
    const annotation = bbox ? {
      id: r.certification_id, type: 'bbox',
      label_id: r.species_id !== null ? labelIndex.get(r.species_id) : -1,
      group: 0, z_order: 0,
      attributes: {
        certified_at: r.certified_at, mode: r.mode,
        curator_id: r.curator_id, curator_comment: r.curator_comment || '',
        species_id: r.species_id,
        usage_name: r.usage_name || '', polynesian_name: r.polynesian_name || '',
        tags: r.species_tags || [],
      },
      bbox,
    } : null;
    const itemAttrs = filters.include_metadata ? {
      cvat_task_id: r.cvat_task_id, uploader_id: r.uploader_id,
      curator_validated_at: r.curator_validated_at,
      gps_latitude: r.gps_latitude, gps_longitude: r.gps_longitude,
      taken_at: r.taken_at, camera_make: r.camera_make, camera_model: r.camera_model,
      source_video_id: r.source_video_id, source_frame_time_ms: r.source_frame_time_ms,
    } : {};
    return {
      id: `task_${r.cvat_task_id}`, subset: 'default',
      annotations: annotation ? [annotation] : [],
      image: {
        path: `images/task_${r.cvat_task_id}.jpg`,
        size: r.image_height && r.image_width ? [r.image_height, r.image_width] : [0, 0],
      },
      attr: itemAttrs,
    };
  });

  const platformName = await getPlatformName();
  const datumaro = {
    info: {
      title: `${platformName} — export`, format: 'datumaro_1.0',
      exported_at: new Date().toISOString(),
      exported_by: actor.id,
      exported_origin: originContext,
      filters, item_count: items.length,
    },
    categories: { label: { labels, attributes: ['species_id', 'usage_name', 'polynesian_name', 'tags'] } },
    items,
  };

  const slug = platformName.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'export';
  const filename = `${slug}-${new Date().toISOString().slice(0, 10)}-${items.length}items.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');

  const archive = archiver('zip', { zlib: { level: 5 } });
  archive.on('warning', (err) => console.warn('[export] zip warning', err.message));
  archive.on('error',   (err) => {
    console.error('[export] zip error', err);
    try { res.destroy(err); } catch (_) {}
  });
  archive.pipe(res);

  archive.append(buildReadme(filters, items.length, platformName, originContext), { name: 'README.md' });

  const itemById = new Map(items.map((it) => [it.id, it]));
  const token = await getAdminToken();
  let imageFailures = 0;
  for (const r of rows) {
    try {
      const imgResp = await axios.get(`${CVAT}/tasks/${r.cvat_task_id}/data`, {
        params: { type: 'frame', number: 0, quality: 'original' },
        headers: {
          Authorization: `Token ${token}`,
          Accept: 'application/vnd.cvat+json, application/json, text/plain, */*',
          Host: 'localhost',
        },
        responseType: 'arraybuffer',
        timeout: 30_000,
      });
      const buf = Buffer.from(imgResp.data);
      const item = itemById.get(`task_${r.cvat_task_id}`);
      if (item && (!item.image.size[0] || !item.image.size[1])) {
        const dims = readJpegSize(buf);
        if (dims) item.image.size = [dims.height, dims.width];
      }
      archive.append(buf, { name: `images/task_${r.cvat_task_id}.jpg` });
    } catch (err) {
      imageFailures += 1;
      console.warn(`[export] image task ${r.cvat_task_id} failed:`, err.response?.status ?? err.message);
    }
  }

  archive.append(JSON.stringify(datumaro, null, 2), { name: 'annotations/default.json' });
  await archive.finalize();

  recordAction(actor.id, 'data.export', {
    payload: { item_count: items.length, image_failures: imageFailures, filters, origin: originContext },
  });
}

function buildReadme(filters, count, platformName, originContext) {
  const originLine = originContext === 'chercheur-approved'
    ? 'Export issu d\'une demande chercheur approuvée par l\'administrateur.'
    : 'Export direct par l\'administrateur.';
  return [
    `# ${platformName} — Export Datumaro 1.0`,
    '',
    originLine,
    `Généré le ${new Date().toISOString()}.`,
    `Nombre d'items : ${count}.`,
    '',
    '## Filtres appliqués',
    '```json',
    JSON.stringify(filters, null, 2),
    '```',
    '',
    '## Contenu du zip',
    '- `annotations/default.json` : dataset Datumaro 1.0 (labels + items + annotations).',
    '- `images/task_<id>.jpg` : image originale (sans EXIF — stripped à l\'upload).',
    '',
    '## Schéma Datumaro 1.0',
    'C\'est un **fichier JSON unique** qui référence toutes les images et leurs annotations.',
    'Vérifie `items[].annotations[].bbox` (format `[x, y, w, h]`) et',
    '`items[].annotations[].label_id` (index dans `categories.label.labels`).',
    '',
    'Pour importer :',
    '- Datumaro CLI : `datum project import -f datumaro_1.0 <dossier-décompressé>`',
    '- CVAT : « Create from dataset » → format « Datumaro 1.0 ».',
  ].join('\n');
}

module.exports = {
  parseFilters,
  computePreview,
  streamExportZip,
  getPlatformName,
};
