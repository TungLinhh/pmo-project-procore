// Upload + upload list (inherited from old wizard)

import { Router } from 'express';
import multer from 'multer';
import { decodeUploadNames } from '../lib/upload-names.js';
import { requireAuth } from '../lib/auth.js';
import { permissionMiddleware } from '../lib/permission-middleware.js';
import { getDb } from '../db/index.js';
import { storage } from '../lib/storage.js';
import { detectDocType } from '../lib/excel.js';
import { checkProjectAccess } from '../lib/project-access.js';
import { findOrCreateProject, findOrCreateZone } from '../services/ingest/index.js';
import { ingestProjectLevel } from '../services/ingest/project_level.js';
import { canAccessUpload, uploadGlobalRole } from '../lib/upload-access.js';
import { UPLOAD_STATUS, statusFromCounts } from '../lib/upload-status.js';
import { stageFile } from '../lib/stage.js';
import { errorBody } from '../lib/error-body.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(permissionMiddleware);

const upload = decodeUploadNames(multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }));

router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const { project_code, zone_code, relative_path } = req.body || {};
  const db = getDb();
  const canCreateProject = ['admin', 'pm'].includes(String(req.user.role || '').toLowerCase());
  if (project_code) {
    const existing = await db.prepare('SELECT id FROM projects WHERE tenant_id = ? AND code = ?').getAsync(req.user.tenant_id, project_code);
    if (!existing && !canCreateProject) return res.status(403).json({ error: 'Only PM/admin can create a project from upload' });
    if (existing && !(await checkProjectAccess(req.user, existing.id))) return res.status(404).json({ error: 'Project not found' });
  }
  try {
    const docType = detectDocType(req.file.originalname);
    // Loại nạp **ngay** chỉ dành cho 3 loại cấp dự án, vì `ingestProjectLevel` chỉ
    // có nhánh thật cho chúng; gọi thẳng với loại khác sẽ rơi vào `else` và ghi
    // nhầm vào `construction_schedule_items` — đúng cái lỗi mà guard này chặn.
    const PROJECT_LEVEL = ['shop_drawing', 'material_supply', 'construction_schedule'];
    // Nhưng **stage không gắn dự án** thì được phép với MỌI loại đã nhận diện được,
    // vì ở nhánh đó không có `else` nào chạy sai: chỉ tạo hàng `STAGED` rồi chờ
    // `configure` (nơi người dùng chọn loại) — đúng như thông điệp `hint` bên dưới
    // và như ý định đã viết ở dòng "project_code is optional" ngay bên dưới.
    //
    // Trước đây guard ở đây chặn luôn cả hai, nên:
    //  • không nạp được báo cáo ngày từ giao diện (`UploadWizard` gọi đúng
    //    `POST /api/upload`), dù `INGESTORS` có `daily_report` và wizard
    //    `configure → preview → commit` chạy được với nó;
    //  • nhập nhiều file / zip cũng chết theo, vì cùng một endpoint.
    // Nghĩa là trong 18 loại tài liệu mà hệ thống hỗ trợ, chỉ 3 loại nạp được.
    // `unknown` chỉ chặn khi **có** `project_code`. Nạp thẳng vào dự án thì loại quyết
    // định `ingestProjectLevel` chạy nhánh nào, nên phải biết loại. Còn stage thì chỉ tạo
    // hàng `STAGED` rồi chờ `configure` — không có nhánh nào chạy sai, và tên không nhận
    // diện được chính là loại việc hàng đợi review sinh ra để xử lý.
    //
    // Trước đây vế `docType === 'unknown'` không phụ thuộc `project_code`, nên `hint` bên
    // dưới mô tả một luồng **không tồn tại** (bỏ `project_code` vẫn 422) ⇒ người dùng bị
    // kẹt, và bài kiểm cũ (`drilldown-lineage`, `p1-generic-rows`) dùng tên như
    // `sched-drill.xlsx` chết 7 khẳng định liên tiếp.
    if (project_code && (docType === 'unknown' || !PROJECT_LEVEL.includes(docType))) {
      return res.status(422).json({
        error: docType === 'unknown'
          ? `Không nhận diện được loại tài liệu từ tên file: "${req.file.originalname}". `
            + 'Đổi tên file theo từ khoá (báo cáo/daily, shop, vật tư, tiến độ…) để nạp thẳng vào dự án, '
            + 'hoặc bỏ `project_code` để stage rồi chọn Loại tài liệu ở /hq/uploads.'
          : `Loại "${docType}" không nạp thẳng vào dự án được — chỉ ${PROJECT_LEVEL.join(', ')} nạp ngay. `
            + 'Bỏ `project_code` để stage rồi chọn loại ở bước kế tiếp.',
        detected_doc_type: docType,
        hint: 'POST /api/upload (không kèm project_code) để stage rồi chọn Loại tài liệu ở /hq/uploads.',
      });
    }
    // Staged record (shared stageFile helper): lets the wizard configure /
    // preview / commit flow work on the same upload, and gives re-uploads
    // (same sha256) a stable identity.
    // project_code is optional: without it the file is staged only (STAGED)
    // for later classification in the wizard/batch review queue.
    // relative_path preserves bulk folder structure for the classifier.
    const project = project_code ? await findOrCreateProject(req.user.tenant_id, project_code, req.body || {}) : null;
    const zone = project && zone_code ? await findOrCreateZone(project.id, zone_code) : null;
    const staged = await stageFile(db, {
      buffer: req.file.buffer, originalname: req.file.originalname, mimetype: req.file.mimetype,
      relativePath: relative_path || null, projectId: project?.id || null, zoneId: zone?.id || null, docType,
      tenantId: req.user.tenant_id, createdBy: req.user.id,
    });
    if (!project) {
      return res.status(201).json({
        ok: true, upload_id: staged.upload_id, staged_only: true, status: UPLOAD_STATUS.STAGED,
        project: null, zone: null,
        file: { key: staged.key, file_name: req.file.originalname, size: staged.size, hash: staged.hash },
        message: 'Staged without project. Configure via POST /api/upload/:id/configure or the batch review queue.',
      });
    }
    const result = await storage.withTempFile(staged.key, (fullPath) => ingestProjectLevel(fullPath, project.id, { docType, uploadId: staged.upload_id }));
    const totalRows = (result.ok || 0) + (result.errors || 0);
    const status = statusFromCounts(result.ok, result.errors);
    await db.prepare(
      `UPDATE file_uploads SET status = ?, total_rows = ?, ok_rows = ?, error_rows = ?, report_json = ? WHERE id = ?`
    ).runAsync(status, totalRows, result.ok || 0, result.errors || 0, JSON.stringify(result), staged.id);
    res.status(201).json({
      ok: true, upload_id: staged.upload_id, status,
      project: { id: project.id, code: project.code }, zone,
      file: { key: staged.key, file_name: req.file.originalname, size: staged.size, hash: staged.hash },
      result, total_rows: totalRows, ok_rows: result.ok || 0, error_rows: result.errors || 0,
    });
  } catch (e) {
    // stageFile raises 409 for "same bytes already attached to another
    // project"; hardcoding 500 turned a clear conflict into an internal error
    // and the client showed the message with the wrong severity.
    const status = e.status || 500;
    res.status(status).json(status < 500 ? { error: e.message } : errorBody(e));
  }
});

