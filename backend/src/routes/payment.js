// Payment chain routes (4 step):
//   1. contracts (POST /api/projects/:id/contracts)
//   2. invoices (POST /api/contracts/:id/invoices)
//   3. payment_requests (POST /api/invoices/:id/payment-requests) + PUT to APPROVE
//   4. payments (POST /api/payment-requests/:id/payments) — only when pr.status = APPROVED

import { Router } from 'express';
import { requireAuth, requireRole } from '../lib/auth.js';
import { permissionMiddleware } from '../lib/permission-middleware.js';
import { requireProjectAccess, requireResourceProject } from '../lib/project-access.js';
import { getDb } from '../db/index.js';
import { withAudit } from '../lib/with-audit.js';
import { checkTransition } from '../lib/transitions.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(permissionMiddleware);
// Project-scoped reads/writes below: tenant match + membership (admin/CEO bypass).
router.use('/projects/:id', requireProjectAccess());
router.use('/contracts/:id', requireResourceProject({ table: 'contracts' }));
router.use('/invoices/:id', requireResourceProject({ table: 'invoices', via: { table: 'contracts', from: 'contract_id' } }));
router.use('/payment-requests/:id', requireResourceProject({ table: 'payment_requests', via: [{ table: 'invoices', from: 'invoice_id' }, { table: 'contracts', from: 'contract_id' }] }));

