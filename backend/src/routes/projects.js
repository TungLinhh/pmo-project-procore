// Projects routes — list, detail, zones, close, revoke

import { Router } from 'express';
import { requireAuth, requireRole, currentUser } from '../lib/auth.js';
import { permissionMiddleware } from '../lib/permission-middleware.js';
import { requireProjectAccess } from '../lib/project-access.js';
import { getDb } from '../db/index.js';
import { readPage, withTotal } from '../lib/pagination.js';
import { withAudit } from '../lib/with-audit.js';
import { errorBody } from '../lib/error-body.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(permissionMiddleware);
// Every /:id/* route below is project-scoped: tenant match + explicit access.
// Admin/CEO have tenant-wide scope. 404s hide inaccessible projects.
router.use('/:id', requireProjectAccess());

router.get('/', async (req, res) => {
  const db = getDb();
  const { include_closed = '0' } = req.query;
  const globalScope = req.user.role === 'admin' || req.user.is_ceo;
  let sql = 'SELECT * FROM projects WHERE tenant_id = ?';
  const params = [req.user.tenant_id];
  if (!globalScope) {
    sql += ` AND (pm_user_id = ? OR EXISTS (
      SELECT 1 FROM project_members visible_membership
      WHERE visible_membership.project_id = projects.id
        AND visible_membership.user_id = ?
    ))`;
    params.push(req.user.id, req.user.id);
  }
  if (include_closed !== '1') sql += " AND status != 'CLOSED'";
  sql += ' ORDER BY id';
  res.json(await db.prepare(sql).allAsync(...params));
});

// Update project meta. Deadline flow: CEO/PM/PMO (propose) + Admin/CEO
// (approve happens on the scenario, not here). start_date/end_date are the
// official deadline fields — changing end_date auto-proposes an AI timeline.
router.patch('/:id', requireRole('admin', 'ceo', 'pm', 'pmo'), async (req, res) => {
  const db = getDb();
  const { isValidDateStr } = await import('../lib/deadline-replan.js');
  const allowed = ['name_vi', 'name_en', 'package', 'department_id', 'start_date', 'end_date'];
  const updates = [];
  const params = [];
  let i = 1;
  const old = await db.prepare('SELECT * FROM projects WHERE id = ?').getAsync(req.params.id);
  if (!old) return res.status(404).json({ error: 'Not found' });
  const body = req.body || {};
  for (const k of allowed) {
    if (k in body) {
      if ((k === 'start_date' || k === 'end_date') && body[k] !== null && body[k] !== '') {
        if (!isValidDateStr(body[k])) return res.status(400).json({ error: `${k} must be YYYY-MM-DD` });
      }
      updates.push(`${k} = $${i++}`); params.push(body[k] === '' ? null : body[k]);
    }
  }
  if (!updates.length) return res.status(400).json({ error: 'No editable fields provided' });
  if ('department_id' in body && body.department_id) {
    const dept = await db.prepare('SELECT id FROM departments WHERE id = ? AND tenant_id = ?').getAsync(body.department_id, req.user.tenant_id);
    if (!dept) return res.status(404).json({ error: 'Department not found' });
  }
  // Validate start <= end on the merged row.
  const norm = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v);
  const nextStart = ('start_date' in body ? body.start_date : norm(old.start_date)) || null;
  const nextEnd = ('end_date' in body ? body.end_date : norm(old.end_date)) || null;
  if (nextStart && nextEnd && nextStart > nextEnd) {
    return res.status(400).json({ error: 'start_date must be ≤ end_date' });
  }
  params.push(req.params.id);
  try {
    const oldEnd = norm(old.end_date);
    const result = await withAudit(req, {
      action: 'UPDATE', resourceType: 'project', resourceId: Number(req.params.id),
      context: { code: old.code },
      before: old,
      after: { ...old, ...body },
      fieldChanges: Object.keys(body).filter((k) => allowed.includes(k)).map((k) => ({ field: k, from: old[k] ?? null, to: body[k] ?? null })),
      note: `Cập nhật project ${old.code}`,
    }, async (client) => {
      const r = await client.query(`UPDATE projects SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`, params);
      return r.rows[0];
    });
    // Deadline changed → auto-propose AI timeline (best-effort, never 500s PATCH).
    let replan = null;
    const newEnd = norm(result.end_date);
    if (newEnd && newEnd !== oldEnd) {
      try {
        const { getEntitlements, hasFeature } = await import('../lib/entitlements.js');
        const ent = await getEntitlements(req.user.tenant_id);
        if (hasFeature(ent, 'schedule-compress')) {
          const { proposeDeadlineReplan } = await import('../lib/deadline-replan.js');
          const policy = body.policy && typeof body.policy === 'object' ? body.policy : {};
          replan = await proposeDeadlineReplan(req, {
            projectId: Number(req.params.id), targetEnd: newEnd, policy, projectCode: old.code,
          });
        } else {
          replan = { skipped: true, reason: `Plan '${ent.plan}' lacks feature 'schedule-compress'` };
        }
      } catch (e) {
        replan = { skipped: true, reason: String(e.message || e).slice(0, 300) };
      }
    }
    res.json(replan ? { ...result, replan } : result);
  } catch (e) {
    res.status(e.status || 500).json(errorBody(e));
  }
});

