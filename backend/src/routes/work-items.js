import { Router } from 'express';
import { readPage, withTotal } from '../lib/pagination.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { permissionMiddleware } from '../lib/permission-middleware.js';
import { requireProjectAccess, requireResourceProject } from '../lib/project-access.js';
import { getDb } from '../db/index.js';
import { withAudit } from '../lib/with-audit.js';
import { ensureWorkItem, linkResourceToWorkItem, listWorkItemLinks } from '../lib/work-items.js';
import { listProductivity, normalizeProductivityInput, upsertProductivity } from '../lib/work-item-productivity.js';
import { applyTenantGuc, resetTenantGuc } from '../lib/tenant.js';
import { errorBody } from '../lib/error-body.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use('/projects/:id', requireProjectAccess());
router.use('/work-items/:id', requireResourceProject({ table: 'work_items' }));
router.use((req, res, next) => {
  const path = req.path || '';
  const isWorkItemPath = /^\/projects\/\d+\/work-items(?:\/|$)/.test(path)
    || /^\/work-items\/\d+(?:\/|$)/.test(path)
    || /^\/projects\/\d+\/productivity(?:\/|$)/.test(path);
  if (!isWorkItemPath) return next();
  return permissionMiddleware(req, res, next);
});

// `limit` chỉ có tác dụng khi **được truyền** (`defaultLimit: null` = không giới
// hạn). Trước đây route không có `LIMIT` nên `?limit=2` trả về đủ 864 dòng — im
// lặng, không lỗi. Mặc định vẫn trả hết để không cắt dữ liệu của bên gọi cũ; khi
// có `limit` thì đẩy xuống SQL thay vì cắt trong JS, vì tải 864 dòng chỉ để bỏ 862
// là lãng phí. `X-Total-Count` để bên gọi biết còn bao nhiêu.
router.get('/projects/:id/work-items', async (req, res) => {
  const db = getDb();
  const { limit } = readPage(req.query, { defaultLimit: null, maxLimit: 2000 });
  const rows = await db.prepare(
    `SELECT wi.*, w.code AS wbs_code, w.name_vi AS wbs_name,
            csi.id AS schedule_item_id
     FROM work_items wi
     LEFT JOIN wbs w ON w.id = wi.wbs_id
     LEFT JOIN construction_schedule_items csi ON csi.work_item_id = wi.id
     WHERE wi.project_id = ?
     ORDER BY wi.code, wi.id${limit === null ? '' : ' LIMIT ?'}`,
  ).allAsync(...(limit === null ? [req.params.id] : [req.params.id, limit]));
  withTotal(res, limit === null ? rows.length : Number(await db.prepare(
    'SELECT count(*) AS c FROM work_items WHERE project_id = ?'
  ).getAsync(req.params.id))?.c || rows.length);
  res.json(rows);
});

router.get('/projects/:id/productivity', async (req, res) => {
  try {
    res.json(await listProductivity(getDb(), Number(req.params.id), req.query || {}));
  } catch (error) {
    res.status(error.status || 500).json(errorBody(error));
  }
});

router.get('/work-items/:id/productivity', async (req, res) => {
  const projectId = Number(req.resourceProjectId);
  if (!projectId) return res.status(404).json({ error: 'Work item not found' });
  try {
    res.json(await listProductivity(getDb(), projectId, { ...(req.query || {}), work_item_id: req.params.id }));
  } catch (error) {
    res.status(error.status || 500).json(errorBody(error));
  }
});

router.post('/work-items/:id/productivity', requireRole('admin', 'pm', 'pmo', 'technical', 'site'), async (req, res) => {
  const db = getDb();
  const workItem = await db.prepare('SELECT id, project_id, code FROM work_items WHERE id = ?').getAsync(req.params.id);
  if (!workItem) return res.status(404).json({ error: 'Work item not found' });
  let input;
  try { input = normalizeProductivityInput(req.body || {}); } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }
  if (input.sourceUploadId != null) {
    const upload = await db.prepare('SELECT id FROM file_uploads WHERE id = ? AND project_id = ?').getAsync(input.sourceUploadId, workItem.project_id);
    if (!upload) return res.status(400).json({ error: 'source_upload_id does not belong to this project' });
  }
  try {
    const row = await withAudit(req, {
      action: 'UPSERT', resourceType: 'work_item_productivity',
      context: { project_id: workItem.project_id, work_item_id: workItem.id },
      after: { period_start: input.periodStart, period_end: input.periodEnd, role_name_vi: input.roleName, kind: input.kind },
      note: `Cập nhật năng suất hạng mục ${workItem.code}`,
    }, async (client) => upsertProductivity(client, {
      projectId: workItem.project_id, workItemId: workItem.id, userId: req.user.id, input,
    }));
    res.status(200).json(row);
  } catch (error) {
    res.status(error.status || 500).json(errorBody(error));
  }
});

