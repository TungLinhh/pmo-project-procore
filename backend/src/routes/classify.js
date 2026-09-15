// Classify + review queue: POST /api/upload/classify, GET /api/uploads/review.
// Classification never writes domain tables — it only fills expected_doc_type
// + report_json.classification and marks content-proven skips (locked /
// zero-cell reference). The review UI confirms project/zone/type via the
// existing wizard configure endpoint.
import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { permissionMiddleware } from '../lib/permission-middleware.js';
import { getDb } from '../db/index.js';
import { classifyFile, probeWorkbook } from '../lib/classify.js';
import { getFilePath } from '../lib/storage.js';
import { UPLOAD_STATUS } from '../lib/upload-status.js';
import { readRollupPercents, crossCheckProject, compareRollup } from '../lib/crosscheck.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(permissionMiddleware);

router.post('/classify', async (req, res) => {
  const db = getDb();
  const { upload_ids } = req.body || {};
  const rows = upload_ids?.length
    ? await db.prepare(`SELECT * FROM file_uploads WHERE id IN (${upload_ids.map((_, i) => `$${i + 1}`).join(',')})`).allAsync(...upload_ids)
    : await db.prepare(`SELECT * FROM file_uploads WHERE status = '${UPLOAD_STATUS.STAGED}' ORDER BY id LIMIT 500`).allAsync();
  const out = [];
  for (const u of rows) {
    const c = classifyFile(u.relative_path || u.original_filename, u.original_filename);
    let status = u.status;
    let skipReason = u.skip_reason;
    let probe = null;
    if (u.storage_key) {
      try {
        probe = await probeWorkbook(getFilePath(u.storage_key));
      } catch (e) {
        probe = { locked: false, sheets: [], empty: false, probe_error: e.message };
      }
      if (probe.locked) {
        status = UPLOAD_STATUS.SKIPPED_LOCKED;
        skipReason = 'Password-protected workbook';
      } else if (probe.empty && c.family === 'reference') {
        status = UPLOAD_STATUS.SKIPPED_REFERENCE;
        skipReason = 'Drawing-shapes only, no cell data';
      }
    }
    const classification = { ...c, probe: probe ? { locked: probe.locked, empty: probe.empty, sheets: probe.sheets?.map(s => s.name) } : null };
    await db.prepare(
      `UPDATE file_uploads SET expected_doc_type = COALESCE(?, expected_doc_type), status = ?, skip_reason = COALESCE(?, skip_reason), report_json = ? WHERE id = ?`
    ).runAsync(c.docType, status, skipReason, JSON.stringify({ classification }), u.id);
    out.push({ upload_id: u.id, relative_path: u.relative_path, original_filename: u.original_filename, status, skip_reason: skipReason, classification });
  }
  res.json({ ok: true, classified: out.length, files: out });
});

router.get('/review', async (req, res) => {
  const db = getDb();
  const rows = await db.prepare(`
    SELECT u.*, p.code AS project_code, z.code AS zone_code
    FROM file_uploads u
    LEFT JOIN projects p ON p.id = u.project_id
    LEFT JOIN zones z ON z.id = u.zone_id
    ORDER BY u.created_at DESC LIMIT 200
  `).allAsync();
  res.json(rows.map(r => ({
    ...r,
    classification: safeParse(r.report_json)?.classification || null,
  })));
});

function safeParse(v) {
  try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; }
}

// POST /api/upload/:id/crosscheck { project_id, kind: 'shop'|'schedule'|'auto' }
// Reads the staged ROLLUP workbook and compares its zone % against DB
// aggregates built from zone-detail commits. Read-only vs domain tables.
router.post('/:id/crosscheck', async (req, res) => {
  const db = getDb();
  const uploadId = Number(req.params.id);
  const { project_id, kind = 'auto', tolerance = 20 } = req.body || {};
  if (!project_id) return res.status(400).json({ error: 'project_id required' });
  const upload = await db.prepare('SELECT * FROM file_uploads WHERE id = ?').getAsync(uploadId);
  if (!upload?.storage_key) return res.status(404).json({ error: 'Upload file not found' });
  const fam = safeParse(upload.report_json)?.classification?.family;
  const resolvedKind = kind === 'auto'
    ? (fam === 'schedule' ? 'schedule' : 'shop')
    : kind;
  if (!['shop', 'schedule'].includes(resolvedKind)) return res.status(400).json({ error: 'kind must be shop|schedule' });
  const rollup = await readRollupPercents(getFilePath(upload.storage_key));
  const agg = await crossCheckProject(db, project_id, resolvedKind);
  const rows = compareRollup(rollup.rows, agg, Number(tolerance) || 20);
  const checked = rows.filter(r => r.ok !== null);
  res.json({
    upload_id: uploadId, project_id: Number(project_id), kind: resolvedKind,
    rollup_sheet: rollup.sheet, tolerance: Number(tolerance) || 20,
    zones: rows,
    summary: {
      zones_in_rollup: rollup.rows.length,
      zones_matched: checked.filter(r => r.ok).length,
      zones_off: checked.filter(r => !r.ok).length,
      zones_rollup_only: rows.filter(r => r.db_rows === 0).length,
      zones_db_only: rows.filter(r => r.rollup_pct === null).length,
    },
  });
});

export default router;
