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
import { requireResourceProject, checkProjectAccess } from '../lib/project-access.js';
import { getDb } from '../db/index.js';
import { readPage, withTotal } from '../lib/pagination.js';
import { withAudit } from '../lib/with-audit.js';
import { checkTransition, checkLifecycle } from '../lib/transitions.js';
import { computeSlaDeadline } from '../lib/validation.js';
import { errorBody } from '../lib/error-body.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use('/:id', requireResourceProject({ table: 'material_submittals' }));
router.use(permissionMiddleware);

router.post('/', async (req, res) => {
  const db = getDb();
  const { project_id, material_id, work_item_id, submittal_code, sla_days, parent_submittal_id, supervisor_approval_days } = req.body || {};
  if (!project_id) return res.status(400).json({ error: 'project_id required' });
  if (!(await checkProjectAccess(req.user, Number(project_id)))) return res.status(404).json({ error: 'Project not found' });
  const material = material_id ? await db.prepare('SELECT project_id, work_item_id FROM materials WHERE id = ?').getAsync(material_id) : null;
  if (material_id && (!material || Number(material.project_id) !== Number(project_id))) return res.status(404).json({ error: 'Material not found' });
  const resolvedWorkItemId = work_item_id || material?.work_item_id || null;
  if (resolvedWorkItemId) {
    const linked = await db.prepare('SELECT id FROM work_items WHERE id = ? AND project_id = ?').getAsync(resolvedWorkItemId, project_id);
    if (!linked) return res.status(404).json({ error: 'Work item not found' });
  }
  const slaDays = sla_days || 7;
  const supDays = supervisor_approval_days || 3;
  // Kiểm tra bản gốc tồn tại — ngoài transaction, chỉ để trả 404 sớm. Số thứ tự
  // thì **không** đọc ở đây.
  if (parent_submittal_id) {
    const parent = await db.prepare('SELECT id FROM material_submittals WHERE id = ? AND project_id = ?')
      .getAsync(parent_submittal_id, project_id);
    if (!parent) return res.status(404).json({ error: 'Parent submittal not found' });
  }
  try {
    // `defer: true` ⇒ `withAudit` đọc `after` **sau** khi callback chạy, nên
    // `revision_number` tính bên trong transaction vẫn được ghi đúng vào audit.
    //
    // Vì sao phải khoá: trước đây số thứ tự đọc **ngoài** transaction rồi `+1`.
    // Hai request song song cùng đọc `0` rồi cùng ghi `1` — đo được 6 bản sửa
    // "số 1" từ 6 request đồng thời (`tests/e2e/concurrency.mjs`). `FOR UPDATE`
    // trên bản gốc khiến request thứ hai **chờ** rồi đọc lại trạng thái mới.
    //
    // Vì sao lại 409 chứ không phải cấp số kế tiếp: `revision_number =
    // parent.revision_number + 1` cùng `parent_submittal_id` mô tả một **chuỗi
    // tuyến tính** — mỗi bản sửa là bản tiếp theo của bản trước. Hai bản sửa cùng
    // một bản gốc là hai bản sửa **cạnh tranh của cùng một phiên bản**, và schema
    // không mô tả nổi hai nhánh (khi đó số thứ tự không còn là `parent + 1` nữa).
    // Nên request thứ hai bị từ chối có lý do — thay vì tạo hai dòng trùng số rồi
    // đẻ thêm lỗi `duplicate key value` của Postgres, là lỗi của hệ thống chứ
    // không phải của người dùng.
    const auditMeta = {
      action: 'CREATE', resourceType: 'material_submittal', defer: true,
      context: { project_id, material_id, work_item_id: resolvedWorkItemId },
    };
    const row = await withAudit(req, auditMeta, async (client) => {
      let revision = 0;
      if (parent_submittal_id) {
        const locked = (await client.query(
          'SELECT revision_number FROM material_submittals WHERE id = $1 AND project_id = $2 FOR UPDATE',
          [parent_submittal_id, project_id],
        )).rows[0];
        if (!locked) throw Object.assign(new Error('Parent submittal not found'), { status: 404 });
        const existing = await client.query(
          'SELECT id FROM material_submittals WHERE parent_submittal_id = $1 LIMIT 1',
          [parent_submittal_id],
        );
        if (existing.rows[0]) {
          throw Object.assign(
            new Error('This submittal already has a revision — revise the latest one instead'),
            { status: 409 },
          );
        }
        revision = Number(locked.revision_number ?? 0) + 1;
      }
      const result = await client.query(
        `INSERT INTO material_submittals (project_id, material_id, work_item_id, submittal_code, status, sla_days, supervisor_approval_days, revision_number, parent_submittal_id, submitted_by)
         VALUES ($1, $2, $3, $4, 'DRAFT', $5, $6, $7, $8, $9) RETURNING *`,
        [project_id, material_id || null, resolvedWorkItemId, submittal_code, slaDays, supDays, revision, parent_submittal_id || null, req.user.id],
      );
      const created = result.rows[0];
      // `withAudit` đọc `auditMeta.note` **sau** khi callback này trả về, nên ghi
      // ở đây vẫn kịp và note mang đúng số thứ tự đã cấp. (`before`/`after` thì đi
      // qua chính cơ chế `defer`, không phụ thuộc thứ tự này.)
      auditMeta.note = `Tạo material submittal ${submittal_code} (bản sửa ${revision})`;
      return {
        value: created,
        before: null,
        after: { project_id, submittal_code, status: 'DRAFT', revision_number: revision },
        resource_id: created.id,
      };
    });
    res.status(201).json(row);
  } catch (e) { res.status(e.status || 500).json(errorBody(e)); }
});