// Explicit membership (Phase A): who works on this project. Least-privilege —
// no auto-grant. Admin/CEO always pass via requireProjectAccess bypass; PM can
// manage members of projects they belong to.
router.get('/:id/members', async (req, res) => {
  const db = getDb();
  res.json(await db.prepare(
    `SELECT u.id, u.email, u.name, u.role, u.is_ceo, pm.created_at AS member_since
     FROM project_members pm JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = ? ORDER BY u.id`
  ).allAsync(req.params.id));
});

router.post('/:id/members', requireRole('admin', 'ceo', 'pm'), async (req, res) => {
  const db = getDb();
  const { user_id } = req.body || {};
  if (!Number.isInteger(user_id)) return res.status(400).json({ error: 'user_id must be integer' });
  const target = await db.prepare('SELECT id, tenant_id FROM users WHERE id = ?').getAsync(user_id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.tenant_id !== req.user.tenant_id) {
    return res.status(404).json({ error: 'User not found' }); // same code, no leak
  }
  const old = await db.prepare('SELECT * FROM project_members WHERE project_id = ? AND user_id = ?').getAsync(req.params.id, user_id);
  try {
    const result = await withAudit(req, {
      action: 'ADD_MEMBER', resourceType: 'project_member', resourceId: Number(req.params.id),
      context: { project_id: Number(req.params.id), user_id },
      before: old || null,
      after: { project_id: Number(req.params.id), user_id },
      note: `Thêm member ${user_id} vào project ${req.params.id}`,
    }, async (client) => {
      // explicit RETURNING: composite PK table has no id column.
      const r = await client.query(
        'INSERT INTO project_members (project_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING project_id',
        [req.params.id, user_id]
      );
      return { added: r.rowCount > 0 };
    });
    res.status(201).json(result);
  } catch (e) {
    res.status(e.status || 500).json(errorBody(e));
  }
});

