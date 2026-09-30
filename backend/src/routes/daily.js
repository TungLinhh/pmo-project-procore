// Daily reports routes — site báo cáo hàng ngày
// Decision 2026-09-04: ảnh đính kèm OK (sếp confirm Q5)

import { Router } from 'express';
import { readPage, withTotal } from '../lib/pagination.js';
import multer from 'multer';
import { decodeUploadNames } from '../lib/upload-names.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { permissionMiddleware } from '../lib/permission-middleware.js';
import { requireProjectAccess, requireResourceProject, checkProjectAccess } from '../lib/project-access.js';
import { getDb } from '../db/index.js';
import { withAudit } from '../lib/with-audit.js';
import { saveFile, fileExists, storage, removeFile } from '../lib/storage.js';
import { join } from 'node:path';
import { errorBody } from '../lib/error-body.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use('/projects/:id', requireProjectAccess());
router.use('/daily-reports/:id', requireResourceProject({ table: 'daily_reports' }));
router.use(permissionMiddleware);

const upload = decodeUploadNames(multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })); // 10MB

// List daily reports
// `limit` chỉ có tác dụng khi **được truyền**. Trước đây route này không có
// `LIMIT` nên `?limit=2` trả về đủ 7 dòng — im lặng, không lỗi, không dấu vết.
// Đặt mặc định phân trang luôn thì màn nào đang dựa vào việc nhận hết sẽ bị cắt
// mà không biết; nên mặc định vẫn là hết, chỉ tôn trọng giá trị người gọi đưa và
// kèm `X-Total-Count` để bên gọi biết còn bao nhiêu.
router.get('/projects/:id/daily-reports', async (req, res) => {
  const db = getDb();
  const sql = 'SELECT * FROM daily_reports WHERE project_id = ? ORDER BY report_date DESC';
  const { limit } = readPage(req.query, { defaultLimit: null, maxLimit: 500 });
  const all = await db.prepare(sql).allAsync(req.params.id);
  withTotal(res, all.length);
  if (limit === null) return res.json(all);
  return res.json(all.slice(0, limit));
});

// Get full daily report (with items, materials, manpower, photos)
router.get('/daily-reports/:id/full', async (req, res) => {
  const db = getDb();
  const dr = await db.prepare('SELECT * FROM daily_reports WHERE id = ?').getAsync(req.params.id);
  if (!dr) return res.status(404).json({ error: 'Not found' });
  const [items, materials, manpower, photos, recommendations, safety, infos] = await Promise.all([
    db.prepare('SELECT * FROM daily_work_items WHERE daily_report_id = ?').allAsync(req.params.id),
    db.prepare('SELECT * FROM daily_materials WHERE daily_report_id = ?').allAsync(req.params.id),
    db.prepare('SELECT * FROM daily_manpower WHERE daily_report_id = ?').allAsync(req.params.id),
    db.prepare('SELECT * FROM daily_photos WHERE daily_report_id = ? ORDER BY id').allAsync(req.params.id),
    db.prepare('SELECT * FROM daily_recommendations WHERE daily_report_id = ?').allAsync(req.params.id),
    db.prepare('SELECT * FROM daily_safety WHERE daily_report_id = ?').allAsync(req.params.id),
    db.prepare('SELECT * FROM daily_infos WHERE daily_report_id = ?').allAsync(req.params.id),
  ]);
  res.json({ ...dr, items, materials, manpower, photos, recommendations, safety, infos });
});

