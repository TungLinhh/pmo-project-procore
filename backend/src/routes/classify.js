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
import { storage } from '../lib/storage.js';
import { UPLOAD_STATUS } from '../lib/upload-status.js';
import { readRollupPercents, crossCheckProject, compareRollup } from '../lib/crosscheck.js';
import { checkProjectAccess } from '../lib/project-access.js';
import { canAccessUpload } from '../lib/upload-access.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(permissionMiddleware);

router.post('/classify', async (req, res) => {
  const db = getDb();
  const { upload_ids } = req.body || {};
  const requestedIds = Array.isArray(upload_ids) ? upload_ids.map(Number).filter(Number.isInteger) : [];
  if (upload_ids != null && (!Array.isArray(upload_ids) || requestedIds.length !== upload_ids.length)) {
    return res.status(400).json({ error: 'upload_ids must be an array of integers' });
  }
  const rows = requestedIds.length
    ? await db.prepare('SELECT * FROM file_uploads WHERE id = ANY(?)').allAsync(requestedIds)
    : await db.prepare(`SELECT * FROM file_uploads WHERE status = '${UPLOAD_STATUS.STAGED}' ORDER BY id LIMIT 500`).allAsync();
  const allowedRows = [];
  for (const row of rows) {
    if (await canAccessUpload(req.user, row)) allowedRows.push(row);
    else if (requestedIds.length) return res.status(404).json({ error: 'Upload not found' });
  }
  const out = [];
  for (const u of allowedRows) {
    const c = classifyFile(u.relative_path || u.original_filename, u.original_filename);
    let status = u.status;
    let skipReason = u.skip_reason;
    let probe = null;
    if (u.storage_key) {
      try {
        probe = await storage.withTempFile(u.storage_key, (fullPath) => probeWorkbook(fullPath));
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

// Hàng đợi review. `canAccessUpload` **không phải** biểu thức SQL — nó cần một
// vòng `await` cho mỗi dòng — nên không thể đẩy vào `WHERE` cùng câu truy vấn. Hệ quả
// của cách làm cũ (`LIMIT 200` rồi mới lọc quyền): 200 dòng đầu có thể **toàn** là dòng
// người đó không được xem, nên hàng đợi trông **rỗng** trong khi họ có việc. Người thuộc
// một project trong tenant nhiều project gặp đúng lỗi này.
//
// Cách sửa: lấy theo **lô** cho tới khi đủ `limit` dòng đã qua bộ lọc quyền, thay vì
// lấy một lô rồi cắt. `limit` mặc định 200, trần 1000. Cần `offset` để phân trang.
const REVIEW_BATCH = 400;
const REVIEW_MAX = 1000;

router.get('/review', async (req, res) => {
  const db = getDb();
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 200, 1), REVIEW_MAX);
  const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);

  const visible = [];
  let scanned = 0;
  let skipped = 0;
  // Quét tối đa `REVIEW_MAX` dòng thô, dừng sớm khi đã đủ `limit` dòng nhìn thấy.
  // `has_more` nói cho giao diện biết còn dòng nào ngoài cửa sổ này không.
  while (scanned < REVIEW_MAX && visible.length < limit) {
    const batch = await db.prepare(`
      SELECT u.*, p.code AS project_code, z.code AS zone_code
      FROM file_uploads u
      LEFT JOIN projects p ON p.id = u.project_id
      LEFT JOIN zones z ON z.id = u.zone_id
      ORDER BY u.created_at DESC, u.id DESC
      LIMIT ? OFFSET ?
    `).allAsync(REVIEW_BATCH, offset + scanned);
    if (!batch.length) break;
    scanned += batch.length;
    for (const row of batch) {
      if (await canAccessUpload(req.user, row)) {
        visible.push(row);
        if (visible.length >= limit) break;
      } else {
        skipped += 1;
      }
    }
    // Hết bảng rồi mà vẫn chưa đủ ⇒ không còn gì để quét.
    if (batch.length < REVIEW_BATCH) break;
  }

  res.json({
    rows: visible.map((r) => ({
      ...r,
      classification: safeParse(r.report_json)?.classification || null,
    })),
    limit,
    offset,
    scanned,
    skipped_no_access: skipped,
    has_more: visible.length >= limit,
    note: skipped > 0
      ? `${skipped} dòng bị bỏ vì bạn không có quyền xem — hàng đợi KHÔNG rỗng`
      : 'Không có dòng nào bị bỏ vì thiếu quyền.',
  });
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
  if (!upload?.storage_key || !(await canAccessUpload(req.user, upload))) return res.status(404).json({ error: 'Upload file not found' });
  if (!(await checkProjectAccess(req.user, Number(project_id)))) return res.status(404).json({ error: 'Project not found' });
  if (upload.project_id && Number(upload.project_id) !== Number(project_id)) return res.status(404).json({ error: 'Upload not found' });
  const fam = safeParse(upload.report_json)?.classification?.family;
  const resolvedKind = kind === 'auto'
    ? (fam === 'schedule' ? 'schedule' : 'shop')
    : kind;
  if (!['shop', 'schedule'].includes(resolvedKind)) return res.status(400).json({ error: 'kind must be shop|schedule' });
  const rollup = await storage.withTempFile(upload.storage_key, (fullPath) => readRollupPercents(fullPath));
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