router.get('/', async (req, res) => {
  const db = getDb();
  const rows = uploadGlobalRole(req.user)
    ? await db.prepare('SELECT * FROM file_uploads ORDER BY created_at DESC LIMIT 100').allAsync()
    : await db.prepare(
      `SELECT f.* FROM file_uploads f
       LEFT JOIN project_members pm ON pm.project_id = f.project_id AND pm.user_id = ?
       WHERE (f.project_id IS NOT NULL AND pm.user_id IS NOT NULL)
          OR (f.project_id IS NULL AND f.created_by = ?)
       ORDER BY f.created_at DESC LIMIT 100`
    ).allAsync(req.user.id, req.user.id);
  res.json(rows);
});

async function findVisibleUpload(user, id) {
  const db = getDb();
  const row = await db.prepare('SELECT * FROM file_uploads WHERE id = ?').getAsync(id);
  return row && await canAccessUpload(user, row) ? row : null;
}

// Single upload row (drill-down source-file lookup).
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id must be integer' });
  const row = await findVisibleUpload(req.user, id);
  if (!row) return res.status(404).json({ error: 'Upload not found' });
  res.json({
    id: row.id, original_filename: row.original_filename, relative_path: row.relative_path,
    status: row.status, expected_doc_type: row.expected_doc_type, total_rows: row.total_rows,
    ok_rows: row.ok_rows, error_rows: row.error_rows, created_at: row.created_at,
  });
});

