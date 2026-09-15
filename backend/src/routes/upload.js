// Upload + upload list (inherited from old wizard)

import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../lib/auth.js';
import { permissionMiddleware } from '../lib/permission-middleware.js';
import { getDb } from '../db/index.js';
import { getFilePath, fileExists } from '../lib/storage.js';
import { detectDocType } from '../lib/excel.js';
import { findOrCreateProject, findOrCreateZone } from '../services/ingest/index.js';
import { ingestProjectLevel } from '../services/ingest/project_level.js';
import { UPLOAD_STATUS, statusFromCounts } from '../lib/upload-status.js';
import { stageFile } from '../lib/stage.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(permissionMiddleware);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const { project_code, zone_code, relative_path } = req.body || {};
  const db = getDb();
  try {
    const docType = detectDocType(req.file.originalname);
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
      tenantId: req.user.tenant_id,
    });
    if (!project) {
      return res.json({
        ok: true, upload_id: staged.upload_id, staged_only: true, status: UPLOAD_STATUS.STAGED,
        project: null, zone: null,
        file: { key: staged.key, file_name: req.file.originalname, size: staged.size, hash: staged.hash },
        message: 'Staged without project. Configure via POST /api/upload/:id/configure or the batch review queue.',
      });
    }
    const result = await ingestProjectLevel(getFilePath(staged.key), project.id, { docType, uploadId: staged.upload_id });
    const totalRows = (result.ok || 0) + (result.errors || 0);
    const status = statusFromCounts(result.ok, result.errors);
    await db.prepare(
      `UPDATE file_uploads SET status = ?, total_rows = ?, ok_rows = ?, error_rows = ?, report_json = ? WHERE id = ?`
    ).runAsync(status, totalRows, result.ok || 0, result.errors || 0, JSON.stringify(result), staged.id);
    res.json({
      ok: true, upload_id: staged.upload_id, status,
      project: { id: project.id, code: project.code }, zone,
      file: { key: staged.key, file_name: req.file.originalname, size: staged.size, hash: staged.hash },
      result, total_rows: totalRows, ok_rows: result.ok || 0, error_rows: result.errors || 0,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/', async (req, res) => {
  const db = getDb();
  const rows = await db.prepare('SELECT * FROM file_uploads ORDER BY created_at DESC LIMIT 100').allAsync();
  res.json(rows);
});

// Single upload row (drill-down source-file lookup).
router.get('/:id', async (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id must be integer' });
  const row = await db.prepare('SELECT id, original_filename, relative_path, status, expected_doc_type, total_rows, ok_rows, error_rows, created_at FROM file_uploads WHERE id = ?').getAsync(id);
  if (!row) return res.status(404).json({ error: 'Upload not found' });
  res.json(row);
});

// Row-level drill-down for generic ingestors (generic_sheets has no other reader).
// Scoped by the upload's (project_id, expected_doc_type); domain types with
// dedicated tabs (schedule/shop/...) answer 404 with a pointer instead.
router.get('/:id/rows', async (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id must be integer' });
  const up = await db.prepare('SELECT id, project_id, expected_doc_type FROM file_uploads WHERE id = ?').getAsync(id);
  if (!up) return res.status(404).json({ error: 'Upload not found' });
  if (!up.project_id || !up.expected_doc_type) return res.status(404).json({ error: 'Upload not committed to a project yet' });
  try {
    const rows = await db.prepare(
      'SELECT source_sheet, ordinal, col_1, col_2, col_3, col_4, col_5, col_6, col_7, col_8, col_9, col_10 FROM generic_sheets WHERE project_id = ? AND doc_type = ? ORDER BY source_sheet, ordinal LIMIT 500'
    ).allAsync(up.project_id, up.expected_doc_type);
    if (!rows.length) return res.status(404).json({ error: 'Loại này xem ở tab chuyên biệt (Progress/Shop/Materials/Payment)' });
    res.json({ upload_id: id, doc_type: up.expected_doc_type, count: rows.length, rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// Skipped/marker rows carry no content → 404 with the skip reason.
// Download the original staged file (drill-down "view original file" link).
// Skipped/marker rows carry no content → 404 with the skip reason.
router.get('/:id/download', async (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id must be integer' });
  const row = await db.prepare('SELECT id, original_filename, storage_key, mime_type, skip_reason FROM file_uploads WHERE id = ?').getAsync(id);
  if (!row) return res.status(404).json({ error: 'Upload not found' });
  if (!row.storage_key) return res.status(404).json({ error: row.skip_reason || 'No file content for this upload' });
  const fullPath = getFilePath(row.storage_key);
  if (!fileExists(row.storage_key)) return res.status(404).json({ error: 'File missing from disk' });
  res.download(fullPath, row.original_filename || `upload-${row.id}.xlsx`);
});

export default router;