router.get('/:id', async (req, res) => {
  const db = getDb();
  const r = await db.prepare('SELECT * FROM material_submittals WHERE id = ?').getAsync(req.params.id);
  if (!r) return res.status(404).json({ error: 'Not found' });
  res.json(r);
});

router.patch('/:id/physical-sample', async (req, res) => {
  const status = String(req.body?.status || '').toUpperCase();
  if (!['PENDING', 'ACCEPTED', 'REJECTED'].includes(status)) {
    return res.status(400).json({ error: 'status must be PENDING|ACCEPTED|REJECTED' });
  }
  const db = getDb();
  const old = await db.prepare('SELECT * FROM material_submittals WHERE id = ?').getAsync(req.params.id);
  if (!old) return res.status(404).json({ error: 'Not found' });
  if (!['DRAFT', 'SUBMITTED'].includes(old.status)) {
    return res.status(422).json({ error: 'Chỉ cập nhật mẫu vật lý cho MSB DRAFT/SUBMITTED' });
  }
  const lifecycle = checkLifecycle('physical_sample', old.physical_sample_status || 'PENDING', status);
  if (!lifecycle.ok) return res.status(422).json({ error: lifecycle.error });
  const note = req.body?.note == null ? null : String(req.body.note).slice(0, 2000);
  try {
    const row = await withAudit(req, {
      action: 'PHYSICAL_SAMPLE', resourceType: 'material_submittal', resourceId: Number(old.id),
      context: { project_id: old.project_id, submittal_code: old.submittal_code },
      before: { physical_sample_status: old.physical_sample_status, note: old.physical_sample_note },
      after: { physical_sample_status: status, note },
      fieldChanges: [{ field: 'physical_sample_status', from: old.physical_sample_status, to: status }],
      note: `Mẫu vật lý ${old.submittal_code}: ${old.physical_sample_status || 'PENDING'} → ${status}`,
    }, async (client) => {
      const result = await client.query(
        `UPDATE material_submittals
         SET physical_sample_status = $1::varchar, physical_sample_received_at = CASE WHEN $1::varchar = 'PENDING' THEN NULL ELSE now() END,
             physical_sample_updated_by = $2, physical_sample_note = $3
         WHERE id = $4 RETURNING *`,
        [status, req.user.id, note, old.id]
      );
      return result.rows[0];
    });
    res.json(row);
  } catch (e) { res.status(e.status || 500).json(errorBody(e)); }
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
        `UPDATE material_submittals SET status = 'SUBMITTED', submitted_date = $1, sla_deadline = $2, supervisor_deadline = $3,
             physical_sample_status = 'PENDING', physical_sample_received_at = NULL, physical_sample_note = NULL
         WHERE id = $4 AND status = 'DRAFT' RETURNING *`,
        [submittedDate, slaDeadline, supervisorDeadline, req.params.id]
      );
      if (!r.rows[0]) throw Object.assign(new Error('Submittal changed; reload and retry'), { status: 409 });
      return r.rows[0];
    });
    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json(errorBody(e));
  }
});