router.post('/projects/:id/work-items', requireRole('admin', 'pm', 'pmo', 'technical'), async (req, res) => {
  const body = req.body || {};
  if (!body.code || !String(body.code).trim()) return res.status(400).json({ error: 'code is required' });
  try {
    const row = await withAudit(req, {
      action: 'CREATE', resourceType: 'work_item',
      context: { project_id: Number(req.params.id), code: body.code },
      before: null,
      after: { code: body.code, name_vi: body.name_vi || null },
      note: `Tạo hạng mục ${body.code}`,
    }, async (client) => ensureWorkItem(client, {
      projectId: Number(req.params.id),
      zoneId: body.zone_id || null,
      code: body.code,
      nameVi: body.name_vi || body.name || null,
      nameEn: body.name_en || null,
      itemType: body.item_type === 'GROUP' ? 'GROUP' : 'TASK',
      plannedStartDate: body.planned_start_date || null,
      plannedEndDate: body.planned_end_date || null,
      planDurationDays: body.plan_duration_days == null ? null : Number(body.plan_duration_days),
      progressPct: body.progress_pct == null ? null : Number(body.progress_pct),
    }));
    res.status(201).json(row);
  } catch (error) {
    res.status(error.status || 500).json(errorBody(error));
  }
});

router.get('/work-items/:id/links', async (req, res) => {
  const db = getDb();
  const pool = db.getPool();
  const client = await pool.connect();
  let tenantApplied = false;
  try {
    tenantApplied = await applyTenantGuc(client);
    res.json(await listWorkItemLinks(client, Number(req.params.id)));
  } finally {
    if (tenantApplied) await resetTenantGuc(client);
    client.release();
  }
});

router.patch('/work-items/:id', requireRole('admin', 'pm', 'pmo', 'technical'), async (req, res) => {
  const db = getDb();
  const allowed = ['code', 'name_vi', 'name_en', 'item_type', 'zone_id', 'planned_start_date', 'planned_end_date', 'plan_duration_days', 'progress_pct', 'wbs_id'];
  const fields = Object.keys(req.body || {}).filter((key) => allowed.includes(key));
  if (!fields.length) return res.status(400).json({ error: 'no editable fields provided' });
  const before = await db.prepare('SELECT * FROM work_items WHERE id = ?').getAsync(req.params.id);
  if (!before) return res.status(404).json({ error: 'Work item not found' });
  // Same-project guard as the create path (see lib/work-items.js:ensureWorkItem).
  try {
    if (fields.includes('zone_id') && req.body.zone_id != null) {
      const zone = await db.prepare('SELECT id FROM zones WHERE id = ? AND project_id = ?').getAsync(req.body.zone_id, before.project_id);
      if (!zone) return res.status(404).json({ error: 'Zone not found in this project' });
    }
    if (fields.includes('wbs_id') && req.body.wbs_id != null) {
      const wbs = await db.prepare('SELECT id FROM wbs WHERE id = ? AND project_id = ?').getAsync(req.body.wbs_id, before.project_id);
      if (!wbs) return res.status(404).json({ error: 'WBS node not found in this project' });
    }
  } catch (error) {
    return res.status(error.status || 500).json(errorBody(error));
  }
  try {
    const row = await withAudit(req, {
      action: 'UPDATE', resourceType: 'work_item', resourceId: Number(req.params.id),
      context: { project_id: before.project_id },
      before,
      after: { ...before, ...req.body },
      fieldChanges: fields.map((field) => ({ field, from: before[field], to: req.body[field] })),
      note: `Cập nhật hạng mục ${before.code}`,
    }, async (client) => {
      const sets = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
      const values = fields.map((field) => req.body[field]);
      values.push(req.params.id);
      const result = await client.query(`UPDATE work_items SET ${sets}, updated_at = now() WHERE id = $${fields.length + 1} RETURNING *`, values);
      return result.rows[0];
    });
    res.json(row);
  } catch (error) {
    res.status(error.status || 500).json(errorBody(error));
  }
});

router.post('/work-items/:id/links', requireRole('admin', 'pm', 'pmo', 'technical', 'procurement', 'accounting', 'site'), async (req, res) => {
  const body = req.body || {};
  if (!body.resource_type || body.resource_id == null) return res.status(400).json({ error: 'resource_type and resource_id are required' });
  const db = getDb();
  const current = await db.prepare('SELECT project_id, code FROM work_items WHERE id = ?').getAsync(req.params.id);
  if (!current) return res.status(404).json({ error: 'Work item not found' });
  try {
    const result = await withAudit(req, {
      action: 'LINK', resourceType: 'work_item', resourceId: Number(req.params.id),
      context: { project_id: current.project_id, resource_type: body.resource_type, resource_id: body.resource_id },
      before: null,
      after: { work_item_id: Number(req.params.id), resource_type: body.resource_type, resource_id: Number(body.resource_id) },
      note: `Liên kết ${body.resource_type} #${body.resource_id} vào hạng mục ${current.code}`,
    }, async (client) => linkResourceToWorkItem(client, {
      workItemId: Number(req.params.id),
      projectId: current.project_id,
      resourceType: body.resource_type,
      resourceId: body.resource_id,
      quantity: body.quantity == null ? null : Number(body.quantity),
      acceptedValue: body.accepted_value == null ? null : Number(body.accepted_value),
    }));
    res.status(201).json(result);
  } catch (error) {
    res.status(error.status || 500).json(errorBody(error));
  }
});

export default router;
