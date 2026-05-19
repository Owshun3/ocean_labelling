'use strict';

const express  = require('express');
const archiver = require('archiver');
const axios    = require('axios');
const { pool } = require('../../db');
const { getAdminToken } = require('../../lib/cvatAdmin');
const { recordAction } = require('../../lib/auditLog');

const router = express.Router();
const CVAT   = process.env.CVAT_API_URL || 'http://cvat_server:8080/api';

const VALID_SOURCE_TYPES = new Set(['all', 'image', 'video_frame']);

function parseFilters(body) {
  const b = body && typeof body === 'object' ? body : {};
  const f = {};
  const from = typeof b.date_from === 'string' && b.date_from.length >= 10 ? b.date_from : null;
  const to   = typeof b.date_to   === 'string' && b.date_to.length   >= 10 ? b.date_to   : null;
  // Plage cohérente : si from > to, on swap pour ne pas générer une requête vide silencieuse.
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

// Crée la clause WHERE + params positionnels. Joint sur curator_certifications
// (= la certification la plus récente pour le task), media_metadata, species.
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

// Sélection complète : la certification curator la plus récente par task,
// + species (peut être NULL si jamais l'espèce a été supprimée), + EXIF.
// LATERAL JOIN: 1 ligne curator_certifications par task (la plus récente).
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

// Bbox normalisée [x, y, w, h] depuis le payload curator stocké.
// Le studio curator stocke `{ points: [x1, y1, x2, y2] }` (cf. project_curator_studio).
function bboxFromChosen(chosen) {
  if (!chosen) return null;
  const pts = chosen.points || chosen.bbox || null;
  if (!Array.isArray(pts) || pts.length < 4) return null;
  const [x1, y1, x2, y2] = pts.map(Number);
  if ([x1, y1, x2, y2].some((n) => !Number.isFinite(n))) return null;
  return [Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)];
}

