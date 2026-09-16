// BIM model library, store-only v1 (Wave 3 C1): intake (.ifc ≤200MB),
// server-side metadata (storeys/spaces/schema via lib/bim-parse.js, capped),
// zone linking (suggest ranks, user confirms — never auto-assign).
// No browser viewer in v1 (route shows "coming"; see docs).
// Mount: /api (project list) + /api/bim (library ops). Enterprise flag.

import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireRole } from '../lib/auth.js';
import { permissionMiddleware } from '../lib/permission-middleware.js';
import { requireProjectAccess, checkProjectAccess } from '../lib/project-access.js';
import { requireFeature } from '../lib/entitlements.js';
import { getDb } from '../db/index.js';
import { withAudit } from '../lib/with-audit.js';
import { stageFile } from '../lib/stage.js';
import { storage } from '../lib/storage.js';
import { parseBimFile, BIM_CAPS } from '../lib/bim-parse.js';
import { UPLOAD_STATUS } from '../lib/upload-status.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(permissionMiddleware);
router.use(requireFeature('bim-library'));
router.use('/projects/:id', requireProjectAccess());

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: BIM_CAPS.maxBytes } });
const PROJECT_QUOTA_BYTES = Number(process.env.BIM_PROJECT_QUOTA_BYTES) || 2 * 1024 * 1024 * 1024;

// Zone guess from filename: trailing _CODE before extension (tower_BOH.ifc).
export function guessZoneFromFilename(name) {
  const base = String(name || '').split(/[\\/]/).pop() || '';
  const m = /_([A-Za-z0-9][A-Za-z0-9 .-]{0,10})\.ifc$/i.exec(base);
  return m ? m[1].toUpperCase() : null;
}