// Create daily report (basic metadata)
router.post('/projects/:id/daily-reports', async (req, res) => {
  const db = getDb();
  const { report_date, weather_am, weather_pm, weather, notes, note, source_sheet_name } = req.body || {};
  // Accept the single-field spelling the field form sends; the table has the
  // split am/pm columns, so a one-line answer lands in the morning slot.
  const wAm = weather_am ?? weather ?? null;
  const date = report_date || new Date().toISOString().slice(0, 10);
  try {
    const existing = await db.prepare(
      'SELECT * FROM daily_reports WHERE project_id = ? AND report_date = ? LIMIT 1',
    ).getAsync(req.params.id, date);
    if (existing) return res.json(existing);
    const r = await withAudit(req, {
      action: 'CREATE', resourceType: 'daily_report',
      context: { project_id: Number(req.params.id), report_date: date },
      after: { report_date: date, weather_am: wAm, weather_pm },
      note: `Tạo daily report ${date}`,
    }, async (client) => {
      const ins = await client.query(
        `INSERT INTO daily_reports (project_id, report_date, weather_am, weather_pm, source_sheet_name, notes, prepared_by, status) VALUES ($1, $2, $3, $4, $5, $6, $7, 'DRAFT') RETURNING *`,
        [req.params.id, date, wAm || null, weather_pm || null, source_sheet_name || null, (notes ?? note) || null, req.user.id]
      );
      return ins.rows[0];
    });
    res.json(r);
  } catch (e) {
    if (e.code === '23505') {
      const existing = await db.prepare(
        'SELECT * FROM daily_reports WHERE project_id = ? AND report_date = ? LIMIT 1',
      ).getAsync(req.params.id, date);
      if (existing) return res.json(existing);
    }
    res.status(e.status || 500).json(errorBody(e));
  }
});