router.delete('/:id/members/:userId', requireRole('admin', 'ceo', 'pm'), async (req, res) => {
  const db = getDb();
  const old = await db.prepare('SELECT * FROM project_members WHERE project_id = ? AND user_id = ?').getAsync(req.params.id, req.params.userId);
  if (!old) return res.status(404).json({ error: 'Not a member' });
  try {
    await withAudit(req, {
      action: 'REMOVE_MEMBER', resourceType: 'project_member', resourceId: Number(req.params.id),
      context: { project_id: Number(req.params.id), user_id: Number(req.params.userId) },
      before: old,
      after: null,
      note: `Xóa member ${req.params.userId} khỏi project ${req.params.id}`,
    }, async (client) => {
      await client.query('DELETE FROM project_members WHERE project_id = $1 AND user_id = $2', [req.params.id, req.params.userId]);
      return { ok: true };
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(e.status || 500).json(errorBody(e));
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
    res.status(e.status || 500).json(errorBody(e));
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
    res.status(e.status || 500).json(errorBody(e));
  }
});

// Project-scoped resources (zones, materials, contracts, etc.)
router.get('/:id/zones', async (req, res) => {
  const db = getDb();
  res.json(await db.prepare('SELECT * FROM zones WHERE project_id = ? ORDER BY code').allAsync(req.params.id));
});

// P0-4: area-hierarchy dead end — FieldStubs.jsx + api.areaHierarchy expect
// GET /api/projects/:id/area-hierarchy. Serve the real area_hierarchy table;
// fall back to zones aliased as level='zone' so the field UI (which only
// renders level==='zone') works with zero new tables.
router.get('/:id/area-hierarchy', async (req, res) => {
  const db = getDb();
  let rows = [];
  try {
    rows = await db.prepare(
      'SELECT id, project_id, parent_id, level, code, name_vi, name_en, sort_order FROM area_hierarchy WHERE project_id = ? ORDER BY sort_order, id'
    ).allAsync(req.params.id);
  } catch { rows = []; }
  if (!rows.length) {
    const zones = await db.prepare(
      'SELECT id, code, name_vi, name_en FROM zones WHERE project_id = ? ORDER BY code'
    ).allAsync(req.params.id);
    rows = zones.map((z) => ({
      id: z.id, project_id: Number(req.params.id), parent_id: null,
      level: 'zone', code: z.code, name_vi: z.name_vi, name_en: z.name_en, sort_order: 0,
    }));
  }
  res.json(rows);
});

router.get('/:id/materials', async (req, res) => {
  const db = getDb();
  // `readPage` kẹp limit trong [1, max]. Trước đây `Math.min(parseInt(limit) ||
  // 200, 500)` với `?limit=-1` cho `-1` (truthy nên không rơi về mặc định) ⇒
  // `LIMIT -1` ⇒ Postgres `ERROR: LIMIT must not be negative` ⇒ **500** thay vì
  // 400. Mặc định giữ nguyên 200/500 để không đổi hành vi màn nào.
  const { limit: lim } = readPage(req.query, { defaultLimit: 200, maxLimit: 500 });
  res.json(await db.prepare(
    `SELECT m.*, z.code AS zone_code, wi.code AS work_item_code
     FROM materials m
     LEFT JOIN zones z ON z.id = m.zone_id
     LEFT JOIN work_items wi ON wi.id = m.work_item_id
     WHERE m.project_id = ? ORDER BY m.id LIMIT ?`
  ).allAsync(req.params.id, lim));
});

router.get('/:id/contracts', async (req, res) => {
  const db = getDb();
  res.json(await db.prepare('SELECT * FROM contracts WHERE project_id = ? ORDER BY created_at DESC').allAsync(req.params.id));
});

router.get('/:id/payments', async (req, res) => {
  const db = getDb();
  res.json(await db.prepare('SELECT * FROM payments WHERE project_id = ? ORDER BY id DESC').allAsync(req.params.id));
});

// Route này **che** `routes/daily.js` (`projectsRouter` mount trước `dailyRouter`
// trong `index.js`), nên nó mới là bản thực sự chạy cho `/api/projects/:id/daily-reports`.
// Bản ở `daily.js` đã có phân trang; bản ở đây thì không, nên `?limit=2` trả đủ mọi
// dòng — im lặng, không lỗi. Sửa cả hai cùng cách để không lệch nhau lần nữa:
// `limit` chỉ có tác dụng khi được truyền, mặc định vẫn trả hết.
router.get('/:id/daily-reports', async (req, res) => {
  const db = getDb();
  const { limit } = readPage(req.query, { defaultLimit: null, maxLimit: 500 });
  const all = await db.prepare('SELECT * FROM daily_reports WHERE project_id = ? ORDER BY report_date DESC').allAsync(req.params.id);
  withTotal(res, all.length);
  if (limit === null) return res.json(all);
  return res.json(all.slice(0, limit));
});

// Project manpower: daily_manpower rows joined through daily_reports.
// (The e2e suite + field UI expect a project-scoped list; the cross-project
// rollup lives at GET /api/manpower/rollup.)
router.get('/:id/manpower', async (req, res) => {
  const db = getDb();
  const { limit: lim } = readPage(req.query, { defaultLimit: 200, maxLimit: 500 });
  res.json(await db.prepare(
    `SELECT dm.*, dr.report_date FROM daily_manpower dm
     JOIN daily_reports dr ON dr.id = dm.daily_report_id
     WHERE dr.project_id = ? ORDER BY dr.report_date DESC, dm.id DESC LIMIT ?`
  ).allAsync(req.params.id, lim));
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
  const { limit, offset } = readPage(req.query, { maxLimit: 500 });
  const clause = where.join(' AND ');
  params.push(limit, offset);
  const rows = await db.prepare(
    `SELECT * FROM issues WHERE ${clause} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i}`
  ).allAsync(...params);
  const [{ total }] = await db.prepare(
    `SELECT count(*)::int AS total FROM issues WHERE ${clause}`
  ).allAsync(...params.slice(0, -2));
  withTotal(res, total);
  res.json(rows);
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
  params.push(readPage(req.query, { defaultLimit: 2000, maxLimit: 5000 }).limit);
  res.json(await db.prepare(
    `SELECT csi.*, z.code AS zone_code, wi.code AS work_item_code
     FROM construction_schedule_items csi
     LEFT JOIN zones z ON z.id = csi.zone_id
     LEFT JOIN work_items wi ON wi.id = csi.work_item_id
     WHERE ${where.join(' AND ')} ORDER BY csi.plan_start_date LIMIT $${i}`
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
      // Optimistic lock: field crews update the same rows from phones in
      // parallel, and last-writer-win silently distorts OTD + the health light
      // (lib/s-curves.js, lib/attention.js both read progress_pct/status).
      // Every other status route already answers 409 on a stale predicate.
      const guard = await client.query(
        `SELECT progress_pct FROM construction_schedule_items
          WHERE id = $1 AND project_id = $2 FOR UPDATE`,
        [req.params.itemId, req.params.id]
      );
      if (!guard.rows[0]) throw Object.assign(new Error('Schedule item not found in this project'), { status: 404 });
      const r = await client.query(
        `UPDATE construction_schedule_items SET progress_pct = $1, status = $2 WHERE id = $3 RETURNING *`,
        [progress_pct, status, req.params.itemId]
      );
      if (r.rows[0]?.work_item_id) {
        // project_id predicate on the secondary write: a work_item_id that
        // points outside this project (possible before ensureWorkItem's
        // same-project check) would otherwise update another project's node.
        await client.query(
          'UPDATE work_items SET progress_pct = $1, updated_at = now() WHERE id = $2 AND project_id = $3',
          [progress_pct, r.rows[0].work_item_id, req.params.id],
        );
      }
      return r.rows[0];
    });
    res.json(updated);
  } catch (e) {
    res.status(e.status || 500).json(errorBody(e));
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
  const { limit, offset } = readPage(req.query, { maxLimit: 500 });
  const clause = where.join(' AND ');
  params.push(limit, offset);
  // zone_code joined (same as GET /shop-drawings/:id) — the table itself has no zone_code column.
  const rows = await db.prepare(
    `SELECT sd.*, z.code AS zone_code, wi.code AS work_item_code\n     FROM shop_drawings sd\n     LEFT JOIN zones z ON z.id = sd.zone_id\n     LEFT JOIN work_items wi ON wi.id = sd.work_item_id\n     WHERE ${clause} ORDER BY sd.id DESC LIMIT $${i++} OFFSET $${i}`
  ).allAsync(...params);
  // Tổng khớp đúng bộ lọc, kể cả khi lọc theo status/search — không có nó thì
  // người dùng không phân biệt được "hết dữ liệu" với "còn nữa ở trang sau".
  const [{ total }] = await db.prepare(
    `SELECT count(*)::int AS total FROM shop_drawings sd WHERE ${clause}`
  ).allAsync(...params.slice(0, -2));
  withTotal(res, total);
  res.json(rows);
});

router.get('/:id/material-breakdown', async (req, res) => {
  const db = getDb();
  // materials schema không có category/quantity → breakdown theo zone_id
  res.json(await db.prepare(
    `SELECT zone_id, COUNT(*) as count FROM materials WHERE project_id = $1 GROUP BY zone_id ORDER BY count DESC`
  ).allAsync(req.params.id));
});

// Submittal overdue / pending
router.get('/:id/material-submittals', async (req, res) => {
  const db = getDb();
  const { status } = req.query;
  const where = ['project_id = $1'];
  const params = [req.params.id];
  let i = 2;
  if (status) { where.push(`status = $${i++}`); params.push(status); }
  params.push(readPage(req.query, { defaultLimit: 200, maxLimit: 500 }).limit);
  res.json(await db.prepare(
    `SELECT * FROM material_submittals WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT $${i}`
  ).allAsync(...params));
});

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
  // `within_days` thành `(CURRENT_DATE + (? || ' days')::INTERVAL)` nên âm không
  // gây 500 — nhưng `?within_days=-5` lấy ngược cửa sổ về quá khứ và trả về
  // những submittal **đã quá hạn**, tức trả sai danh sách "sắp đến hạn".
  // Kẹp dưới ở 0 (hạn hôm nay vẫn có nghĩa), trên ở 30 như trước.
  const withinRaw = Number.parseInt(req.query.within_days, 10);
  const within = Math.min(Number.isFinite(withinRaw) ? Math.max(withinRaw, 0) : 3, 30);
  res.json(await db.prepare(`
    SELECT * FROM material_submittals
    WHERE project_id = ? AND status = 'SUBMITTED'
      AND supervisor_deadline <= (CURRENT_DATE + (? || ' days')::INTERVAL)
    ORDER BY supervisor_deadline ASC
  `).allAsync(req.params.id, String(within)));
});

