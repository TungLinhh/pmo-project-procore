// Mô hình A wizard endpoints for Excel upload.
// Flow:
//   1. POST /api/upload                  → upload file, returns upload_id
//   2. POST /api/upload/:id/configure     → set project/zone/doc_type
//   3. POST /api/upload/:id/preview       → parse without DB writes
//   4. POST /api/upload/:id/commit        → actually insert
//
// Additional helper endpoints (Task 2):
//   - POST /api/projects                  → create a new project
//   - POST /api/projects/:id/zones        → create a new zone for a project
import { getDb } from '../db/index.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { UPLOAD_STATUS, statusFromCounts } from '../lib/upload-status.js';
import { fileExists, storage } from '../lib/storage.js';
import { listSheets, detectDocType } from '../lib/excel.js';
import { findOrCreateProject, findOrCreateZone, INGESTORS } from '../services/ingest/index.js';
import { checkProjectAccess } from '../lib/project-access.js';
import { canAccessUpload } from '../lib/upload-access.js';
import { errorBody } from '../lib/error-body.js';
import { aggregateRefusal } from '../lib/aggregate-workbook.js';
import { permissionMiddleware } from '../lib/permission-middleware.js';

const tenantOf = (req) => req.user.tenant_id;

// Preview summarizer shared by configure + preview. Every ingestor returns
// sheets as { sheet, rows: [...] } — EXCEPT daily_report, whose sheets are
// { sheet, report_date, work_items, materials, manpower, acceptance }.
// Assuming s.rows exists crashed daily confirm with
// "Cannot read properties of undefined (reading 'length')".

// Advisory lock keyed on the upload id. Try-lock semantics: the second
// concurrent commit is refused with 409 instead of interleaving with the
// first one's DELETE-then-INSERT. Returns a release function.
//
// It must THROW when the lock is unavailable. Returning null looked equivalent
// because the caller wrapped this in try/catch and answered 409 — but a failed
// try-lock is not an exception, so the commit ran anyway, which is exactly the
// interleaving the lock exists to prevent.
async function lockUpload(db, uploadId) {
  const client = await db.getPool().connect();
  try {
    const { rows } = await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS ok', [`upload:${uploadId}`]);
    if (!rows[0]?.ok) {
      throw Object.assign(new Error('Upload is being committed by another request. Retry in a moment.'), { status: 409 });
    }
  } catch (e) {
    client.release();
    throw e;
  }
  return async () => {
    try { await client.query('SELECT pg_advisory_unlock(hashtext($1))', [`upload:${uploadId}`]); } catch {}
    client.release();
  };
}

function summarizeSheets(sheets) {
  return (sheets || []).map(s => {
    if (Array.isArray(s.rows)) {
      return { sheet: s.sheet, row_count: s.rows.length, sample: s.rows.slice(0, 3) };
    }
    if (Array.isArray(s.work_items)) {
      const secs = [s.work_items, s.materials, s.manpower, s.acceptance].map(a => (Array.isArray(a) ? a.length : 0));
      return {
        sheet: s.sheet,
        report_date: s.report_date || null,
        row_count: secs.reduce((a, b) => a + b, 0),
        sample: s.work_items.slice(0, 3).map(w => ({
          name_vi: w.name_vi, progress_pct: w.progress_pct,
          start_date: w.start_date, finish_date: w.finish_date,
        })),
      };
    }
    return { sheet: s.sheet, row_count: 0, sample: [] };
  });
}