// Row-level drill-down for generic ingestors (generic_sheets has no other reader).
// Scoped by the upload's (project_id, expected_doc_type); domain types with
// dedicated tabs (schedule/shop/...) answer 404 with a pointer instead.
router.get('/:id/rows', async (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id must be integer' });
  const up = await findVisibleUpload(req.user, id);
  if (!up) return res.status(404).json({ error: 'Upload not found' });
  if (!up.project_id || !up.expected_doc_type) return res.status(404).json({ error: 'Upload not committed to a project yet' });
  try {
    // Scoped by upload when the writer recorded one. Rows ingested before the
    // column existed carry NULL, and for those we fall back to the project-wide
    // view — but we say so, instead of quietly mixing other files' rows in.
    //
    // Khoá lọc là `up.id`, KHÔNG phải `up.upload_id`: bảng `file_uploads` không có cột
    // `upload_id` nên `up.upload_id` luôn `undefined` ⇒ `byUpload` luôn rỗng ⇒ nhánh
    // "xem theo file" là **code chết** và mọi lần mở chi tiết đều rơi về toàn dự án.
    // Hai lỗi cộng lại (cột này + `generic_sheets.upload_id` luôn NULL vì
    // `services/ingest/index.js` không truyền `uploadId` xuống) khiến 7 loại tài liệu
    // không bao giờ hiện đúng dòng của file đang xem.
    const byUpload = await db.prepare(
      'SELECT source_sheet, ordinal, col_1, col_2, col_3, col_4, col_5, col_6, col_7, col_8, col_9, col_10 FROM generic_sheets WHERE project_id = $1 AND doc_type = $2 AND upload_id = $3 ORDER BY source_sheet, ordinal LIMIT 500'
    ).allAsync(up.project_id, up.expected_doc_type, up.id);
    const scoped = byUpload.length > 0;
    const rows = scoped ? byUpload : await db.prepare(
      'SELECT source_sheet, ordinal, col_1, col_2, col_3, col_4, col_5, col_6, col_7, col_8, col_9, col_10 FROM generic_sheets WHERE project_id = $1 AND doc_type = $2 ORDER BY source_sheet, ordinal LIMIT 500'
    ).allAsync(up.project_id, up.expected_doc_type);
    if (!rows.length) return res.status(404).json({ error: 'Loại này xem ở tab chuyên biệt (Progress/Shop/Materials/Payment)' });
    res.json({
      upload_id: id, doc_type: up.expected_doc_type, count: rows.length, rows,
      scope: scoped ? 'upload' : 'project (file chưa ghi dòng nào — xem toàn dự án)',
    });
  } catch (e) {
    res.status(e.status || 500).json(errorBody(e));
  }
});
// Skipped/marker rows carry no content → 404 with the skip reason.
// Download the original staged file (drill-down "view original file" link).
// Skipped/marker rows carry no content → 404 with the skip reason.
router.get('/:id/download', async (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id must be integer' });
  const row = await findVisibleUpload(req.user, id);
  if (!row) return res.status(404).json({ error: 'Upload not found' });
  if (!row.storage_key) return res.status(404).json({ error: row.skip_reason || 'No file content for this upload' });
  if (!(await storage.exists(row.storage_key))) return res.status(404).json({ error: 'File missing from storage' });
  await storage.download(res, row.storage_key, row.original_filename || `upload-${row.id}.xlsx`);
});

export default router;
