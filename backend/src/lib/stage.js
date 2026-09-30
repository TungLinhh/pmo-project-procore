// Shared file staging: buffer → disk + file_uploads row (STAGED or SKIPPED_*).
// Used by single upload, batch/zip intake, and (later) the classifier.
import { saveFile } from './storage.js';
import { UPLOAD_STATUS } from './upload-status.js';

export async function stageFile(db, {
  buffer, originalname, mimetype = null, relativePath = null,
  projectId = null, zoneId = null, docType = null,
  status = null, skipReason = null, tenantId = null, createdBy = null,
} = {}) {
  if (!buffer?.length) throw new Error('Empty file buffer');
  if (tenantId == null) throw new Error('stageFile: tenantId required');
  const saved = await saveFile(buffer, originalFilename(originalname));
  // Kiểm tra sớm để trả 409 với thông điệp rõ ràng. KHÔNG phải chốt an toàn: giữa
  // SELECT này và INSERT bên dưới, request khác có thể gắn file vào dự án khác —
  // nên `DO UPDATE` còn phải có `WHERE` chặn (đã thêm). Nếu `WHERE` chặn thì
  // `RETURNING id` rỗng, và ta báo 409 y như nhánh này.
  const existing = await db.prepare(
    'SELECT id, project_id FROM file_uploads WHERE tenant_id = ? AND file_hash = ?',
  ).getAsync(tenantId, saved.hash);
  if (existing?.project_id && projectId && Number(existing.project_id) !== Number(projectId)) {
    throw Object.assign(new Error('identical file is already attached to another project'), { status: 409 });
  }
  const row = await db.prepare(`
    INSERT INTO file_uploads (tenant_id, project_id, zone_id, original_filename, relative_path, storage_key, file_size, file_hash, mime_type, expected_doc_type, status, skip_reason, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (tenant_id, file_hash) DO UPDATE SET
      project_id = COALESCE(EXCLUDED.project_id, file_uploads.project_id),
      zone_id = COALESCE(EXCLUDED.zone_id, file_uploads.zone_id),
      original_filename = EXCLUDED.original_filename,
      relative_path = COALESCE(file_uploads.relative_path, EXCLUDED.relative_path),
      storage_key = EXCLUDED.storage_key,
      file_size = EXCLUDED.file_size, mime_type = EXCLUDED.mime_type,
      expected_doc_type = COALESCE(EXCLUDED.expected_doc_type, file_uploads.expected_doc_type),
      status = CASE
        WHEN file_uploads.status = 'SUCCESS' THEN file_uploads.status
        ELSE EXCLUDED.status
      END,
      skip_reason = EXCLUDED.skip_reason
    WHERE file_uploads.project_id IS NULL
       OR EXCLUDED.project_id IS NULL
       OR file_uploads.project_id = EXCLUDED.project_id
    RETURNING id
  `).getAsync(
    tenantId, projectId, zoneId, originalname, relativePath, saved.key, saved.size,
    saved.hash, mimetype, docType, status || UPLOAD_STATUS.STAGED, skipReason, createdBy,
  );
  if (!row) {
    // Chỉ xảy ra khi `WHERE` của `DO UPDATE` chặn: file đã bị gắn vào dự án khác
    // trong khoảng thời gian giữa SELECT và INSERT. Không có `row` ⇒ không có thay
    // đổi nào được ghi — trả 409 y như ca kiểm tra sớm ở trên.
    throw Object.assign(new Error('identical file is already attached to another project'), { status: 409 });
  }
  return { upload_id: row.id, key: saved.key, size: saved.size, hash: saved.hash };
}

function originalFilename(name) {
  const base = String(name || 'upload.bin').split(/[\\/]/).pop() || 'upload.bin';
  return base;
}
