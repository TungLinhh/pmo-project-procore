// Materials routes
// Schema: materials(project_id, zone_id, source_sheet, material_code, name_vi, name_en, progress_pct, request_date_1, delivery_date_1, ... notes)

import { Router } from 'express';
import { requireAuth, requireRole } from '../lib/auth.js';
import { permissionMiddleware } from '../lib/permission-middleware.js';
import { checkProjectAccess, requireResourceProject } from '../lib/project-access.js';
import { getDb } from '../db/index.js';
import { withAudit } from '../lib/with-audit.js';
import { errorBody } from '../lib/error-body.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use('/:id', requireResourceProject({ table: 'materials' }));
router.use(permissionMiddleware);

const PROCUREMENT_TRANSITIONS = {
  REQUESTED: ['MSB_PREPARING', 'MSB_APPROVED'],
  MSB_PREPARING: ['MSB_APPROVED', 'REJECTED'],
  MSB_APPROVED: ['PO_ISSUED'],
  PO_ISSUED: ['PRODUCTION', 'IN_TRANSIT'],
  PRODUCTION: ['IN_TRANSIT'],
  IN_TRANSIT: ['DELIVERED'],
  DELIVERED: ['ACCEPTED', 'REJECTED'],
  ACCEPTED: [],
  REJECTED: ['MSB_PREPARING'],
};

router.post('/:id/lifecycle', requireRole('admin', 'pm', 'procurement', 'site', 'accounting'), async (req, res) => {
  const db = getDb();
  const toStatus = String(req.body?.to_status || '').toUpperCase();
  const expectedStatus = req.body?.expected_status ? String(req.body.expected_status).toUpperCase() : null;
  if (!toStatus || !PROCUREMENT_TRANSITIONS[toStatus]) return res.status(400).json({ error: 'to_status is invalid' });
  if (toStatus === 'REJECTED' && !req.body?.reason) return res.status(400).json({ error: 'reason is required when rejecting material' });
  if (toStatus === 'ACCEPTED' && req.body?.acceptance_result && !['PASS', 'FAIL'].includes(String(req.body.acceptance_result).toUpperCase())) {
    return res.status(400).json({ error: 'acceptance_result must be PASS or FAIL' });
  }
  const before = await db.prepare('SELECT * FROM materials WHERE id = ?').getAsync(req.params.id);
  if (!before) return res.status(404).json({ error: 'Material not found' });
  const fromStatus = String(before.procurement_status || 'REQUESTED').toUpperCase();
  if (expectedStatus && expectedStatus !== fromStatus) return res.status(409).json({ error: `Material status changed: expected ${expectedStatus}, current ${fromStatus}` });
  if (!(PROCUREMENT_TRANSITIONS[fromStatus] || []).includes(toStatus)) {
    return res.status(422).json({ error: `Invalid material transition ${fromStatus} -> ${toStatus}` });
  }
  const acceptanceResult = req.body?.acceptance_result ? String(req.body.acceptance_result).toUpperCase() : null;
  const deliveredAt = toStatus === 'DELIVERED' ? new Date().toISOString() : (before.delivered_at || null);
  const acceptedAt = toStatus === 'ACCEPTED' ? new Date().toISOString() : (toStatus === 'REJECTED' ? null : before.accepted_at || null);
  try {
    const row = await withAudit(req, {
      action: 'TRANSITION', resourceType: 'material', resourceId: Number(req.params.id),
      context: { project_id: before.project_id, material_code: before.material_code, from: fromStatus, to: toStatus },
      before,
      after: { procurement_status: toStatus, acceptance_result: acceptanceResult, lifecycle_note: req.body?.reason || req.body?.note || null },
      fieldChanges: [{ field: 'procurement_status', from: fromStatus, to: toStatus }],
      note: `${before.material_code}: ${fromStatus} → ${toStatus}`,
    }, async (client) => {
      const result = await client.query(
        `UPDATE materials
         SET procurement_status = $1::varchar,
             po_number = COALESCE($2, po_number),
             po_issued_at = CASE WHEN $1::varchar = 'PO_ISSUED' THEN COALESCE(po_issued_at, now()) ELSE po_issued_at END,
             expected_delivery_at = COALESCE($3, expected_delivery_at),
             delivered_at = $4,
             accepted_at = $5,
             accepted_by = CASE WHEN $1::varchar = 'ACCEPTED' THEN $6 ELSE accepted_by END,
             acceptance_result = CASE WHEN $1::varchar IN ('ACCEPTED', 'REJECTED') THEN $7 ELSE acceptance_result END,
             lifecycle_note = COALESCE($8, lifecycle_note),
             updated_at = now()
         WHERE id = $9 AND procurement_status = $10
         RETURNING *`,
        [toStatus, req.body?.po_number || null, req.body?.expected_delivery_at || null, deliveredAt, acceptedAt,
          req.user.id, acceptanceResult, req.body?.reason || req.body?.note || null, req.params.id, fromStatus],
      );
      if (!result.rows[0]) throw Object.assign(new Error('Material status changed concurrently'), { status: 409 });
      return result.rows[0];
    });
    res.json(row);
  } catch (error) {
    res.status(error.status || 500).json(errorBody(error));
  }
});

router.post('/', async (req, res) => {
  const db = getDb();
  // Accept both 'code' and 'material_code' from frontend
  const { project_id, code, material_code, zone_id, source_sheet, name_vi, name_en, progress_pct, notes, work_item_id } = req.body || {};
  const codeToUse = material_code || code;
  if (!project_id || !codeToUse) return res.status(400).json({ error: 'project_id and code required' });
  if (!(await checkProjectAccess(req.user, Number(project_id)))) {
    return res.status(404).json({ error: 'Project not found' });
  }
  if (zone_id) {
    const zone = await db.prepare('SELECT id FROM zones WHERE id = ? AND project_id = ?').getAsync(zone_id, project_id);
    if (!zone) return res.status(404).json({ error: 'Zone not found' });
  }
  if (work_item_id) {
    const linked = await db.prepare('SELECT id FROM work_items WHERE id = ? AND project_id = ?').getAsync(work_item_id, project_id);
    if (!linked) return res.status(404).json({ error: 'Work item not found' });
  }
  try {
    const r = await withAudit(req, {
      action: 'CREATE', resourceType: 'material',
      context: { project_id },
      after: { code: codeToUse, name_vi, name_en },
      note: `Tạo material ${codeToUse}`,
    }, async (client) => {
      const ins = await client.query(
        `INSERT INTO materials (project_id, zone_id, work_item_id, source_sheet, material_code, name_vi, name_en, progress_pct, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [project_id, zone_id || null, work_item_id || null, source_sheet || null, codeToUse, name_vi, name_en, progress_pct == null || progress_pct === '' ? null : Number(progress_pct), notes || null]
      );
      return ins.rows[0];
    });
    res.status(201).json(r);
  } catch (e) {
    res.status(e.status || 500).json(errorBody(e));
  }
});

export default router;