// POST /api/projects/:id/bim/models (multipart `file`, optional zone_code)
router.post('/projects/:id/bim/models', requireRole('admin', 'ceo', 'pm', 'site'), upload.single('file'), async (req, res) => {
  const db = getDb();
  if (!req.file) return res.status(400).json({ error: 'No file (field: file)' });
  if (!/\.ifc$/i.test(req.file.originalname)) return res.status(400).json({ error: 'BIM library accepts .ifc only' });
  const pid = Number(req.params.id);
  const used = await db.prepare(`SELECT COALESCE(SUM(file_size),0) AS s FROM file_uploads WHERE project_id = ? AND expected_doc_type = 'bim_model'`).getAsync(pid);
  if (Number(used?.s || 0) + req.file.size > PROJECT_QUOTA_BYTES) {
    return res.status(413).json({ error: `Project BIM quota exceeded (${Math.round(PROJECT_QUOTA_BYTES / 1e9)}GB)` });
  }
  let zoneId = null;
  if (req.body?.zone_code) {
    const z = await db.prepare('SELECT id FROM zones WHERE project_id = ? AND code = ?').getAsync(pid, String(req.body.zone_code).toUpperCase());
    if (!z) return res.status(404).json({ error: 'Zone not found in this project' });
    zoneId = z.id;
  } else {
    const guess = guessZoneFromFilename(req.file.originalname);
    if (guess) {
      const z = await db.prepare('SELECT id FROM zones WHERE project_id = ? AND code = ?').getAsync(pid, guess);
      if (z) zoneId = z.id;
    }
  }
  try {
    const staged = await stageFile(db, {
      buffer: req.file.buffer, originalname: req.file.originalname, mimetype: 'application/x-step',
      projectId: pid, zoneId, docType: 'bim_model', tenantId: req.user.tenant_id,
    });
    const meta = await storage.withTempFile(staged.key, (fullPath) => parseBimFile(fullPath));
    const row = await withAudit(req, {
      action: 'CREATE', resourceType: 'bim_model', resourceId: 0,
      context: { project_id: pid, upload_id: staged.upload_id },
      after: { filename: req.file.originalname, ...meta, zone_id: zoneId },
      note: `BIM model ${req.file.originalname} (${meta.storeys.length} tầng, ${meta.space_count} spaces)`,
    }, async (client) => {
      const r = await client.query(
        `UPDATE file_uploads SET status = 'SUCCESS', report_json = $1 WHERE id = $2 RETURNING *`,
        [JSON.stringify(meta), staged.upload_id]
      );
      return r.rows[0];
    });
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/projects/:id/bim-models — version list for the library table.
router.get('/projects/:id/bim-models', async (req, res) => {
  const db = getDb();
  res.json(await db.prepare(
    `SELECT f.id, f.original_filename, f.file_size, f.created_at, f.zone_id, z.code AS zone_code,
            f.status, f.report_json
     FROM file_uploads f LEFT JOIN zones z ON z.id = f.zone_id
     WHERE f.project_id = ? AND f.expected_doc_type = 'bim_model'
     ORDER BY f.created_at DESC LIMIT 200`
  ).allAsync(req.params.id));
});

// GET /api/bim/models/:id/zone-suggestions — ranked storey↔zone matches.
router.get('/bim/models/:id/zone-suggestions', async (req, res) => {
  const db = getDb();
  const f = await db.prepare(`SELECT * FROM file_uploads WHERE id = ? AND expected_doc_type = 'bim_model'`).getAsync(req.params.id);
  if (!f) return res.status(404).json({ error: 'Not found' });
  if (!(await checkProjectAccess(req.user, f.project_id))) return res.status(404).json({ error: 'Not found' });
  const zones = await db.prepare('SELECT id, code FROM zones WHERE project_id = ?').allAsync(f.project_id);
  const meta = typeof f.report_json === 'string' ? JSON.parse(f.report_json || '{}') : (f.report_json || {});
  const names = [...(meta.storeys || []).map((s) => s.name), ...((meta.spaces || []).map((s) => s.name))].filter(Boolean);
  const suggestions = [];
  for (const z of zones) {
    const code = String(z.code).toUpperCase();
    let score = 0;
    for (const n of names) {
      const up = String(n).toUpperCase();
      if (up === code) score += 3;
      else if (up.includes(code) || code.includes(up)) score += 1;
    }
    if (score > 0) suggestions.push({ zone_id: z.id, zone_code: z.code, score });
  }
  suggestions.sort((a, b) => b.score - a.score);
  res.json({ upload_id: f.id, current_zone_id: f.zone_id, suggestions: suggestions.slice(0, 5) });
});

// POST /api/bim/models/:id/link-zone {zone_id} — user-confirmed assignment.
router.post('/bim/models/:id/link-zone', requireRole('admin', 'ceo', 'pm'), async (req, res) => {
  const db = getDb();
  const { zone_id } = req.body || {};
  if (!Number.isInteger(zone_id)) return res.status(400).json({ error: 'zone_id must be integer' });
  const f = await db.prepare(`SELECT * FROM file_uploads WHERE id = ? AND expected_doc_type = 'bim_model'`).getAsync(req.params.id);
  if (!f) return res.status(404).json({ error: 'Not found' });
  if (!(await checkProjectAccess(req.user, f.project_id))) return res.status(404).json({ error: 'Not found' });
  const z = await db.prepare('SELECT id, code FROM zones WHERE id = ? AND project_id = ?').getAsync(zone_id, f.project_id);
  if (!z) return res.status(404).json({ error: 'Zone not found in this project' });
  try {
    const row = await withAudit(req, {
      action: 'UPDATE', resourceType: 'bim_model', resourceId: Number(f.id),
      context: { project_id: f.project_id },
      before: { zone_id: f.zone_id }, after: { zone_id: z.id },
      fieldChanges: [{ field: 'zone_id', from: f.zone_id, to: z.id }],
      note: `Gán model ${f.original_filename} → zone ${z.code}`,
    }, async (client) => {
      const r = await client.query(`UPDATE file_uploads SET zone_id = $1 WHERE id = $2 RETURNING *`, [z.id, f.id]);
      return r.rows[0];
    });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
