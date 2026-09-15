// Daily reports routes — site báo cáo hàng ngày
// Decision 2026-09-04: ảnh đính kèm OK (sếp confirm Q5)

import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../lib/auth.js';
import { permissionMiddleware } from '../lib/permission-middleware.js';
import { requireProjectAccess, requireResourceProject } from '../lib/project-access.js';
import { getDb } from '../db/index.js';
import { withAudit } from '../lib/with-audit.js';
import { saveFile, getFilePath, fileExists } from '../lib/storage.js';
import { join } from 'node:path';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(permissionMiddleware);
router.use('/projects/:id', requireProjectAccess());
router.use('/daily-reports/:id', requireResourceProject({ table: 'daily_reports' }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB

// List daily reports
router.get('/projects/:id/daily-reports', async (req, res) => {
  const db = getDb();
  res.json(await db.prepare('SELECT * FROM daily_reports WHERE project_id = ? ORDER BY report_date DESC').allAsync(req.params.id));
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
    db.prepare('SELECT * FROM daily_recommendations WHERE daily_report_id = ?').allAsync(req.params.id).catch(() => []),
    db.prepare('SELECT * FROM daily_safety WHERE daily_report_id = ?').allAsync(req.params.id).catch(() => []),
    db.prepare('SELECT * FROM daily_infos WHERE daily_report_id = ?').allAsync(req.params.id).catch(() => []),
  ]);
  res.json({ ...dr, items, materials, manpower, photos, recommendations, safety, infos });
});

// Create daily report (basic metadata)
router.post('/projects/:id/daily-reports', async (req, res) => {
  const db = getDb();
  const { report_date, weather_am, weather_pm, source_sheet_name, note } = req.body || {};
  const date = report_date || new Date().toISOString().slice(0, 10);
  try {
    const r = await withAudit(req, {
      action: 'CREATE', resourceType: 'daily_report', resourceId: 0,
      context: { project_id: Number(req.params.id), report_date: date },
      after: { report_date: date, weather_am, weather_pm },
      note: `Tạo daily report ${date}`,
    }, async (client) => {
      const ins = await client.query(
        `INSERT INTO daily_reports (project_id, report_date, weather_am, weather_pm, source_sheet_name, prepared_by, status) VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT') RETURNING *`,
        [req.params.id, date, weather_am || null, weather_pm || null, source_sheet_name || null, req.user.id]
      );
      return ins.rows[0];
    });
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Add manpower log
router.post('/daily-reports/:id/manpower', async (req, res) => {
  const db = getDb();
  const { role_code, role_name_vi, headcount, notes } = req.body || {};
  if (!role_code && !role_name_vi) return res.status(400).json({ error: 'role_code or role_name_vi required' });
  try {
    const r = await withAudit(req, {
      action: 'CREATE', resourceType: 'daily_manpower', resourceId: 0,
      context: { daily_report_id: Number(req.params.id) },
      after: { role_code, role_name_vi, headcount },
      note: `Manpower: ${role_name_vi || role_code} (${headcount || 0} người)`,
    }, async (client) => {
      const ins = await client.query(
        `INSERT INTO daily_manpower (daily_report_id, role_code, role_name_vi, headcount, notes) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [req.params.id, role_code, role_name_vi, headcount || 0, notes]
      );
      return ins.rows[0];
    });
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Photo upload (multipart/form-data)
router.post('/daily-reports/:id/photos', upload.array('photos', 20), async (req, res) => {
  if (!req.files?.length) return res.status(400).json({ error: 'No files' });
  const db = getDb();
  const results = [];
  try {
    const uploaded = await withAudit(req, {
      action: 'UPLOAD', resourceType: 'daily_photo', resourceId: 0,
      context: { daily_report_id: Number(req.params.id), count: req.files.length },
      note: `Upload ${req.files.length} ảnh vào daily report ${req.params.id}`,
    }, async (client) => {
      for (const f of req.files) {
        const saved = saveFile(f.buffer, f.originalname, f.mimetype);
        const ins = await client.query(
          `INSERT INTO daily_photos (daily_report_id, file_path, file_name, mime_type, file_size, uploaded_by, uploaded_at) VALUES ($1, $2, $3, $4, $5, $6, now()) RETURNING *`,
          [req.params.id, saved.key, f.originalname, f.mimetype, f.size, req.user.id]
        );
        results.push(ins.rows[0]);
      }
      return results;
    });
    res.json({ ok: true, count: uploaded.length, photos: uploaded });
  } catch (e) {
    res.status(500).json({ error: e.message });
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
  const row = await db.prepare('SELECT id, file_path, file_name, mime_type FROM daily_photos WHERE id = ?').getAsync(req.params.photoId);
  if (!row) return res.status(404).json({ error: 'Photo not found' });
  const fullPath = getFilePath(row.file_path);
  if (!fileExists(row.file_path)) return res.status(404).json({ error: 'File missing from disk' });
  res.download(fullPath, row.file_name || `photo-${row.id}`);
});

// Cross-project manpower rollup (week / month)
router.get('/manpower/rollup', async (req, res) => {
  const db = getDb();
  const { from, to, group_by = 'day' } = req.query;
  const start = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const end = to || new Date().toISOString().slice(0, 10);
  const trunc = group_by === 'month' ? 'month' : group_by === 'week' ? 'week' : 'day';
  const rows = await db.prepare(`
    SELECT date_trunc($1, dr.report_date) AS period,
           dr.project_id,
           p.code AS project_code,
           dm.role_code,
           dm.role_name_vi,
           SUM(COALESCE(dm.headcount, 0)) AS total_workers
    FROM daily_manpower dm
    JOIN daily_reports dr ON dr.id = dm.daily_report_id
    JOIN projects p ON p.id = dr.project_id
    WHERE dr.report_date BETWEEN $2 AND $3
    GROUP BY 1, dr.project_id, p.code, dm.role_code, dm.role_name_vi
    ORDER BY 1 DESC, total_workers DESC
  `).allAsync(trunc, start, end);
  res.json({ from: start, to: end, group_by: trunc, rows });
});

export default router;
