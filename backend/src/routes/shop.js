// Shop drawing routes — submit + level approval (chain-aware, see lib/approval.js).
// No chain configured → legacy single-step (DRAFT→SUBMITTED→APPROVED).
// Chain configured → approve level-by-level via /approve-level; the direct
// →APPROVED shortcut is rejected (422) for multi-level chains.
// State machine:
//   DRAFT → SUBMITTED → (REJECTED → DRAFT re-submit) | (BQL_L1_PASS → L2 → ... → L5 → APPROVED)
//
// Schema: shop_drawings có sẵn bql_l1_response, bql_l1_date, bql_l1_comment (tương tự L2-L5)
// Response values: 'P' = Pass, 'F' = Fail, 'C' = Conditional, NULL = pending
//
// Mỗi level có thể pass hoặc fail. Nếu fail → status = REJECTED, PM sửa + re-submit (version++)
// Nếu pass L1 → L2 → L3 → L4 → L5 → APPROVED

import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { permissionMiddleware } from '../lib/permission-middleware.js';
import { requireResourceProject, checkProjectAccess } from '../lib/project-access.js';
import { getDb } from '../db/index.js';
import { withAudit } from '../lib/with-audit.js';
import { checkTransition } from '../lib/transitions.js';
import { resolveChain, satisfiesLevel } from '../lib/approval.js';
import { notifyMany } from '../services/notify.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(permissionMiddleware);
router.use('/:id', requireResourceProject({ table: 'shop_drawings' }));

const MAX_LEVEL = 5; // L1-L5

