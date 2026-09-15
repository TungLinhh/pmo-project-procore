// Material submittal routes
// Decision 2026-09-04:
//   - SLA: PM chờ 7 ngày (sla_days default)
//   - TVGS: tư vấn giám sát duyệt 3 ngày (supervisor_approval_days default)
//   - State: DRAFT → SUBMITTED → (REJECTED → DRAFT re-submit) | (APPROVED)
//   - Auto-compute 2 deadline khi submit
//   - Auto-escalate khi TVGS quá 3 ngày (handled by scheduler / pending-supervisor endpoint)

import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { permissionMiddleware } from '../lib/permission-middleware.js';
import { getDb } from '../db/index.js';
import { withAudit } from '../lib/with-audit.js';
import { checkTransition } from '../lib/transitions.js';
import { computeSlaDeadline } from '../lib/validation.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(permissionMiddleware);

router.post('/', async (req, res) => {
  const db = getDb();
  const { project_id, material_id, submittal_code, sla_days, parent_submittal_id, supervisor_approval_days } = req.body || {};
  if (!project_id) return res.status(400).json({ error: 'project_id required' });
  const slaDays = sla_days || 7;
  const supDays = supervisor_approval_days || 3;
  const rev = parent_submittal_id
    ? ((await db.prepare('SELECT revision_number FROM material_submittals WHERE id = ?').getAsync(parent_submittal_id))?.revision_number || 0) + 1
    : 0;
  const info = await db.prepare(
    `INSERT INTO material_submittals (project_id, material_id, submittal_code, status, sla_days, supervisor_approval_days, revision_number, parent_submittal_id, submitted_by)
     VALUES (?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?)`
  ).runAsync(project_id, material_id, submittal_code, slaDays, supDays, rev, parent_submittal_id, req.user.id);
  res.json({ id: info.lastInsertRowid, revision_number: rev, sla_days: slaDays, supervisor_approval_days: supDays });
});

router.get('/:id', async (req, res) => {
  const db = getDb();
  const r = await db.prepare('SELECT * FROM material_submittals WHERE id = ?').getAsync(req.params.id);
  if (!r) return res.status(404).json({ error: 'Not found' });
  res.json(r);
});

router.post('/:id/submit', async (req, res) => {
  const db = getDb();
  const old = await db.prepare('SELECT * FROM material_submittals WHERE id = ?').getAsync(req.params.id);
  if (!old) return res.status(404).json({ error: 'Not found' });
  const v = checkTransition('material_submittal', old.status, 'SUBMITTED');
  if (!v.ok) return res.status(422).json({ error: v.error });
  const submittedDate = new Date().toISOString().slice(0, 10);
  const slaDeadline = computeSlaDeadline(submittedDate, old.sla_days || 7);
  const supervisorDeadline = computeSlaDeadline(submittedDate, old.supervisor_approval_days || 3);
  try {
    const result = await withAudit(req, {
      action: 'STATUS_CHANGE', resourceType: 'material_submittal', resourceId: Number(req.params.id),
      context: { project_id: old.project_id, material_id: old.material_id, submittal_code: old.submittal_code },
      before: old,
      after: { ...old, status: 'SUBMITTED', submitted_date: submittedDate, sla_deadline: slaDeadline, supervisor_deadline: supervisorDeadline },
      fieldChanges: [
        { field: 'status', from: old.status, to: 'SUBMITTED' },
        { field: 'sla_deadline', from: old.sla_deadline, to: slaDeadline },
        { field: 'supervisor_deadline', from: old.supervisor_deadline, to: supervisorDeadline },
      ],
      note: `Submit. SLA=${old.sla_days || 7}d (${slaDeadline}), TVGS=${old.supervisor_approval_days || 3}d (${supervisorDeadline})`,
    }, async (client) => {
      const r = await client.query(
        `UPDATE material_submittals SET status = 'SUBMITTED', submitted_date = $1, sla_deadline = $2, supervisor_deadline = $3 WHERE id = $4 RETURNING *`,
        [submittedDate, slaDeadline, supervisorDeadline, req.params.id]
      );
      return r.rows[0];
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/reject', async (req, res) => {
  const db = getDb();
  const { reason } = req.body || {};
  if (!reason) return res.status(400).json({ error: 'rejection reason required' });
  const old = await db.prepare('SELECT * FROM material_submittals WHERE id = ?').getAsync(req.params.id);
  if (!old) return res.status(404).json({ error: 'Not found' });
  const v = checkTransition('material_submittal', old.status, 'REJECTED');
  if (!v.ok) return res.status(422).json({ error: v.error });
  try {
    const result = await withAudit(req, {
      action: 'REJECT', resourceType: 'material_submittal', resourceId: Number(req.params.id),
      context: { project_id: old.project_id, material_id: old.material_id, submittal_code: old.submittal_code },
      before: old,
      after: { ...old, status: 'REJECTED', rejection_reason: reason },
      fieldChanges: [
        { field: 'status', from: old.status, to: 'REJECTED' },
        { field: 'rejection_reason', from: old.rejection_reason, to: reason },
      ],
      note: `Reject: ${reason}`,
    }, async (client) => {
      const r = await client.query(
        `UPDATE material_submittals SET status = 'REJECTED', rejection_reason = $1, rejected_at = now() WHERE id = $2 RETURNING *`,
        [reason, req.params.id]
      );
      return r.rows[0];
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/approve', async (req, res) => {
  const db = getDb();
  const old = await db.prepare('SELECT * FROM material_submittals WHERE id = ?').getAsync(req.params.id);
  if (!old) return res.status(404).json({ error: 'Not found' });
  const v = checkTransition('material_submittal', old.status, 'APPROVED');
  if (!v.ok) return res.status(422).json({ error: v.error });
  try {
    const result = await withAudit(req, {
      action: 'APPROVE', resourceType: 'material_submittal', resourceId: Number(req.params.id),
      context: { project_id: old.project_id, material_id: old.material_id, submittal_code: old.submittal_code },
      before: old,
      after: { ...old, status: 'APPROVED' },
      fieldChanges: [{ field: 'status', from: old.status, to: 'APPROVED' }],
      note: `Approve submittal ${old.submittal_code}`,
    }, async (client) => {
      const r = await client.query(
        `UPDATE material_submittals SET status = 'APPROVED', approved_by = $1, approved_date = now() WHERE id = $2 RETURNING *`,
        [req.user.id, req.params.id]
      );
      return r.rows[0];
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// List submittals for project (supports ?project_id=&status=&limit=)
router.get('/', async (req, res) => {
  const db = getDb();
  const { project_id, status } = req.query;
  if (!project_id) return res.status(400).json({ error: 'project_id required' });
  const where = ['project_id = $1'];
  const params = [project_id];
  let i = 2;
  if (status) { where.push(`status = $${i++}`); params.push(status); }
  params.push(Math.min(parseInt(req.query.limit) || 200, 500));
  const rows = await db.prepare(
    `SELECT * FROM material_submittals WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT $${i}`
  ).allAsync(...params);
  res.json(rows);
});

export default router;