export function registerWizardRoutes(app) {
  // List all available doc_types
  app.get('/api/upload/doc-types', requireAuth, (req, res) => {
    const types = Object.keys(INGESTORS).map(t => ({
      id: t,
      label: t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    }));
    res.json(types);
  });

  // Configure an upload: set project/zone/doc_type. Returns parsed preview.
  app.post('/api/upload/:id/configure', requireAuth, permissionMiddleware, async (req, res) => {
    const db = getDb();
    const uploadId = Number(req.params.id);
    const { project_id, zone_id, doc_type, process_code, new_project, new_zone } = req.body;

    const upload = await db.prepare('SELECT * FROM file_uploads WHERE id = ?').getAsync(uploadId);
    if (!upload) return res.status(404).json({ error: 'Upload not found' });
    if (!(await canAccessUpload(req.user, upload))) return res.status(404).json({ error: 'Upload not found' });
    if (!(await fileExists(upload.storage_key))) return res.status(404).json({ error: 'File not found in storage' });

    // Resolve project
    let project = null;
    if (new_project) {
      if (!new_project.code) return res.status(400).json({ error: 'new_project.code required' });
      project = await findOrCreateProject(tenantOf(req), new_project.code, new_project);
    } else if (project_id) {
      project = await db.prepare('SELECT id, code FROM projects WHERE id = ? AND tenant_id = ?').getAsync(project_id, tenantOf(req));
      if (!project) return res.status(404).json({ error: 'Project not found' });
    }
    if (!project) return res.status(400).json({ error: 'project_id or new_project required' });
    // Membership gate (new projects just added the creator as member above).
    if (!(await checkProjectAccess(req.user, project.id))) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Resolve zone
    let zoneId = null;
    let zoneCode = null;
    let zoneAutoCreated = false;
    if (new_zone) {
      if (!new_zone.code) return res.status(400).json({ error: 'new_zone.code required' });
      const z = await findOrCreateZone(project.id, new_zone.code, new_zone.name_en || new_zone.name_vi);
      zoneId = z.id;
      zoneCode = z.code;
      zoneAutoCreated = true;
    } else if (zone_id) {
      const z = await db.prepare('SELECT id, code FROM zones WHERE id = ? AND project_id = ?').getAsync(zone_id, project.id);
      if (!z) return res.status(404).json({ error: 'Zone not found in this project' });
      zoneId = z.id;
      zoneCode = z.code;
    }

    // Resolve doc_type
    const finalDocType = doc_type || upload.expected_doc_type || detectDocType(upload.original_filename);
    if (!INGESTORS[finalDocType]) return res.status(400).json({ error: `Unknown doc_type: ${finalDocType}`, available: Object.keys(INGESTORS) });

    // Save config into upload row.
    //
    // `report_json = NULL` là bắt buộc, không phải cho gọn. Trước đây nếu `parse()`
    // ném lỗi (sheet hỏng, `.xlsx` không phải xlsx, hết bộ nhớ với file 50 MB) thì hàng
    // **đã** bị trỏ sang dự án/zone/loại **mới** nhưng `report_json` vẫn giữ kết quả
    // parse của lần configure **trước**. Người dùng thấy 500, bấm lại, rồi
    // `POST /:id/commit` nạp **nhầm bộ dữ liệu cũ** — của loại tài liệu cũ và zone cũ —
    // vào dự án mới. Commit báo thành công còn dữ liệu sai theo hai chiều. Xoá sạch
    // ở đây khiến commit phải có `report_json` mới, tức không thể nạp nhầm.
    await db.prepare(`
      UPDATE file_uploads
      SET project_id = ?, zone_id = ?, expected_doc_type = ?, report_json = NULL,
          status = '${UPLOAD_STATUS.CONFIGURED}'
      WHERE id = ?
    `).runAsync(project.id, zoneId, finalDocType, uploadId);

    // Run parse() so user gets preview immediately (temp file on S3, zero-copy local)
    const ingestor = INGESTORS[finalDocType];
    const opts = { tenantId: tenantOf(req), projectId: project.id, zoneCode, processCode: process_code };
    try {
      const parsed = await storage.withTempFile(upload.storage_key, (fullPath) => ingestor.parse(fullPath, opts));
      // Cache parsed data as JSON in file_uploads.report_json for commit step
      await db.prepare('UPDATE file_uploads SET report_json = ? WHERE id = ?').runAsync(JSON.stringify(parsed), uploadId);
      res.json({
        upload_id: uploadId,
        project: { id: project.id, code: project.code },
        zone: parsed.zone || { code: zoneCode, name: zoneCode },
        zone_auto_created: zoneAutoCreated,
        doc_type: finalDocType,
        total_rows: parsed.totalRows,
        sheets: summarizeSheets(parsed.sheets),
        message: 'Configure OK. POST /api/upload/:id/commit to insert, or POST /api/upload/:id/preview to refresh.',
      });
    } catch (e) {
      res.status(500).json(errorBody(e));
    }
  });

  // Refresh preview (re-parse without changing config)
  app.post('/api/upload/:id/preview', requireAuth, permissionMiddleware, async (req, res) => {
    const db = getDb();
    const uploadId = Number(req.params.id);
    const upload = await db.prepare('SELECT * FROM file_uploads WHERE id = ?').getAsync(uploadId);
    if (!upload) return res.status(404).json({ error: 'Upload not found' });
    if (!(await canAccessUpload(req.user, upload))) return res.status(404).json({ error: 'Upload not found' });
    if (!upload.expected_doc_type) return res.status(400).json({ error: 'Not configured yet. POST /api/upload/:id/configure first.' });
    const ingestor = INGESTORS[upload.expected_doc_type];
    if (!ingestor) return res.status(400).json({ error: 'Unknown doc_type' });

    let zoneCode = null;
    if (upload.zone_id) {
      const z = await db.prepare('SELECT code FROM zones WHERE id = ?').getAsync(upload.zone_id);
      zoneCode = z?.code;
    }
    const opts = { tenantId: tenantOf(req), projectId: upload.project_id, zoneCode };
    try {
      const parsed = await storage.withTempFile(upload.storage_key, (fullPath) => ingestor.parse(fullPath, opts));
      await db.prepare('UPDATE file_uploads SET report_json = ? WHERE id = ?').runAsync(JSON.stringify(parsed), uploadId);
      res.json({
        upload_id: uploadId,
        doc_type: upload.expected_doc_type,
        total_rows: parsed.totalRows,
        sheets: summarizeSheets(parsed.sheets),
      });
    } catch (e) {
      res.status(500).json(errorBody(e));
    }
  });

  // Commit: actually insert parsed data into DB
  app.post('/api/upload/:id/commit', requireAuth, permissionMiddleware, async (req, res) => {
    const db = getDb();
    const uploadId = Number(req.params.id);
    const upload = await db.prepare('SELECT * FROM file_uploads WHERE id = ?').getAsync(uploadId);
    if (!upload) return res.status(404).json({ error: 'Upload not found' });
    if (!(await canAccessUpload(req.user, upload))) return res.status(404).json({ error: 'Upload not found' });
    if (!upload.expected_doc_type) return res.status(400).json({ error: 'Not configured yet' });
    const ingestor = INGESTORS[upload.expected_doc_type];
    if (!ingestor) return res.status(400).json({ error: 'Unknown doc_type' });

    // Đã commit rồi thì **không** nạp lại. `report_json` bị xoá sau commit thành công
    // (đánh dấu dữ liệu đã tiêu thụ), nên nếu không chặn ở đây thì lần commit thứ hai
    // rơi xuống nhánh `No parsed data` với thông điệp bảo người dùng "POST configure
    // hoặc preview trước" — trong khi họ **đã** làm đúng những việc đó. Đo được
    // 2026-09-28: commit lần 1 → 200, lần 2 → 400 với thông điệp sai lệch đó.
    //
    // 409 chứ không phải 200 replay: nạp lại sẽ ghi đè dữ liệu người dùng đã sửa trong
    // ứng dụng, mà sheet là bản nháp (xem nguyên tắc ở `ingest/*.js`). Thông điệp trả
    // kèm kết quả lần trước để client biết đọc dữ liệu ở đâu.
    if (upload.status === UPLOAD_STATUS.SUCCESS) {
      return res.status(409).json({
        error: 'File này đã được commit vào hệ thống — nạp lại sẽ ghi đè dữ liệu đã sửa trong ứng dụng.',
        upload_id: upload.id,
        status: upload.status,
        committed_at: upload.committed_at || null,
        hint: 'Xem dữ liệu đã ghi trong màn nghiệp vụ, hoặc nạp lại file từ bước Upload nếu thực sự muốn thay thế.',
      });
    }

    if (!upload.report_json) return res.status(400).json({ error: 'No cached preview. POST /api/upload/:id/preview first.' });

    const parsed = typeof upload.report_json === 'string' ? JSON.parse(upload.report_json) : upload.report_json;
    if (!parsed || !parsed.sheets) return res.status(400).json({ error: 'No parsed data. POST /api/upload/:id/configure or /preview first.' });
    if (upload.project_id && !(await checkProjectAccess(req.user, upload.project_id))) {
      return res.status(404).json({ error: 'Project not found' });
    }
    let zoneCode = null;
    if (upload.zone_id) {
      const z = await db.prepare('SELECT code FROM zones WHERE id = ?').getAsync(upload.zone_id);
      zoneCode = z?.code;
    }
    if (!zoneCode && parsed?.zone?.code) zoneCode = parsed.zone.code;  // fallback to parsed zone
    const opts = { tenantId: tenantOf(req), projectId: upload.project_id, zoneCode, uploadId };

    // Aggregate ("tổng thể") workbooks are rollups of the per-zone files. They
    // must never write rows: doing so duplicated 74 construction rows and is
    // the direct cause of the DB/source drift. The file is kept as evidence and
    // the reason is recorded, so the decision stays visible instead of silent.
    const refusal = aggregateRefusal({
      originalFilename: upload.original_filename,
      parsedRows: parsed.totalRows || 0,
      sheetNames: (parsed.sheets || []).map((s) => s.sheet),
    });
    // Serialize commits per upload. The ingestors run a destructive
    // DELETE-then-INSERT (daily_report, payment_ar, business_process) on their
    // own pooled connection, so two concurrent commits of the same upload
    // interleaved: one deleted rows the other had just inserted, and the
    // parent_id relink used a local insertedIds array, so a child could end up
    // pointing at a row the sibling commit removed.
    //
    // Khoá **một lần**, rồi MỌI đường thoát đi qua `finally` — khoá phải phủ cả nhánh
    // từ chối aggregate (trước đây nhánh đó ghi `status` rồi `return` mà không khoá,
    // nên hai `commit` song song cùng đi vào và cùng trả 200). Bỏ sót `release()` ở
    // một `return` nào đó thì upload đó **khoá vĩnh viễn** và connection rò khỏi pool —
    // đo 2026-09-28: lần sửa đầu tiên đặt khoá lên trên nhưng quên `release()` ở hai
    // nhánh `return`.
    let release = null;
    try {
      try {
        release = await lockUpload(db, uploadId);
      } catch (e) {
        return res.status(e.status || 409).json({ error: e.message });
      }

      // Đọc lại **sau khi đã khoá** rồi kiểm lại. Lần đọc ở đầu handler xảy ra *trước*
      // khi khoá, nên request thứ hai tới khi request thứ nhất đã ghi
      // `status=SUCCESS` và xoá `report_json` vẫn cầm bản đọc cũ (`CONFIGURED`) nên
      // lọt qua chốt 409, lọt qua chốt `report_json`, rồi hỏng ở giữa chừng — biểu hiện
      // là `200,400`. Đo 2026-09-28 (`regression-wave5.mjs`).
      const fresh = await db.prepare('SELECT status, report_json FROM file_uploads WHERE id = ?').getAsync(uploadId);
      if (fresh?.status === UPLOAD_STATUS.SUCCESS) {
        return res.status(409).json({
          error: 'File này đã được commit vào hệ thống — nạp lại sẽ ghi đè dữ liệu đã sửa trong ứng dụng.',
          upload_id: uploadId,
          status: UPLOAD_STATUS.SUCCESS,
          hint: 'Xem dữ liệu đã ghi trong màn nghiệp vụ, hoặc nạp lại file từ bước Upload nếu thực sự muốn thay thế.',
        });
      }
      if (!fresh?.report_json) {
        return res.status(409).json({
          error: 'Dữ liệu đã bị request khác dùng trước đó (commit song song). Thử lại, hoặc nạp lại file.',
          upload_id: uploadId,
          status: fresh?.status ?? null,
        });
      }

      if (refusal) {
        await db.prepare(
          `UPDATE file_uploads SET status = ?, skip_reason = ?, report_json = ? WHERE id = ?`
        ).runAsync(UPLOAD_STATUS.SKIPPED_REFERENCE, refusal.reason, JSON.stringify(refusal), uploadId);
        return res.json({ upload_id: uploadId, status: UPLOAD_STATUS.SKIPPED_REFERENCE, skipped: 'aggregate', reason: refusal.reason });
      }

      const result = await ingestor.commit(parsed, opts);
      const totalOk = result.ok || result.total?.ok || 0;
      const totalErr = result.errors || result.total?.errors || 0;
      const status = result.skipped === 'reference' ? UPLOAD_STATUS.SKIPPED_REFERENCE : statusFromCounts(totalOk, totalErr);
      await db.prepare(`
        UPDATE file_uploads SET status = ?, total_rows = ?, ok_rows = ?, error_rows = ?, report_json = ?
        WHERE id = ?
      `).runAsync(status, totalOk + totalErr, totalOk, totalErr, JSON.stringify(result), uploadId);
      return res.json({ upload_id: uploadId, status, ...result });
    } catch (e) {
      await db.prepare(`UPDATE file_uploads SET status = '${UPLOAD_STATUS.FAILED}', report_json = ? WHERE id = ?`).runAsync(JSON.stringify({ error: e.message }), uploadId);
      res.status(500).json(errorBody(e));
    } finally {
      if (release) await release();
    }
  });

  // Create a new project
  app.post('/api/projects', requireAuth, requireRole('admin', 'pm'), async (req, res) => {
    const db = getDb();
    const { code, name_vi, name_en, package: pkg, rev_prefix } = req.body;
    if (!code) return res.status(400).json({ error: 'code is required' });
    const existing = await db.prepare('SELECT id FROM projects WHERE tenant_id = ? AND code = ?').getAsync(tenantOf(req), code);
    if (existing) return res.status(409).json({ error: 'Project code already exists', id: existing.id });
    // `ON CONFLICT` + `RETURNING` thay vì để index unique ném 23505: hai request tạo
    // cùng một mã chạy song song thì kẻ thua trước đây nhận **500** kèm thông điệp
    // thô của Postgres, trong khi ý định là 409. Nay 409 với `id` của dự án đã có, đúng
    // như nhánh kiểm tra sớm ở trên.
    const r = await db.prepare(`
      INSERT INTO projects (tenant_id, code, name_vi, name_en, package, rev_prefix)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (tenant_id, code) DO NOTHING
      RETURNING id
    `).getAsync(tenantOf(req), code, name_vi || code, name_en || null, pkg || null, rev_prefix || null);
    if (!r) {
      const again = await db.prepare('SELECT id FROM projects WHERE tenant_id = ? AND code = ?').getAsync(tenantOf(req), code);
      return res.status(409).json({ error: 'Project code already exists', id: again?.id ?? null });
    }
    // `r` là **dòng** (dùng `getAsync` vì `RETURNING id`), không phải kết quả
    // `runAsync` — nên đọc `r.id`. Trước đây là `r.lastInsertRowid` và khi tôi đổi sang
    // `getAsync` mà quên sửa dòng này thì `lastInsertRowid` là `undefined`, khiến
    // `POST /api/projects` trả `Cannot read properties of undefined (reading 'id')` —
    // làm đỏ `payment-sla.mjs`. Bài kiểm gate bắt được ngay.
    const project = await db.prepare('SELECT * FROM projects WHERE id = ?').getAsync(r.id);
    // Creator is always a member (else they lock themselves out under requireProjectAccess).
    // Explicit RETURNING: wrapper auto-appends RETURNING id, table has none.
    await db.prepare('INSERT INTO project_members (project_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING RETURNING project_id').runAsync(project.id, req.user.id);
    res.status(201).json(project);
  });

  // Create a new zone for a project
  app.post('/api/projects/:id/zones', requireAuth, requireRole('admin', 'pm'), async (req, res) => {
    const db = getDb();
    const projectId = Number(req.params.id);
    const { code, name_vi, name_en } = req.body;
    if (!code) return res.status(400).json({ error: 'code is required' });
    const project = await db.prepare('SELECT id, code FROM projects WHERE id = ? AND tenant_id = ?').getAsync(projectId, tenantOf(req));
    if (!project) return res.status(404).json({ error: 'Project not found' });
    // Không phân biệt hoa thường, khớp với `findOrCreateZone` — trước đây route dùng
    // `code = ?` còn helper dùng `UPPER(code) = UPPER(?)`, nên tạo `b1` rồi `B1` vẫn
    // qua 409 ở đây và lọt xuống tận `INSERT` trong helper ⇒ hai zone cho một khu vực.
    // Index unique phân biệt hoa thường nên không chặn.
    const existing = await db.prepare(
      'SELECT id FROM zones WHERE project_id = ? AND UPPER(code) = UPPER(?)',
    ).getAsync(projectId, code);
    if (existing) return res.status(409).json({ error: 'Zone code already exists in this project', id: existing.id });
    // `findOrCreateZone` có thể trả về zone đã tồn tại (khi hai request chạy song song,
    // kẻ thua thấy zone của kẻ thắng) — đó là hành vi đúng, nên trả 201 với zone đó,
    // không phải tạo bản sao.
    const z = await findOrCreateZone(projectId, code, name_en || name_vi);
    const zone = await db.prepare('SELECT * FROM zones WHERE id = ?').getAsync(z.id);
    res.status(201).json(zone);
  });
}