// ===== Create shop drawing =====
router.post('/', async (req, res) => {
  const db = getDb();
  const { project_id, zone_id, drawing_code, name_vi, name_en, planned_submit_date } = req.body || {};
  if (!project_id || !zone_id || !drawing_code) {
    return res.status(400).json({ error: 'project_id, zone_id, drawing_code required' });
  }
  if (!(await checkProjectAccess(req.user, Number(project_id)))) {
    return res.status(404).json({ error: 'Project not found' });
  }
  try {
    const r = await withAudit(req, {
      action: 'CREATE', resourceType: 'shop_drawing', resourceId: 0,
      context: { project_id, zone_id, drawing_code },
      after: { project_id, zone_id, drawing_code, name_vi, name_en },
      note: `Tạo shop drawing ${drawing_code}`,
    }, async (client) => {
      const ins = await client.query(
        `INSERT INTO shop_drawings (project_id, zone_id, drawing_code, name_vi, name_en, planned_submit_date, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT', now()) RETURNING *`,
        [project_id, zone_id, drawing_code, name_vi, name_en, planned_submit_date || null]
      );
      return ins.rows[0];
    });
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== List shop drawings =====
router.get('/', async (req, res) => {
  const db = getDb();
  const { project_id, status } = req.query;
  const where = ['1=1'];
  const params = [];
  let i = 1;
  if (project_id) { where.push(`project_id = $${i++}`); params.push(project_id); }
  if (status) { where.push(`status = $${i++}`); params.push(status); }
  res.json(await db.prepare(
    `SELECT * FROM shop_drawings WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT 200`
  ).allAsync(...params));
});

// ===== Get single shop drawing =====
router.get('/:id', async (req, res) => {
  const db = getDb();
  const r = await db.prepare('SELECT sd.*, z.code AS zone_code FROM shop_drawings sd LEFT JOIN zones z ON z.id = sd.zone_id WHERE sd.id = $1').getAsync(req.params.id);
  if (!r) return res.status(404).json({ error: 'Not found' });
  res.json(r);
});

// ===== PATCH (edit DRAFT/REJECTED) =====
router.patch('/:id', async (req, res) => {
  const db = getDb();
  const old = await db.prepare('SELECT * FROM shop_drawings WHERE id = $1').getAsync(req.params.id);
  if (!old) return res.status(404).json({ error: 'Not found' });
  if (!['DRAFT', 'REJECTED'].includes(old.status)) {
    return res.status(409).json({ error: `Chỉ sửa được khi DRAFT/REJECTED. Hiện tại: ${old.status}` });
  }
  const allowed = ['name_vi', 'name_en', 'progress_pct', 'planned_submit_date', 'notes', 'drawing_code'];
  const updates = [];
  const params = [];
  const fieldChanges = [];
  let i = 1;
  for (const k of allowed) {
    if (k in (req.body || {})) {
      updates.push(`${k} = $${i++}`);
      params.push(req.body[k]);
      fieldChanges.push({ field: k, from: old[k], to: req.body[k] });
    }
  }
  if (!updates.length) return res.status(400).json({ error: 'No editable fields provided' });
  params.push(req.params.id);
  try {
    const result = await withAudit(req, {
      action: 'UPDATE', resourceType: 'shop_drawing', resourceId: Number(req.params.id),
      context: { project_id: old.project_id, zone_id: old.zone_id, drawing_code: old.drawing_code },
      before: old,
      after: { ...old, ...req.body },
      fieldChanges,
      note: `Edit shop drawing (${old.status})`,
    }, async (client) => {
      const r = await client.query(
        `UPDATE shop_drawings SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
        params
      );
      return r.rows[0];
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== Transition: submit / approve / reject (single-level) =====
router.post('/:id/transition', async (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id must be integer' });
  const { to_status, comment } = {
    to_status: req.body?.to_status ?? req.body?.new_status,
    comment: req.body?.comment ?? req.body?.reason ?? null,
  };
  const old = await db.prepare('SELECT * FROM shop_drawings WHERE id = $1').getAsync(id);
  if (!old) return res.status(404).json({ error: 'Not found' });
  if (!['SUBMITTED', 'APPROVED', 'REJECTED'].includes(to_status)) {
    return res.status(400).json({ error: `Invalid to_status: ${to_status}` });
  }
  const t = checkTransition('shop_drawing', old.status, to_status);
  if (!t.ok) {
    return res.status(422).json({ error: t.error });
  }
  // Chain-aware: a multi-level chain must be approved level by level —
  // the single-step shortcut is only legal with no chain (legacy) or 1 level.
  if (to_status === 'APPROVED') {
    const chain = await resolveChain(db, req.user.tenant_id, old.project_id, 'shop_drawing');
    if (chain && chain.length > 1) {
      return res.status(422).json({ error: `Chain ${chain.length} levels: duyệt từng level qua /approve-level` });
    }
  }
  try {
    const result = await withAudit(req, {
      action: to_status === 'APPROVED' ? 'APPROVE' : to_status === 'REJECTED' ? 'REJECT' : 'STATUS_CHANGE',
      resourceType: 'shop_drawing', resourceId: id,
      context: { project_id: old.project_id, drawing_code: old.drawing_code },
      before: old,
      after: { ...old, status: to_status },
      fieldChanges: [{ field: 'status', from: old.status, to: to_status }],
      note: comment || `${old.status} → ${to_status}`,
    }, async (client) => {
      const r = await client.query(
        `UPDATE shop_drawings SET status = $1::workflow_status, approval_date = CASE WHEN $1::workflow_status = 'APPROVED' THEN CURRENT_DATE ELSE approval_date END, actual_submit_date = CASE WHEN $1::workflow_status = 'SUBMITTED' AND actual_submit_date IS NULL THEN CURRENT_DATE ELSE actual_submit_date END, rejected_reason = CASE WHEN $1::workflow_status = 'REJECTED' THEN $2 ELSE rejected_reason END, rejected_at = CASE WHEN $1::workflow_status = 'REJECTED' THEN now() ELSE rejected_at END, rejected_by = CASE WHEN $1::workflow_status = 'REJECTED' THEN $3 ELSE rejected_by END WHERE id = $4 RETURNING *`,
        [to_status, comment || null, req.user.id, id]
      );
      return r.rows[0];
    });
    res.json(result);
  } catch (e) {
    console.error('[shop transition]', req.params.id, '→', to_status, '|', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ===== L1-L5 approve at specific level =====
// POST /api/shop-drawings/:id/approve-level { level: 1, response: 'P'|'F'|'C', comment: '...' }
// Role gate is chain-aware: with a chain, the level's role decides (ADMIN/CEO
// bypass); without a chain, legacy admin/ceo/pmo may approve any level.
router.post('/:id/approve-level', async (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id must be integer' });
  const { level, response, comment } = req.body || {};
  const lvl = parseInt(level, 10);
  if (!Number.isInteger(lvl) || lvl < 1 || lvl > MAX_LEVEL) {
    return res.status(400).json({ error: `level must be 1-${MAX_LEVEL}` });
  }
  if (!['P', 'F', 'C'].includes(response)) {
    return res.status(400).json({ error: "response must be 'P' (Pass), 'F' (Fail), 'C' (Conditional)" });
  }
  const old = await db.prepare('SELECT * FROM shop_drawings WHERE id = $1').getAsync(id);
  if (!old) return res.status(404).json({ error: 'Not found' });
  // Chain-aware cap + per-level role (no chain = legacy: 5 levels, admin/ceo/pmo).
  const chain = await resolveChain(db, req.user.tenant_id, old.project_id, 'shop_drawing');
  const maxLvl = chain?.length ?? MAX_LEVEL;
  if (lvl > maxLvl) {
    return res.status(400).json({ error: `level must be 1-${maxLvl} (chain)` });
  }
  const requiredRole = chain?.[lvl - 1]?.role;
  if (chain) {
    if (requiredRole && !satisfiesLevel(req.user, requiredRole)) {
      return res.status(403).json({ error: `L${lvl} yêu cầu role ${requiredRole}` });
    }
  } else if (!['admin', 'ceo', 'pmo'].includes(req.user.role) && !req.user.is_ceo) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (old.status === 'APPROVED') {
    return res.status(409).json({ error: 'Đã approved rồi, không thể duyệt thêm' });
  }
  if (old.status === 'DRAFT' || old.status === 'REJECTED') {
    return res.status(409).json({ error: `Phải submit trước khi approve. Hiện tại: ${old.status}` });
  }

  // Check previous levels passed
  for (let i = 1; i < lvl; i++) {
    if (old[`bql_l${i}_response`] !== 'P' && old[`bql_l${i}_response`] !== 'C') {
      return res.status(409).json({ error: `L${i} chưa được duyệt Pass. Hiện tại: ${old[`bql_l${i}_response`] || 'pending'}` });
    }
  }

  // Update (chain-aware: final level approves, earlier levels keep SUBMITTED)
  const newStatus = response === 'F' ? 'REJECTED' : (lvl === maxLvl ? 'APPROVED' : 'SUBMITTED');
  const approvalDate = newStatus === 'APPROVED' ? new Date().toISOString() : null;

  try {
    const result = await withAudit(req, {
      action: response === 'F' ? 'REJECT' : 'APPROVE',
      resourceType: 'shop_drawing', resourceId: id,
      context: { project_id: old.project_id, drawing_code: old.drawing_code, level: lvl },
      before: old,
      after: { ...old, [`bql_l${lvl}_response`]: response, status: newStatus, approval_date: approvalDate },
      fieldChanges: [
        { field: `bql_l${lvl}_response`, from: old[`bql_l${lvl}_response`], to: response },
        { field: 'status', from: old.status, to: newStatus },
      ],
      note: `L${lvl} ${response === 'F' ? 'FAIL' : 'PASS'}${comment ? ': ' + comment : ''}`,
    }, async (client) => {
      const r = await client.query(
        `UPDATE shop_drawings SET bql_l${lvl}_response = $1, bql_l${lvl}_date = CURRENT_DATE, bql_l${lvl}_comment = $2, status = $3::workflow_status, approval_date = $4, rejected_reason = CASE WHEN $3::workflow_status = 'REJECTED' THEN $5 ELSE rejected_reason END, rejected_at = CASE WHEN $3::workflow_status = 'REJECTED' THEN now() ELSE rejected_at END, rejected_by = CASE WHEN $3::workflow_status = 'REJECTED' THEN $6 ELSE rejected_by END WHERE id = $7 RETURNING *`,
        [response, comment || null, newStatus, approvalDate, comment || null, req.user.id, id]
      );
      return r.rows[0];
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== Get current approval state =====
router.get('/:id/approval-state', async (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id must be integer' });
  const sd = await db.prepare('SELECT id, project_id, drawing_code, status, bql_l1_response, bql_l1_date, bql_l1_comment, bql_l2_response, bql_l2_date, bql_l2_comment, bql_l3_response, bql_l3_date, bql_l3_comment, bql_l4_response, bql_l4_date, bql_l4_comment, bql_l5_response, bql_l5_date, bql_l5_comment, approval_date, rejected_reason FROM shop_drawings WHERE id = $1').getAsync(id);
  if (!sd) return res.status(404).json({ error: 'Not found' });
  const levels = [];
  for (let i = 1; i <= MAX_LEVEL; i++) {
    const resp = sd[`bql_l${i}_response`];
    const date = sd[`bql_l${i}_date`];
    const comment = sd[`bql_l${i}_comment`];
    levels.push({
      level: i,
      response: resp || 'PENDING',
      date,
      comment,
      is_current: !resp && sd.status === 'SUBMITTED' && (i === 1 || sd[`bql_l${i-1}_response`] === 'P' || sd[`bql_l${i-1}_response`] === 'C'),
    });
  }
  const currentLevel = levels.find(l => l.is_current);
  const chain = await resolveChain(db, req.user.tenant_id, sd.project_id ?? null, 'shop_drawing');
  res.json({
    id: sd.id,
    drawing_code: sd.drawing_code,
    status: sd.status,
    approval_date: sd.approval_date,
    rejected_reason: sd.rejected_reason,
    chain: chain ?? null,
    max_level: chain?.length ?? MAX_LEVEL,
    levels,
    current_level: currentLevel?.level || null,
    is_fully_approved: sd.status === 'APPROVED',
  });
});

// ===== History =====
router.get('/:id/history', async (req, res) => {
  const db = getDb();
  const rows = await db.prepare(`
    SELECT id, action, created_at, user_name, field_changes, note
    FROM audit_log
    WHERE resource_type = 'shop_drawing' AND resource_id = $1
    ORDER BY created_at DESC
  `).allAsync(req.params.id);
  res.json(rows);
});

export default router;