// POST /api/material-submittals/:id/reopen — explicit REJECTED → DRAFT before re-submit.
router.post('/:id/reopen', async (req, res) => {
  const db = getDb();
  const old = await db.prepare('SELECT * FROM material_submittals WHERE id = ?').getAsync(req.params.id);
  if (!old) return res.status(404).json({ error: 'Not found' });
  const v = checkTransition('material_submittal', old.status, 'DRAFT');
  if (!v.ok) return res.status(422).json({ error: v.error });
  try {
    const row = await withAudit(req, {
      action: 'REOPEN', resourceType: 'material_submittal', resourceId: Number(old.id),
      context: { project_id: old.project_id, submittal_code: old.submittal_code },
      before: { status: old.status, rejection_reason: old.rejection_reason },
      after: { status: 'DRAFT', rejection_reason: null },
      fieldChanges: [{ field: 'status', from: old.status, to: 'DRAFT' }],
      note: `Mở lại submittal ${old.submittal_code}`,
    }, async (client) => {
      const result = await client.query(
        `UPDATE material_submittals
         SET status = 'DRAFT', rejection_reason = NULL, rejected_at = NULL,
             submitted_date = NULL, sla_deadline = NULL, supervisor_deadline = NULL
         WHERE id = $1 AND status = 'REJECTED' RETURNING *`,
        [old.id],
      );
      if (!result.rows[0]) throw Object.assign(new Error('Submittal changed; reload and retry'), { status: 409 });
      return result.rows[0];
    });
    res.json(row);
  } catch (e) { res.status(e.status || 500).json(errorBody(e)); }
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
        `UPDATE material_submittals SET status = 'REJECTED', rejection_reason = $1, rejected_at = now()
         WHERE id = $2 AND status = $3 RETURNING *`,
        [reason, req.params.id, old.status]
      );
      if (!r.rows[0]) throw Object.assign(new Error('Submittal changed; reload and retry'), { status: 409 });
      return r.rows[0];
    });
    const { emitDecision } = await import('../lib/events.js');
    await emitDecision(db, req.user.tenant_id, { kind: 'material_submittal', id: Number(req.params.id), label: old.submittal_code, decision: 'REJECTED', projectId: old.project_id });
    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json(errorBody(e));
  }
});

router.post('/:id/approve', async (req, res) => {
  const db = getDb();
  const old = await db.prepare('SELECT * FROM material_submittals WHERE id = ?').getAsync(req.params.id);
  if (!old) return res.status(404).json({ error: 'Not found' });
  if (old.physical_sample_status !== 'ACCEPTED') {
    return res.status(422).json({ error: 'Mẫu vật lý phải được ghi nhận ACCEPTED trước khi duyệt MSB' });
  }
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
        `UPDATE material_submittals SET status = 'APPROVED', approved_by = $1, approved_date = now()
         WHERE id = $2 AND status = $3 RETURNING *`,
        [req.user.id, req.params.id, old.status]
      );
      if (!r.rows[0]) throw Object.assign(new Error('Submittal changed; reload and retry'), { status: 409 });
      return r.rows[0];
    });
    const { emitDecision } = await import('../lib/events.js');
    await emitDecision(db, req.user.tenant_id, { kind: 'material_submittal', id: Number(req.params.id), label: old.submittal_code, decision: 'APPROVED', projectId: old.project_id });
    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json(errorBody(e));
  }
});

// List submittals for project (supports ?project_id=&status=&limit=)
router.get('/', async (req, res) => {
  const db = getDb();
  const { project_id, status } = req.query;
  if (!project_id) return res.status(400).json({ error: 'project_id required' });
  if (!(await checkProjectAccess(req.user, Number(project_id)))) return res.status(404).json({ error: 'Project not found' });
  const where = ['project_id = $1'];
  const params = [project_id];
  let i = 2;
  if (status) { where.push(`status = $${i++}`); params.push(status); }
  const { limit, offset } = readPage(req.query, { maxLimit: 500 });
  const clause = where.join(' AND ').replaceAll('project_id', 'ms.project_id').replaceAll('status', 'ms.status');
  params.push(limit, offset);
  const rows = await db.prepare(
    `SELECT ms.*, wi.code AS work_item_code
     FROM material_submittals ms
     LEFT JOIN work_items wi ON wi.id = ms.work_item_id
     WHERE ${clause}
     ORDER BY ms.id DESC LIMIT $${i++} OFFSET $${i}`
  ).allAsync(...params);
  // Hàng đợi duyệt lấy `limit=20`. Không có tổng thì 47 việc chờ hiện ra 20 và
  // trông y hệt "hết việc" — người dùng tưởng đã xem sạch.
  const [{ total }] = await db.prepare(
    `SELECT count(*)::int AS total FROM material_submittals ms WHERE ${clause}`
  ).allAsync(...params.slice(0, -2));
  withTotal(res, total);
  res.json(rows);
});

export default router;