router.post('/preview', async (req, res) => {
  const filters = parseFilters(req.body);
  const { sql, params } = buildWhere(filters);
  try {
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS n ${FROM_JOIN} ${sql}`, params);
    const breakdownQ = await pool.query(`
      SELECT
        SUM(CASE WHEN md.source_video_id IS NULL     THEN 1 ELSE 0 END)::int AS image_count,
        SUM(CASE WHEN md.source_video_id IS NOT NULL THEN 1 ELSE 0 END)::int AS frame_count,
        COUNT(DISTINCT s.id)::int                                           AS distinct_species,
        COUNT(DISTINCT mm.uploader_id)::int                                  AS distinct_uploaders
      ${FROM_JOIN} ${sql}
    `, params);
    res.json({
      count: rows[0].n,
      breakdown: breakdownQ.rows[0],
      filters,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET helper pour l'UI filtre : tags distincts déclarés sur les espèces approuvées.
router.get('/facets', async (_req, res) => {
  try {
    const tagsQ = await pool.query(`
      SELECT DISTINCT t
      FROM species, unnest(species.tags) AS t
      WHERE species.status = 'approved'
      ORDER BY t ASC
    `);
    res.json({ tags: tagsQ.rows.map((r) => r.t) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/run', async (req, res) => {
  const filters = parseFilters(req.body);
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

  // Construit le catalogue de labels Datumaro (par species_id rencontré).
  const labelIndex = new Map();
  const labels     = [];
  rows.forEach((r) => {
    if (r.species_id === null || labelIndex.has(r.species_id)) return;
    labelIndex.set(r.species_id, labels.length);
    labels.push({
      name:   r.scientific_name || r.usage_name || r.species_name || `species_${r.species_id}`,
      parent: '',
      attributes: [
        'species_id',
        'usage_name',
        'polynesian_name',
        'tags',
      ],
    });
  });

  const items = rows.map((r) => {
    const bbox = bboxFromChosen(r.chosen_bbox_data);
    const annotation = bbox ? {
      id:        r.certification_id,
      type:      'bbox',
      label_id:  r.species_id !== null ? labelIndex.get(r.species_id) : -1,
      group:     0,
      z_order:   0,
      attributes: {
        certified_at:    r.certified_at,
        mode:            r.mode,
        curator_id:      r.curator_id,
        curator_comment: r.curator_comment || '',
        species_id:      r.species_id,
        usage_name:      r.usage_name      || '',
        polynesian_name: r.polynesian_name || '',
        tags:            r.species_tags    || [],
      },
      bbox,
    } : null;

    const itemAttrs = filters.include_metadata ? {
      cvat_task_id:         r.cvat_task_id,
      uploader_id:          r.uploader_id,
      curator_validated_at: r.curator_validated_at,
      gps_latitude:         r.gps_latitude,
      gps_longitude:        r.gps_longitude,
      taken_at:             r.taken_at,
      camera_make:          r.camera_make,
      camera_model:         r.camera_model,
      source_video_id:      r.source_video_id,
      source_frame_time_ms: r.source_frame_time_ms,
    } : {};

    return {
      id:          `task_${r.cvat_task_id}`,
      annotations: annotation ? [annotation] : [],
      image: {
        path: `images/task_${r.cvat_task_id}.jpg`,
        size: [r.image_height || 0, r.image_width || 0],
      },
      attr: itemAttrs,
    };
  });

  const datumaro = {
    info: {
      title:        'Ocean Labelling Export',
      format:       'datumaro_1.0',
      exported_at:  new Date().toISOString(),
      exported_by:  req.cvatUser.id,
      filters,
      item_count:   items.length,
    },
    categories: {
      label: { labels, attributes: ['species_id', 'usage_name', 'polynesian_name', 'tags'] },
    },
    items,
  };

  const filename = `ocean-export-${new Date().toISOString().slice(0, 10)}-${items.length}items.zip`;
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

  archive.append(JSON.stringify(datumaro, null, 2), { name: 'annotations/default.json' });
  archive.append(buildReadme(filters, items.length), { name: 'README.md' });

  const token = await getAdminToken();
  let imageFailures = 0;
  for (const r of rows) {
    try {
      const imgResp = await axios.get(`${CVAT}/tasks/${r.cvat_task_id}/data`, {
        params: { type: 'frame', number: 0, quality: 'original' },
        headers: {
          Authorization: `Token ${token}`,
          // CVAT exige son vendor Accept même pour les binaires (sinon 406).
          Accept: 'application/vnd.cvat+json, application/json, text/plain, */*',
          Host: 'localhost',
        },
        responseType: 'arraybuffer',
        timeout: 30_000,
      });
      archive.append(Buffer.from(imgResp.data), { name: `images/task_${r.cvat_task_id}.jpg` });
    } catch (err) {
      imageFailures += 1;
      console.warn(`[export] image task ${r.cvat_task_id} failed:`, err.response?.status ?? err.message);
    }
  }

  await archive.finalize();

  recordAction(req.cvatUser.id, 'data.export', {
    payload: {
      item_count: items.length,
      image_failures: imageFailures,
      filters,
    },
  });
});

function buildReadme(filters, count) {
  return [
    '# Ocean Labelling — Export Datumaro',
    '',
    `Généré le ${new Date().toISOString()}.`,
    `Nombre d'items : ${count}.`,
    '',
    '## Filtres appliqués',
    '```json',
    JSON.stringify(filters, null, 2),
    '```',
    '',
    '## Contenu',
    '- `annotations/default.json` : dataset Datumaro 1.0 (labels, items, bbox).',
    '- `images/task_<id>.jpg` : image originale (sans EXIF — stripped à l\'upload).',
    '',
    'Chaque item correspond à une tâche CVAT validée par un curator. La bbox est la',
    'certification finale (`chosen_bbox_data`). Les attributs item portent les méta',
    'EXIF + le lien vidéo d\'origine si la frame a été extraite d\'une vidéo.',
  ].join('\n');
}

module.exports = router;
