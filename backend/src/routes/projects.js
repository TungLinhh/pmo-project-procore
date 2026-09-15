// Projects routes — list, detail, zones, close, revoke

import { Router } from 'express';
import { requireAuth, requireRole, currentUser } from '../lib/auth.js';
import { permissionMiddleware } from '../lib/permission-middleware.js';
import { requireProjectAccess } from '../lib/project-access.js';
import { getDb } from '../db/index.js';
import { withAudit } from '../lib/with-audit.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(permissionMiddleware);
// Every /:id/* route below is project-scoped: tenant match + membership
// (admin/CEO bypass). 404s (not 403s) so project existence never leaks.
router.use('/:id', requireProjectAccess());

router.get('/', async (req, res) => {
  const db = getDb();
  const { include_closed = '0' } = req.query;
  let sql = 'SELECT * FROM projects WHERE tenant_id = ?';
  const params = [req.user.tenant_id];
  if (include_closed !== '1') sql += " AND status != 'CLOSED'";
  sql += ' ORDER BY id';
  res.json(await db.prepare(sql).allAsync(...params));
});

// Update project meta (name/package/department). Admin/CEO only.
router.patch('/:id', requireRole('admin', 'ceo'), async (req, res) => {
  const db = getDb();
  const allowed = ['name_vi', 'name_en', 'package', 'department_id'];
  const updates = [];
  const params = [];
  let i = 1;
  const old = await db.prepare('SELECT * FROM projects WHERE id = ?').getAsync(req.params.id);
  if (!old) return res.status(404).json({ error: 'Not found' });
  for (const k of allowed) {
    if (k in (req.body || {})) { updates.push(`${k} = $${i++}`); params.push(req.body[k]); }
  }
  if (!updates.length) return res.status(400).json({ error: 'No editable fields provided' });
  if ('department_id' in (req.body || {}) && req.body.department_id) {
    const dept = await db.prepare('SELECT id FROM departments WHERE id = ? AND tenant_id = ?').getAsync(req.body.department_id, req.user.tenant_id);
    if (!dept) return res.status(404).json({ error: 'Department not found' });
  }
  params.push(req.params.id);
  try {
    const result = await withAudit(req, {
      action: 'UPDATE', resourceType: 'project', resourceId: Number(req.params.id),
      context: { code: old.code },
      before: old,
      after: { ...old, ...req.body },
      note: `Cập nhật project ${old.code}`,
    }, async (client) => {
      const r = await client.query(`UPDATE projects SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`, params);
      return r.rows[0];
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/close', requireRole('ceo', 'admin'), async (req, res) => {
  const db = getDb();
  const { reason } = req.body || {};
  const proj = await db.prepare('SELECT * FROM projects WHERE id = ?').getAsync(req.params.id);
  if (!proj) return res.status(404).json({ error: 'Not found' });
  if (proj.status === 'CLOSED') return res.status(409).json({ error: 'Đã CLOSED. Dùng /revoke-close.' });
  try {
    const updated = await withAudit(req, {
      action: 'CLOSE', resourceType: 'project', resourceId: Number(req.params.id),
      context: { project_id: Number(req.params.id) },
      before: proj,
      after: { ...proj, status: 'CLOSED', closed_at: new Date().toISOString(), closed_by: req.user.id, close_reason: reason || null },
      fieldChanges: [
        { field: 'status', from: proj.status, to: 'CLOSED' },
        { field: 'closed_at', from: null, to: new Date().toISOString() },
      ],
      note: `Close project: ${reason || 'no reason'}`,
    }, async (client) => {
      const r = await client.query(
        `UPDATE projects SET status = 'CLOSED', closed_at = now(), closed_by = $1, close_reason = $2 WHERE id = $3 RETURNING *`,
        [req.user.id, reason || null, req.params.id]
      );
      return r.rows[0];
    });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/revoke-close', requireRole('ceo', 'admin'), async (req, res) => {
  const db = getDb();
  const proj = await db.prepare('SELECT * FROM projects WHERE id = ?').getAsync(req.params.id);
  if (!proj) return res.status(404).json({ error: 'Not found' });
  if (proj.status !== 'CLOSED') return res.status(409).json({ error: 'Project chưa CLOSED' });
  try {
    const updated = await withAudit(req, {
      action: 'REVOKE_CLOSE', resourceType: 'project', resourceId: Number(req.params.id),
      context: { project_id: Number(req.params.id) },
      before: proj,
      after: { ...proj, status: 'ACTIVE', closed_at: null },
      fieldChanges: [
        { field: 'status', from: 'CLOSED', to: 'ACTIVE' },
        { field: 'closed_revoked_at', from: null, to: new Date().toISOString() },
      ],
      note: 'Revoke close project',
    }, async (client) => {
      const r = await client.query(
        `UPDATE projects SET status = 'ACTIVE', closed_at = NULL, closed_by = NULL, close_reason = NULL, closed_revoked_at = now(), closed_revoked_by = $1 WHERE id = $2 RETURNING *`,
        [req.user.id, req.params.id]
      );
      return r.rows[0];
    });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Project-scoped resources (zones, materials, contracts, etc.)
router.get('/:id/zones', async (req, res) => {
  const db = getDb();
  res.json(await db.prepare('SELECT * FROM zones WHERE project_id = ? ORDER BY code').allAsync(req.params.id));
});

router.get('/:id/materials', async (req, res) => {
  const db = getDb();
  const lim = Math.min(parseInt(req.query.limit) || 200, 500);
  res.json(await db.prepare('SELECT * FROM materials WHERE project_id = ? ORDER BY id LIMIT ?').allAsync(req.params.id, lim));
});

router.get('/:id/contracts', async (req, res) => {
  const db = getDb();
  res.json(await db.prepare('SELECT * FROM contracts WHERE project_id = ? ORDER BY created_at DESC').allAsync(req.params.id));
});

router.get('/:id/payments', async (req, res) => {
  const db = getDb();
  res.json(await db.prepare('SELECT * FROM payments WHERE project_id = ? ORDER BY id DESC').allAsync(req.params.id));
});

router.get('/:id/daily-reports', async (req, res) => {
  const db = getDb();
  res.json(await db.prepare('SELECT * FROM daily_reports WHERE project_id = ? ORDER BY report_date DESC').allAsync(req.params.id));
});

router.get('/:id/issues', async (req, res) => {
  const db = getDb();
  const { status, severity, category } = req.query;
  const where = ['project_id = $1'];
  const params = [req.params.id];
  let i = 2;
  if (status) { where.push(`status = $${i++}`); params.push(status); }
  if (severity) { where.push(`severity = $${i++}`); params.push(severity); }
  if (category) { where.push(`category = $${i++}`); params.push(category); }
  params.push(Math.min(parseInt(req.query.limit) || 200, 500));
  res.json(await db.prepare(`SELECT * FROM issues WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT $${i}`).allAsync(...params));
});

router.post('/:id/issues', async (req, res) => {
  const { createIssue } = await import('./issues.js');
  // The project is already identified by the URL — don't force callers to
  // repeat it in the body (missing body.project_id used to 400 every time).
  if (req.body && req.body.project_id == null) req.body.project_id = Number(req.params.id);
  return createIssue(req, res);
});

router.get('/:id/construction-schedule', async (req, res) => {
  const db = getDb();
  const { zone, search, status } = req.query;
  const where = ['csi.project_id = $1'];
  const params = [req.params.id];
  let i = 2;
  if (zone) { where.push(`(z.code = $${i} OR csi.zone_id = $${i + 1})`); params.push(zone, /^\d+$/.test(zone) ? Number(zone) : -1); i += 2; }
  if (status) { where.push(`csi.status = $${i++}`); params.push(status); }
  if (search) { where.push(`(csi.name_vi ILIKE $${i} OR csi.name_en ILIKE $${i} OR csi.source_sheet ILIKE $${i})`); params.push(`%${search}%`); i++; }
  params.push(Math.min(parseInt(req.query.limit) || 2000, 5000));
  res.json(await db.prepare(
    `SELECT csi.*, z.code AS zone_code FROM construction_schedule_items csi LEFT JOIN zones z ON z.id = csi.zone_id WHERE ${where.join(' AND ')} ORDER BY csi.plan_start_date LIMIT $${i}`
  ).allAsync(...params));
});

// Field site: update progress % of one schedule item (kèm audit).
// progress_pct accepts 0..1 (0..100 auto-scaled); status re-derived.
router.patch('/:id/construction-schedule/:itemId', async (req, res) => {
  const db = getDb();
  const { deriveStatus } = await import('../services/ingest/construction_schedule.js');
  let { progress_pct, note } = req.body || {};
  progress_pct = Number(progress_pct);
  if (!Number.isFinite(progress_pct)) return res.status(400).json({ error: 'progress_pct required' });
  if (progress_pct > 1) progress_pct = progress_pct / 100;
  if (progress_pct < 0 || progress_pct > 1) return res.status(400).json({ error: 'progress_pct must be 0..1 (or 0..100)' });
  const old = await db.prepare(
    'SELECT * FROM construction_schedule_items WHERE id = ? AND project_id = ?'
  ).getAsync(req.params.itemId, req.params.id);
  if (!old) return res.status(404).json({ error: 'Schedule item not found in this project' });
  const status = deriveStatus(progress_pct, old.actual_end_date);
  try {
    const updated = await withAudit(req, {
      action: 'UPDATE', resourceType: 'schedule_item', resourceId: Number(req.params.itemId),
      context: { project_id: Number(req.params.id), zone_id: old.zone_id },
      before: { progress_pct: old.progress_pct, status: old.status },
      after: { progress_pct, status },
      fieldChanges: [{ field: 'progress_pct', from: old.progress_pct, to: progress_pct }],
      note: note || `Site cập nhật tiến độ ${old.name_vi || `#${old.id}`} → ${Math.round(progress_pct * 100)}%`,
    }, async (client) => {
      const r = await client.query(
        `UPDATE construction_schedule_items SET progress_pct = $1, status = $2 WHERE id = $3 RETURNING *`,
        [progress_pct, status, req.params.itemId]
      );
      return r.rows[0];
    });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id/shop-drawings', async (req, res) => {
  const db = getDb();
  const { status, search } = req.query;
  const where = ['sd.project_id = $1'];
  const params = [req.params.id];
  let i = 2;
  if (status) { where.push(`sd.status = $${i++}`); params.push(status); }
  if (search) { where.push(`(sd.drawing_code ILIKE $${i} OR sd.name_vi ILIKE $${i} OR sd.name_en ILIKE $${i})`); params.push(`%${search}%`); i++; }
  params.push(Math.min(parseInt(req.query.limit) || 200, 500));
  // zone_code joined (same as GET /shop-drawings/:id) — the table itself has no zone_code column.
  res.json(await db.prepare(
    `SELECT sd.*, z.code AS zone_code FROM shop_drawings sd LEFT JOIN zones z ON z.id = sd.zone_id WHERE ${where.join(' AND ')} ORDER BY sd.id DESC LIMIT $${i}`
  ).allAsync(...params));
});

router.get('/:id/material-breakdown', async (req, res) => {
  const db = getDb();
  // materials schema không có category/quantity → breakdown theo zone_id
  res.json(await db.prepare(
    `SELECT zone_id, COUNT(*) as count FROM materials WHERE project_id = $1 GROUP BY zone_id ORDER BY count DESC`
  ).allAsync(req.params.id));
});

// Submittal overdue / pending
router.get('/:id/material-submittals/overdue', async (req, res) => {
  const db = getDb();
  res.json(await db.prepare(`
    SELECT * FROM material_submittals
    WHERE project_id = ?
      AND status NOT IN ('APPROVED', 'CLOSED')
      AND (sla_deadline < CURRENT_DATE OR supervisor_deadline < CURRENT_DATE)
  `).allAsync(req.params.id));
});

router.get('/:id/material-submittals/pending-supervisor', async (req, res) => {
  const db = getDb();
  const within = Math.min(parseInt(req.query.within_days) || 3, 30);
  res.json(await db.prepare(`
    SELECT * FROM material_submittals
    WHERE project_id = ? AND status = 'SUBMITTED'
      AND supervisor_deadline <= (CURRENT_DATE + (? || ' days')::INTERVAL)
    ORDER BY supervisor_deadline ASC
  `).allAsync(req.params.id, String(within)));
});

// Schedule baseline
router.post('/:id/schedule-baselines', async (req, res) => {
  const db = getDb();
  const { notes, effective_date } = req.body || {};
  const lastV = await db.prepare('SELECT COALESCE(MAX(version), 0) as v FROM schedule_baselines WHERE project_id = $1').getAsync(req.params.id);
  const newV = (lastV?.v || 0) + 1;
  const effDate = effective_date || new Date().toISOString().slice(0, 10);
  const info = await db.prepare(
    `INSERT INTO schedule_baselines (project_id, version, effective_date, notes, created_by, created_at) VALUES ($1, $2, $3, $4, $5, now())`
  ).runAsync(req.params.id, newV, effDate, notes || null, req.user.id);
  res.json({ id: info.lastInsertRowid, version: newV });
});

router.get('/:id/schedule-baselines', async (req, res) => {
  const db = getDb();
  res.json(await db.prepare('SELECT id, project_id, version, notes, created_at, created_by FROM schedule_baselines WHERE project_id = ? ORDER BY version DESC').allAsync(req.params.id));
});

router.get('/:id/schedule-baselines/:version', async (req, res) => {
  const db = getDb();
  const r = await db.prepare('SELECT * FROM schedule_baselines WHERE project_id = ? AND version = ?').getAsync(req.params.id, req.params.version);
  if (!r) return res.status(404).json({ error: 'Not found' });
  res.json(r);
});

export default router;
