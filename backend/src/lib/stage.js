// Shared file staging: buffer → disk + file_uploads row (STAGED or SKIPPED_*).
// Used by single upload, batch/zip intake, and (later) the classifier.
import { saveFile } from './storage.js';
import { UPLOAD_STATUS } from './upload-status.js';

export async function stageFile(db, {
  buffer, originalname, mimetype = null, relativePath = null,
  projectId = null, zoneId = null, docType = null,
  status = null, skipReason = null, tenantId = null,
} = {}) {
  if (!buffer?.length) throw new Error('Empty file buffer');
  if (tenantId == null) throw new Error('stageFile: tenantId required');
  const saved = saveFile(buffer, originalFilename(originalname));
  const row = await db.prepare(`
    INSERT INTO file_uploads (tenant_id, project_id, zone_id, original_filename, relative_path, storage_key, file_size, file_hash, mime_type, expected_doc_type, status, skip_reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (tenant_id, file_hash) DO UPDATE SET
      project_id = COALESCE(EXCLUDED.project_id, file_uploads.project_id),
      zone_id = COALESCE(EXCLUDED.zone_id, file_uploads.zone_id),
      original_filename = EXCLUDED.original_filename,
      relative_path = COALESCE(file_uploads.relative_path, EXCLUDED.relative_path),
      storage_key = EXCLUDED.storage_key,
      file_size = EXCLUDED.file_size, mime_type = EXCLUDED.mime_type,
      expected_doc_type = COALESCE(EXCLUDED.expected_doc_type, file_uploads.expected_doc_type),
      status = EXCLUDED.status, skip_reason = EXCLUDED.skip_reason
    RETURNING id
  `).getAsync(
    tenantId, projectId, zoneId, originalname, relativePath, saved.key, saved.size,
    saved.hash, mimetype, docType, status || UPLOAD_STATUS.STAGED, skipReason,
  );
  return { upload_id: row.id, key: saved.key, size: saved.size, hash: saved.hash };
}

function originalFilename(name) {
  const base = String(name || 'upload.bin').split(/[\\/]/).pop() || 'upload.bin';
  return base;
}