// Pillar gates (SRS Mục 2.5 + 5): trạng thái liên thông 4 trụ cột + cấu hình
// ngưỡng. GET cho mọi member (schedule read); PUT chỉ admin/ceo/pmo (PMO là
// đầu mối điều chỉnh logic gate theo loại dự án).
router.get('/:id/pillar-gates', async (req, res) => {
  const { getPillarGates } = await import('../lib/pillar-gates.js');
  try {
    res.json(await getPillarGates(req.user.tenant_id, Number(req.params.id), req.query.work_item_id ? Number(req.query.work_item_id) : null));
  } catch (e) {
    res.status(e.status || 500).json(errorBody(e));
  }
});

// PUT ngưỡng gate: admin/ceo/pmo (PMO là đầu mối). scope=project (mặc định)
// hoặc tenant (ghi row project_id=0, làm default cho mọi project chưa override).
router.put('/:id/pillar-gates', requireRole('admin', 'ceo', 'pmo'), async (req, res) => {
  const { GATES } = await import('../lib/pillar-gates.js');
  const db = getDb();
  const KNOWN = new Map(GATES.map((g) => [`${g.from}->${g.to}`, g]));
  const scope = req.body?.scope === 'tenant' ? 'tenant' : 'project';
  const targetProject = scope === 'tenant' ? 0 : Number(req.params.id);
  const list = req.body?.gates;
  if (!Array.isArray(list) || !list.length) {
    return res.status(400).json({ error: 'gates must be a non-empty array' });
  }
  for (const g of list) {
    if (!KNOWN.has(`${g.from}->${g.to}`)) {
      return res.status(400).json({ error: `Unknown gate: ${g.from}->${g.to}` });
    }
    if (g.threshold_pct != null && (!Number.isFinite(Number(g.threshold_pct)) || Number(g.threshold_pct) < 0 || Number(g.threshold_pct) > 100)) {
      return res.status(400).json({ error: `threshold_pct must be 0..100 (${g.from}->${g.to})` });
    }
  }
  try {
    const before = await db.prepare(
      'SELECT * FROM pillar_gate_configs WHERE tenant_id = ? AND project_id = ?'
    ).allAsync(req.user.tenant_id, targetProject).catch(() => []);
    const result = await withAudit(req, {
      action: 'UPDATE', resourceType: 'pillar_gate_config', resourceId: Number(req.params.id),
      context: { project_id: Number(req.params.id), scope },
      before,
      after: list,
      fieldChanges: list.map((g) => ({ field: `${g.from}->${g.to}`, from: null, to: { enabled: g.enabled ?? true, threshold_pct: g.threshold_pct ?? null } })),
      note: `PMO cấu hình gate liên trụ cột ${scope} project ${req.params.id}`,
    }, async (client) => {
      const out = [];
      for (const g of list) {
        const enabled = g.enabled ?? true;
        const threshold = g.threshold_pct != null ? Number(g.threshold_pct) : KNOWN.get(`${g.from}->${g.to}`).defaultThreshold;
        const r = await client.query(
          `INSERT INTO pillar_gate_configs (tenant_id, project_id, from_pillar, to_pillar, enabled, threshold_pct, note, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (tenant_id, project_id, from_pillar, to_pillar)
           DO UPDATE SET enabled = EXCLUDED.enabled, threshold_pct = EXCLUDED.threshold_pct,
                         note = EXCLUDED.note, updated_by = EXCLUDED.updated_by, updated_at = now()
           RETURNING *`,
          [req.user.tenant_id, targetProject, g.from, g.to, enabled, threshold, g.note || null, req.user.id]
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

// Official baseline creation captures every schedule item and advances the version.
router.post('/:id/schedule-baselines', requireRole('admin', 'ceo', 'pm', 'pmo'), async (req, res) => {
  const { createBaselineVersion } = await import('../lib/baseline.js');
  const effectiveDate = req.body?.effective_date || null;
  if (effectiveDate && !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) return res.status(400).json({ error: 'effective_date must be YYYY-MM-DD' });
  try {
    const result = await withAudit(req, {
      action: 'CREATE', resourceType: 'schedule_baseline',
      context: { project_id: Number(req.params.id) },
      before: null,
      after: { effective_date: effectiveDate || new Date().toISOString().slice(0, 10) },
      note: `Tạo official schedule baseline cho project ${req.params.id}`,
    }, async (client) => createBaselineVersion(client, {
      projectId: Number(req.params.id),
      userId: req.user.id,
      effectiveDate,
      notes: req.body?.notes || 'Manual official baseline',
    }));
    res.status(200).json({
      id: result.baseline.id,
      version: result.baseline.version,
      is_current: result.baseline.is_current,
      item_count: result.itemCount,
      plan_duration_days: result.planDurationDays,
    });
  } catch (error) {
    res.status(error.status || 500).json(errorBody(error));
  }
});

router.get('/:id/schedule-baselines', async (req, res) => {
  const db = getDb();
  res.json(await db.prepare('SELECT id, project_id, version, effective_date, notes, created_at, created_by, source_scenario_id, content_hash, is_current FROM schedule_baselines WHERE project_id = ? ORDER BY version DESC').allAsync(req.params.id));
});

// S-curves (SRS FR-1.7): KH vs TT lũy kế từng trụ cột, read cho mọi member.
router.get('/:id/s-curves', async (req, res) => {
  const { collectSCurves } = await import('../lib/s-curves.js');
  try {
    res.json(await collectSCurves(Number(req.params.id)));
  } catch (e) {
    res.status(e.status || 500).json(errorBody(e));
  }
});

// Health signals (SRS FR-1.6): đèn theo ngưỡng cấu hình được.
router.get('/:id/health', async (req, res) => {
  const { getProjectHealth } = await import('../lib/health.js');
  try {
    res.json(await getProjectHealth(req.user.tenant_id, Number(req.params.id)));
  } catch (e) {
    res.status(e.status || 500).json(errorBody(e));
  }
});

router.get('/:id/health-thresholds', async (req, res) => {
  const { getEffectiveThresholds } = await import('../lib/health.js');
  try {
    res.json(await getEffectiveThresholds(req.user.tenant_id, Number(req.params.id)));
  } catch (e) {
    res.status(e.status || 500).json(errorBody(e));
  }
});

// PUT ngưỡng: admin/ceo/pmo (PMO là đầu mối). scope=project (mặc định) hoặc
// tenant (ghi row project_id=0, làm default cho mọi project chưa override).
router.put('/:id/health-thresholds', requireRole('admin', 'ceo', 'pmo'), async (req, res) => {
  const { validateThreshold, knownMetric } = await import('../lib/health.js');
  const db = getDb();
  const DIRECTION = { overdue_items: 'high_bad', approval_pct: 'low_bad', payment_overdue: 'high_bad', material_delayed: 'high_bad' };
  const scope = req.body?.scope === 'tenant' ? 'tenant' : 'project';
  const targetProject = scope === 'tenant' ? 0 : Number(req.params.id);
  const list = req.body?.thresholds;
  if (!Array.isArray(list) || !list.length) {
    return res.status(400).json({ error: 'thresholds must be a non-empty array' });
  }
  for (const t of list) {
    if (!knownMetric(t.metric)) return res.status(400).json({ error: `Unknown metric: ${t.metric}` });
    const err = validateThreshold(t.metric, t.yellow_at, t.red_at);
    if (err) return res.status(400).json({ error: `${t.metric}: ${err}` });
  }
  try {
    const before = await db.prepare(
      'SELECT * FROM health_thresholds WHERE tenant_id = ? AND project_id = ?'
    ).allAsync(req.user.tenant_id, targetProject).catch(() => []);
    const result = await withAudit(req, {
      action: 'UPDATE', resourceType: 'health_threshold', resourceId: Number(req.params.id),
      context: { project_id: Number(req.params.id), scope },
      before,
      after: list,
      fieldChanges: list.map((t) => ({ field: t.metric, from: null, to: { yellow_at: Number(t.yellow_at), red_at: Number(t.red_at) } })),
      note: `Cấu hình ngưỡng đèn ${scope} project ${req.params.id}`,
    }, async (client) => {
      const out = [];
      for (const t of list) {
        const r = await client.query(
          `INSERT INTO health_thresholds (tenant_id, project_id, metric, direction, yellow_at, red_at, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (tenant_id, project_id, metric)
           DO UPDATE SET yellow_at = EXCLUDED.yellow_at, red_at = EXCLUDED.red_at,
                         updated_by = EXCLUDED.updated_by, updated_at = now()
           RETURNING *`,
          [req.user.tenant_id, targetProject, t.metric, DIRECTION[t.metric], Number(t.yellow_at), Number(t.red_at), req.user.id]
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

router.get('/:id/schedule-baselines/:version', async (req, res) => {
  const db = getDb();
  const r = await db.prepare('SELECT * FROM schedule_baselines WHERE project_id = ? AND version = ?').getAsync(req.params.id, req.params.version);
  if (!r) return res.status(404).json({ error: 'Not found' });
  const items = await db.prepare('SELECT * FROM schedule_baseline_items WHERE baseline_id = ? ORDER BY schedule_item_id').allAsync(r.id);
  res.json({ ...r, items });
});

// Control summary (SRS NFR task 9): gộp 10 fetch của ControlCenter thành 1
// round-trip — cùng SQL/WHERE/limit mặc định với từng endpoint lẻ (giữ
// byte-for-byte để UI tính pie y hệt), chạy song song server-side. Fallback:
// UI tự tách lại 10 request lẻ khi endpoint này lỗi.
router.get('/:id/control-summary', async (req, res) => {
  const db = getDb();
  const pid = req.params.id;
  try {
    const { getPillarGates } = await import('../lib/pillar-gates.js');
    const { collectSCurves } = await import('../lib/s-curves.js');
    const { getProjectHealth } = await import('../lib/health.js');
    const { getManpowerLoading } = await import('../lib/manpower-plan.js');
    const { getQaSummary } = await import('../lib/pillars.js');
    const [
      schedule, shop, payments, payment_requests, materials,
      material_breakdown, gates, curves, health, loading, qa,
    ] = await Promise.all([
      db.prepare(
        `SELECT csi.*, z.code AS zone_code, wi.code AS work_item_code FROM construction_schedule_items csi
         LEFT JOIN zones z ON z.id = csi.zone_id
         LEFT JOIN work_items wi ON wi.id = csi.work_item_id
         WHERE csi.project_id = $1 ORDER BY csi.plan_start_date LIMIT $2`
      ).allAsync(pid, 2000),
      db.prepare(
        `SELECT sd.*, z.code AS zone_code, wi.code AS work_item_code FROM shop_drawings sd
         LEFT JOIN zones z ON z.id = sd.zone_id
         LEFT JOIN work_items wi ON wi.id = sd.work_item_id
         WHERE sd.project_id = $1 ORDER BY sd.id DESC LIMIT $2`
      ).allAsync(pid, 200),
      db.prepare('SELECT * FROM payments WHERE project_id = ? ORDER BY id DESC').allAsync(pid),
      db.prepare(
        `SELECT pr.*, i.contract_id, c.contract_no FROM payment_requests pr
         JOIN invoices i ON i.id = pr.invoice_id JOIN contracts c ON c.id = i.contract_id
         WHERE c.project_id = $1 ORDER BY pr.due_date ASC LIMIT $2`
      ).allAsync(pid, 200),
      db.prepare(
        `SELECT m.*, z.code AS zone_code, wi.code AS work_item_code FROM materials m
         LEFT JOIN zones z ON z.id = m.zone_id
         LEFT JOIN work_items wi ON wi.id = m.work_item_id
         WHERE m.project_id = $1 ORDER BY m.id LIMIT $2`
      ).allAsync(pid, 500),
      db.prepare(
        `SELECT zone_id, COUNT(*) as count FROM materials WHERE project_id = $1 GROUP BY zone_id ORDER BY count DESC`
      ).allAsync(pid),
      getPillarGates(req.user.tenant_id, Number(pid)),
      collectSCurves(Number(pid)),
      getProjectHealth(req.user.tenant_id, Number(pid)),
      getManpowerLoading(pid, 8),
      getQaSummary(Number(pid)),
    ]);
    res.json({
      project_id: Number(pid),
      fetched_at: new Date().toISOString(),
      schedule, shop, payments, payment_requests, materials, material_breakdown,
      gates, curves, health, loading, qa,
    });
  } catch (e) {
    res.status(e.status || 500).json(errorBody(e));
  }
});

export default router;