// Step 1: Create contract
router.post('/projects/:id/contracts', async (req, res) => {
  const db = getDb();
  const { contract_no, contract_name, vendor_id, signed_date, total_value } = req.body || {};
  if (!contract_no) return res.status(400).json({ error: 'contract_no required' });
  try {
    const r = await withAudit(req, {
      action: 'CREATE', resourceType: 'contract', resourceId: 0,
      context: { project_id: Number(req.params.id) },
      after: { contract_no, contract_name, vendor_id, signed_date, total_value },
      note: `Tạo hợp đồng ${contract_no}`,
    }, async (client) => {
      const ins = await client.query(
        `INSERT INTO contracts (project_id, vendor_id, contract_no, contract_name, signed_date, total_value) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [req.params.id, vendor_id, contract_no, contract_name, signed_date || null, total_value || null]
      );
      return ins.rows[0];
    });
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Step 2: Create invoice in contract
router.post('/contracts/:id/invoices', async (req, res) => {
  const db = getDb();
  const { invoice_no, invoice_date, amount, vat_amount, status } = req.body || {};
  if (!invoice_no || !amount) return res.status(400).json({ error: 'invoice_no and amount required' });
  try {
    const r = await withAudit(req, {
      action: 'CREATE', resourceType: 'invoice', resourceId: 0,
      context: { contract_id: Number(req.params.id) },
      after: { invoice_no, invoice_date, amount, vat_amount, status },
      note: `Tạo hóa đơn ${invoice_no} (${amount}đ)`,
    }, async (client) => {
      const ins = await client.query(
        `INSERT INTO invoices (contract_id, invoice_no, invoice_date, amount, vat_amount, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [req.params.id, invoice_no, invoice_date || null, amount, vat_amount || 0, status || 'DRAFT']
      );
      return ins.rows[0];
    });
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Step 3: Create payment request on invoice
router.post('/invoices/:id/payment-requests', async (req, res) => {
  const db = getDb();
  const { request_no, request_date, amount, retention_amount, due_date, notes } = req.body || {};
  if (!request_no || !amount) return res.status(400).json({ error: 'request_no and amount required' });
  try {
    const r = await withAudit(req, {
      action: 'CREATE', resourceType: 'payment_request', resourceId: 0,
      context: { invoice_id: Number(req.params.id) },
      after: { request_no, request_date, amount, retention_amount },
      note: `Tạo yêu cầu thanh toán ${request_no}`,
    }, async (client) => {
      const ins = await client.query(
        `INSERT INTO payment_requests (invoice_id, request_no, request_date, amount, retention_amount, due_date, status, notes, created_at) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7, now()) RETURNING *`,
        [req.params.id, request_no, request_date || null, amount, retention_amount || 0, due_date || null, notes || null]
      );
      return ins.rows[0];
    });
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/invoices/:id/payment-requests', async (req, res) => {
  const db = getDb();
  res.json(await db.prepare('SELECT * FROM payment_requests WHERE invoice_id = ? ORDER BY due_date ASC').allAsync(req.params.id));
});

// Invoices of one contract (legacy per-contract loader).
router.get('/contracts/:id/invoices', async (req, res) => {
  const db = getDb();
  res.json(await db.prepare('SELECT * FROM invoices WHERE contract_id = ? ORDER BY invoice_date ASC').allAsync(req.params.id));
});

// All invoices of a project in ONE query (Payment tab bulk load — replaces N+1 fan-out).
router.get('/projects/:id/invoices', async (req, res) => {
  const db = getDb();
  const params = [req.params.id, Math.min(parseInt(req.query.limit) || 500, 1000)];
  res.json(await db.prepare(
    `SELECT i.*, c.contract_no FROM invoices i
     JOIN contracts c ON c.id = i.contract_id
     WHERE c.project_id = $1 ORDER BY i.invoice_date ASC LIMIT $2`
  ).allAsync(...params));
});

// Project-scoped payment-request queue (joins the contract→invoice chain)
router.get('/projects/:id/payment-requests', async (req, res) => {
  const db = getDb();
  const { status } = req.query;
  const where = ['c.project_id = $1'];
  const params = [req.params.id];
  let i = 2;
  if (status) { where.push(`pr.status = $${i++}`); params.push(status); }
  params.push(Math.min(parseInt(req.query.limit) || 200, 500));
  res.json(await db.prepare(
    `SELECT pr.*, i.contract_id, c.contract_no FROM payment_requests pr
     JOIN invoices i ON i.id = pr.invoice_id
     JOIN contracts c ON c.id = i.contract_id
     WHERE ${where.join(' AND ')} ORDER BY pr.due_date ASC LIMIT $${i}`
  ).allAsync(...params));
});

// ---- AR (phải thu từ CĐT): read-only views over ar_contracts/ar_lines ----
router.get('/projects/:id/ar-contracts', async (req, res) => {
  const db = getDb();
  res.json(await db.prepare(
    'SELECT * FROM ar_contracts WHERE project_id = ? ORDER BY ordinal NULLS LAST, id'
  ).allAsync(req.params.id));
});

router.get('/projects/:id/ar-lines', async (req, res) => {
  const db = getDb();
  const { sheet } = req.query;
  const where = ['project_id = $1'];
  const params = [req.params.id];
  if (sheet) { where.push('source_sheet = $2'); params.push(sheet); }
  res.json(await db.prepare(
    `SELECT * FROM ar_lines WHERE ${where.join(' AND ')} ORDER BY ordinal NULLS LAST, id LIMIT 2000`
  ).allAsync(...params));
});

// Update PR (APPROVE / REJECT)
router.get('/payment-requests/:id', async (req, res) => {
  const db = getDb();
  const r = await db.prepare('SELECT * FROM payment_requests WHERE id = ?').getAsync(req.params.id);
  if (!r) return res.status(404).json({ error: 'Not found' });
  res.json(r);
});

router.put('/payment-requests/:id', requireRole('ceo', 'admin', 'accounting'), async (req, res) => {
  const db = getDb();
  const { status, notes } = req.body || {};
  if (!['PENDING', 'APPROVED', 'REJECTED', 'PAID'].includes(status)) {
    return res.status(400).json({ error: 'invalid status' });
  }
  const old = await db.prepare('SELECT * FROM payment_requests WHERE id = ?').getAsync(req.params.id);
  if (!old) return res.status(404).json({ error: 'Not found' });
  const t = checkTransition('payment_request', old.status, status);
  if (!t.ok) return res.status(422).json({ error: t.error });
  try {
    await withAudit(req, {
      action: status === 'APPROVED' ? 'APPROVE' : status === 'REJECTED' ? 'REJECT' : 'STATUS_CHANGE',
      resourceType: 'payment_request', resourceId: Number(req.params.id),
      context: { invoice_id: old.invoice_id },
      before: old,
      after: { ...old, status, notes },
      fieldChanges: [{ field: 'status', from: old.status, to: status }],
      note: `${old.status} → ${status}: ${notes || ''}`,
    }, async (client) => {
      await client.query(
        `UPDATE payment_requests SET status = $1::workflow_status, approved_by = CASE WHEN $1::workflow_status = 'APPROVED' THEN $2::int ELSE approved_by END, approved_date = CASE WHEN $1::workflow_status = 'APPROVED' THEN now() ELSE approved_date END, notes = COALESCE($3, notes) WHERE id = $4`,
        [status, req.user.id, notes, req.params.id]
      );
      return { ok: true };
    });
    res.json({ ok: true, id: req.params.id, status });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Step 4: Create payment (thanh toán thật) — chỉ khi PR APPROVED
router.post('/payment-requests/:id/payments', requireRole('ceo', 'admin', 'accounting'), async (req, res) => {
  const db = getDb();
  const pr = await db.prepare(`
    SELECT pr.*, i.contract_id, c.project_id, c.vendor_id
    FROM payment_requests pr
    JOIN invoices i ON i.id = pr.invoice_id
    JOIN contracts c ON c.id = i.contract_id
    WHERE pr.id = ?
  `).getAsync(req.params.id);
  if (!pr) return res.status(404).json({ error: 'Not found' });
  if (pr.status !== 'APPROVED') {
    return res.status(422).json({ error: `Payment request phải APPROVED mới chi được. Hiện tại: ${pr.status}` });
  }
  const { paid_amount, paid_date, retention_held, vat_paid, paid_method, notes } = req.body || {};
  if (!paid_amount) return res.status(400).json({ error: 'paid_amount required' });
  const paidAt = paid_date ? new Date(paid_date).toISOString() : new Date().toISOString();
  try {
    const r = await withAudit(req, {
      action: 'CREATE', resourceType: 'payment', resourceId: 0,
      context: { project_id: pr.project_id, contract_id: pr.contract_id, invoice_id: pr.invoice_id, payment_request_id: Number(req.params.id) },
      after: { paid_amount, paid_date: paidAt, paid_method },
      note: `Thanh toán ${paid_amount}đ (request ${pr.request_no})`,
    }, async (client) => {
      const ins = await client.query(
        `INSERT INTO payments (project_id, payment_request_id, vendor_id, contract_no, invoice_no, amount, paid_amount, retention_amount, retention_held, vat_amount, vat_paid, paid_at, paid_method, status, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'PAID', $14) RETURNING *`,
        [pr.project_id, pr.id, pr.vendor_id, null, null, pr.amount, paid_amount, pr.retention_amount, retention_held || 0, 0, vat_paid || 0, paidAt, paid_method || null, notes]
      );
      // Mark PR as PAID
      await client.query(`UPDATE payment_requests SET status = 'PAID' WHERE id = $1`, [pr.id]);
      return ins.rows[0];
    });
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
