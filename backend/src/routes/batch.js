// Batch intake: POST /api/upload/batch with a .zip of a project folder.
// Each archive entry is staged individually (same file_uploads rows as single
// upload) with relative_path preserved for the classifier. Nothing is
// committed to domain tables here — review queue first.
//
// Safety (built in from the start, not retrofitted):
//   - zip-slip: absolute paths, drive letters, and '..' segments are rejected
//     per-entry as SKIPPED_FORMAT (recorded with reason, batch continues)
//   - caps: archive ≤200MB (multer), ≤500 entries, ≤50MB per entry,
//     ≤1GB total uncompressed; exceeding the totals aborts with 413
//   - non-xlsx entries (.xls legacy, .pdf/.doc, Office ~$ lockfiles,
//     directories) are recorded-or-skipped with a reason, never fatal
import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../lib/auth.js';
import { permissionMiddleware } from '../lib/permission-middleware.js';
import { getDb } from '../db/index.js';
import { stageFile } from '../lib/stage.js';
import { UPLOAD_STATUS } from '../lib/upload-status.js';
import { detectDocType } from '../lib/excel.js';
import { listZipEntries, extractZipEntry } from '../lib/zipread.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(permissionMiddleware);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

export const BATCH_CAPS = {
  maxEntries: 500,
  maxEntryBytes: 50 * 1024 * 1024,
  maxTotalBytes: 1024 * 1024 * 1024,
};

const XLSX_RE = /\.xlsx$/i;

export function classifyEntryType(name) {
  const base = String(name).split(/[\\/]/).pop() || '';
  if (base.startsWith('~$')) return { action: 'skip', status: UPLOAD_STATUS.SKIPPED_FORMAT, reason: 'Office lockfile (~$), not a document' };
  if (!XLSX_RE.test(base)) {
    if (/\.xls$/i.test(base)) return { action: 'skip', status: UPLOAD_STATUS.SKIPPED_FORMAT, reason: 'Legacy .xls (only .xlsx ingested)' };
    return { action: 'skip', status: UPLOAD_STATUS.SKIPPED_FORMAT, reason: `Non-xlsx file (${base.split('.').pop() || 'no extension'})` };
  }
  return { action: 'stage' };
}

// Zip-slip gate: returns a reason string when unsafe, null when safe.
export function unsafeZipPath(name) {
  const raw = String(name).replace(/\\/g, '/');
  if (!raw || raw.startsWith('/') || /^[A-Za-z]:/.test(raw)) return 'absolute path in archive';
  const parts = raw.split('/');
  if (parts.includes('..')) return "'..' segment in archive path";
  if (parts.some(p => p.length > 255)) return 'path segment over 255 chars';
  return null;
}

router.post('/batch', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file (field: file)' });
  if (!/\.zip$/i.test(req.file.originalname)) return res.status(400).json({ error: 'Batch intake accepts .zip only' });
  const db = getDb();
  let entries;
  try {
    entries = listZipEntries(req.file.buffer);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const files = [];
  let totalBytes = 0;
  for (const entry of entries) {
    const name = entry.name;
    if (entry.isDir) continue; // directory — not a file, silently skipped
    if (files.length >= BATCH_CAPS.maxEntries) {
      return res.status(413).json({ error: `Too many entries (>${BATCH_CAPS.maxEntries})`, files });
    }
    // Zip-slip: archive paths are NEVER written to disk (saveFile mints its
    // own key), but hostile names are still recorded for review visibility.
    const slip = unsafeZipPath(name);
    if (slip) {
      files.push(await recordSkip(db, req.user.tenant_id, sanitizeName(name), UPLOAD_STATUS.SKIPPED_FORMAT, `Zip-slip blocked: ${slip}`));
      continue;
    }
    if (entry.encrypted) {
      files.push(await recordSkip(db, req.user.tenant_id, name, UPLOAD_STATUS.SKIPPED_FORMAT, 'Encrypted entry not supported'));
      continue;
    }
    if (entry.uncompressedSize > BATCH_CAPS.maxEntryBytes) {
      files.push(await recordSkip(db, req.user.tenant_id, name, UPLOAD_STATUS.SKIPPED_FORMAT, `Entry >50MB (${entry.uncompressedSize} bytes)`));
      continue;
    }
    totalBytes += entry.uncompressedSize;
    if (totalBytes > BATCH_CAPS.maxTotalBytes) {
      return res.status(413).json({ error: 'Total uncompressed size >1GB', files });
    }
    const kind = classifyEntryType(name);
    if (kind.action === 'skip') {
      files.push(await recordSkip(db, req.user.tenant_id, name, kind.status, kind.reason));
      continue;
    }
    let content;
    try {
      content = extractZipEntry(req.file.buffer, entry);
    } catch (e) {
      files.push(await recordSkip(db, req.user.tenant_id, name, UPLOAD_STATUS.SKIPPED_FORMAT, `Unreadable entry: ${e.message}`));
      continue;
    }
    const staged = await stageFile(db, {
      buffer: content, originalname: baseName(name), mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      relativePath: name, docType: detectDocType(baseName(name)), tenantId: req.user.tenant_id,
    });
    files.push({ upload_id: staged.upload_id, relative_path: name, original_filename: baseName(name), status: UPLOAD_STATUS.STAGED, skip_reason: null });
  }
  const summary = summarize(files);
  res.status(202).json({ ok: true, ...summary, files });
});

function sanitizeName(p) {
  return String(p).replace(/\\/g, '/').split('/').filter(s => s && s !== '..').join('/').slice(-255) || 'unsafe-entry';
}

async function recordSkip(db, tenantId, relativePath, status, reason) {
  const base = baseName(relativePath);
  // Skips carry no content: stage a zero-content marker row via direct insert
  // (saveFile requires a buffer; slip/oversize content is never written to disk).
  const row = await db.prepare(`
    INSERT INTO file_uploads (tenant_id, original_filename, relative_path, status, skip_reason)
    VALUES (?, ?, ?, ?, ?)
    RETURNING id
  `).getAsync(tenantId, base, relativePath, status, reason);
  return { upload_id: row.id, relative_path: relativePath, original_filename: base, status, skip_reason: reason };
}

function baseName(p) {
  return String(p).split('/').pop() || 'unknown';
}

function summarize(files) {
  const byStatus = {};
  for (const f of files) byStatus[f.status] = (byStatus[f.status] || 0) + 1;
  return { total: files.length, staged: byStatus[UPLOAD_STATUS.STAGED] || 0, skipped: files.length - (byStatus[UPLOAD_STATUS.STAGED] || 0), by_status: byStatus };
}

export default router;