// Add manpower log
router.post('/daily-reports/:id/manpower', async (req, res) => {
  const db = getDb();
  const { role_code, role_name_vi, headcount, notes } = req.body || {};
  const kind = req.body?.kind === 'equipment' ? 'equipment' : 'labor';
  if (!role_code && !role_name_vi) return res.status(400).json({ error: 'role_code or role_name_vi required' });
  if (!Number.isInteger(Number(headcount || 0)) || Number(headcount || 0) < 0 || Number(headcount || 0) > 100000) {
    return res.status(400).json({ error: 'headcount must be integer 0..100000' });
  }
  try {
    const r = await withAudit(req, {
      action: 'CREATE', resourceType: 'daily_manpower',
      context: { daily_report_id: Number(req.params.id) },
      after: { role_code, role_name_vi, headcount, kind },
      note: `${kind === 'equipment' ? 'Thiết bị' : 'Manpower'}: ${role_name_vi || role_code} (${headcount || 0})`,
    }, async (client) => {
      const ins = await client.query(
        `INSERT INTO daily_manpower (daily_report_id, role_code, role_name_vi, headcount, notes, kind) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [req.params.id, role_code, role_name_vi, headcount || 0, notes, kind]
      );
      return ins.rows[0];
    });
    res.status(201).json(r);
  } catch (e) {
    res.status(e.status || 500).json(errorBody(e));
  }
});

// Photo upload (multipart/form-data)
router.post('/daily-reports/:id/photos', upload.array('photos', 20), async (req, res) => {
  if (!req.files?.length) return res.status(400).json({ error: 'No files' });
  const db = getDb();
  const results = [];

  // Ghi file ra **ngoài** transaction, rồi mới mở transaction để ghi dòng.
  //
  // Trước đây `saveFile` nằm bên trong callback của `withAudit`. Ghi đĩa (hay S3)
  // **không rollback được**: nếu ảnh thứ 3 trong 20 ảnh lỗi, transaction rollback và
  // không có dòng `daily_photos` nào cho bất kỳ ảnh nào, nhưng **cả 20 file vẫn nằm
  // trên đĩa** — rác vĩnh viễn mà `scripts/storage-gc.mjs` sẽ báo mãi, và kiểm tra
  // `uploads_volume` trong `production-readiness` cũng bị ảnh hưởng. Trên S3 còn tệ
  // hơn: giữ một transaction mở xuyên suốt lời gọi mạng.
  //
  // Thứ tự mới: ghi hết file → mở transaction ghi dòng. Nếu phần ghi dòng hỏng thì
  // dọn file đã ghi, vì không có dòng nào trỏ tới chúng; nếu dọn cũng lỗi thì
  // `storage-gc` vẫn quét được, nhưng đã có log để biết.
  const savedFiles = [];
  for (const f of req.files) {
    savedFiles.push({ file: f, saved: await saveFile(f.buffer, f.originalname) });
  }

  try {
    const uploaded = await withAudit(req, {
      action: 'UPLOAD', resourceType: 'daily_photo',
      context: { daily_report_id: Number(req.params.id), count: savedFiles.length },
      note: `Upload ${savedFiles.length} ảnh vào daily report ${req.params.id}`,
    }, async (client) => {
      for (const { file, saved } of savedFiles) {
        const ins = await client.query(
          `INSERT INTO daily_photos (daily_report_id, file_path, file_name, mime_type, file_size, uploaded_by, uploaded_at) VALUES ($1, $2, $3, $4, $5, $6, now()) RETURNING *`,
          [req.params.id, saved.key, file.originalname, file.mimetype, file.size, req.user.id]
        );
        results.push(ins.rows[0]);
      }
      return results;
    });
    res.json({ ok: true, count: uploaded.length, photos: uploaded });
  } catch (e) {
    for (const { saved } of savedFiles) {
      try {
        await removeFile(saved.key);
      } catch (cleanupErr) {
        console.error(`[daily photos] không dọn được ${saved.key}: ${cleanupErr.message}`);
      }
    }
    res.status(e.status || 500).json(errorBody(e));
  }
});

// List photos of a daily report
router.get('/daily-reports/:id/photos', async (req, res) => {
  const db = getDb();
  res.json(await db.prepare('SELECT id, file_name, mime_type, file_size, uploaded_at, uploaded_by FROM daily_photos WHERE daily_report_id = ? ORDER BY id').allAsync(req.params.id));
});

// Download one photo (DailyReportForm thumbs load via authenticated blob fetch).
router.get('/daily-reports/photos/:photoId/download', async (req, res) => {
  const db = getDb();
  const row = await db.prepare(
    `SELECT p.id, p.file_path, p.file_name, p.mime_type, dr.project_id
     FROM daily_photos p JOIN daily_reports dr ON dr.id = p.daily_report_id
     WHERE p.id = ?`
  ).getAsync(req.params.photoId);
  if (!row || !(await checkProjectAccess(req.user, row.project_id))) {
    return res.status(404).json({ error: 'Photo not found' });
  }
  if (!(await fileExists(row.file_path))) return res.status(404).json({ error: 'File missing from storage' });
  await storage.download(res, row.file_path, row.file_name || `photo-${row.id}`);
});

// Manpower plan (SRS FR-1.3): PMO nhập kế hoạch huy động theo tuần;
// thực tế từ daily_manpower. GET cho mọi member; PUT chỉ admin/ceo/pmo
// (planning-input như KPI targets — PM nhập actual qua báo cáo ngày).
router.get('/projects/:id/manpower-plan', async (req, res) => {
  const db = getDb();
  const { from, to } = req.query;
  const where = ['project_id = $1'];
  const params = [req.params.id];
  let i = 2;
  if (from) { where.push(`week_start >= $${i++}`); params.push(from); }
  if (to) { where.push(`week_start <= $${i++}`); params.push(to); }
  res.json(await db.prepare(
    `SELECT * FROM manpower_plans WHERE ${where.join(' AND ')} ORDER BY week_start, role_name_vi`
  ).allAsync(...params));
});

router.put('/projects/:id/manpower-plan', requireRole('admin', 'ceo', 'pmo'), async (req, res) => {
  const { toMonday, validatePlanRow } = await import('../lib/manpower-plan.js');
  const db = getDb();
  const list = req.body?.rows;
  if (!Array.isArray(list) || !list.length || list.length > 200) {
    return res.status(400).json({ error: 'rows must be a non-empty array (≤200)' });
  }
  const clean = [];
  for (const r of list) {
    const err = validatePlanRow(r);
    if (err) return res.status(400).json({ error: `${r?.role_name_vi || '?'}: ${err}` });
    clean.push({
      role: String(r.role_name_vi).trim().slice(0, 200),
      kind: r.kind === 'equipment' ? 'equipment' : 'labor',
      week: toMonday(r.week_start),
      headcount: Number(r.planned_headcount),
      note: typeof r.note === 'string' ? r.note.slice(0, 500) : null,
    });
  }
  try {
    const before = await db.prepare(
      'SELECT * FROM manpower_plans WHERE project_id = ?'
    ).allAsync(req.params.id);
    const result = await withAudit(req, {
      action: 'UPDATE', resourceType: 'manpower_plan', resourceId: Number(req.params.id),
      context: { project_id: Number(req.params.id), rows: clean.length },
      before,
      after: clean,
      fieldChanges: clean.map((c) => ({ field: `${c.role}@${c.week}`, from: null, to: c.headcount })),
      note: `PMO nhập kế hoạch nhân lực project ${req.params.id} (${clean.length} dòng)`,
    }, async (client) => {
      const out = [];
      for (const c of clean) {
        const r = await client.query(
          `INSERT INTO manpower_plans (project_id, kind, role_name_vi, week_start, planned_headcount, note, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (project_id, kind, role_name_vi, week_start)
           DO UPDATE SET planned_headcount = EXCLUDED.planned_headcount, note = EXCLUDED.note,
                         created_by = EXCLUDED.created_by, updated_at = now()
           RETURNING *`,
          [Number(req.params.id), c.kind, c.role, c.week, c.headcount, c.note, req.user.id]
        );
        out.push(r.rows[0]);
      }
      return out;
    });
    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json(errorBody(e));
  }
});

// Loading curve: kế hoạch vs. thực tế theo tuần (actual = daily_manpower
// gộp theo tuần thứ Hai) + % huy động. 8 tuần gần nhất mặc định.
router.get('/projects/:id/manpower-loading', async (req, res) => {
  const { getManpowerLoading } = await import('../lib/manpower-plan.js');
  try {
    res.json(await getManpowerLoading(req.params.id, req.query.weeks));
  } catch (e) {
    res.status(e.status || 500).json(errorBody(e));
  }
});

// Cross-project manpower rollup (week / month)
router.get('/manpower/rollup', async (req, res) => {
  const db = getDb();
  const { from, to, group_by = 'day', project_id } = req.query;
  const start = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const end = to || new Date().toISOString().slice(0, 10);
  const trunc = group_by === 'month' ? 'month' : group_by === 'week' ? 'week' : 'day';
  if (project_id && !(await checkProjectAccess(req.user, Number(project_id)))) return res.status(404).json({ error: 'Project not found' });
  const rows = await db.prepare(`
    SELECT date_trunc($1, dr.report_date) AS period,
           dr.project_id,
           p.code AS project_code,
           dm.role_code,
           dm.role_name_vi,
           COALESCE(dm.kind, 'labor') AS kind,
           SUM(COALESCE(dm.headcount, 0)) AS total_workers
    FROM daily_manpower dm
    JOIN daily_reports dr ON dr.id = dm.daily_report_id
    JOIN projects p ON p.id = dr.project_id
    WHERE dr.report_date BETWEEN $2 AND $3
      AND ($4::int IS NULL OR dr.project_id = $4)
    GROUP BY 1, dr.project_id, p.code, dm.role_code, dm.role_name_vi, COALESCE(dm.kind, 'labor')
    ORDER BY 1 DESC, total_workers DESC
  `).allAsync(trunc, start, end, project_id ? Number(project_id) : null);
  const visible = [];
  for (const row of rows) if (await checkProjectAccess(req.user, Number(row.project_id))) visible.push(row);
  res.json({ from: start, to: end, group_by: trunc, rows: visible });
});

export default router;
