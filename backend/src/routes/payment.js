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
import { readPage, withTotal } from '../lib/pagination.js';
import { withAudit } from '../lib/with-audit.js';
import { checkTransition, checkLifecycle } from '../lib/transitions.js';
import { requireFeature } from '../lib/entitlements.js';
import { errorBody } from '../lib/error-body.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
// Resolve resource ownership before the matrix so an inaccessible project is 404,
// not a role-dependent 403.
router.use('/projects/:id', requireProjectAccess());
router.use('/contracts/:id', requireResourceProject({ table: 'contracts' }));
router.use('/invoices/:id', requireResourceProject({ table: 'invoices', via: { table: 'contracts', from: 'contract_id' } }));
router.use('/payment-requests/:id', requireResourceProject({ table: 'payment_requests', via: [{ table: 'invoices', from: 'invoice_id' }, { table: 'contracts', from: 'contract_id' }] }));
router.use(permissionMiddleware);

// Step 1: Create contract
router.post('/projects/:id/contracts', async (req, res) => {
  const db = getDb();
  const { contract_no, contract_name, vendor_id, signed_date, total_value } = req.body || {};
  const totalValue = Number(total_value);
  if (!contract_no) return res.status(400).json({ error: 'contract_no required' });
  if (!Number.isFinite(totalValue) || totalValue <= 0) return res.status(400).json({ error: 'total_value must be > 0' });
  if (vendor_id != null) {
    const vendor = await db.prepare('SELECT id FROM vendors WHERE id = ? AND tenant_id = ?').getAsync(vendor_id, req.user.tenant_id);
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
  }
  try {
    const r = await withAudit(req, {
      action: 'CREATE', resourceType: 'contract',
      context: { project_id: Number(req.params.id) },
      after: { contract_no, contract_name, vendor_id, signed_date, total_value },
      note: `Tạo hợp đồng ${contract_no}`,
    }, async (client) => {
      const ins = await client.query(
        `INSERT INTO contracts (project_id, vendor_id, contract_no, contract_name, signed_date, total_value) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [req.params.id, vendor_id || null, contract_no, contract_name || null, signed_date || null, totalValue]
      );
      return ins.rows[0];
    });
    res.json(r);
  } catch (e) {
    if (String(e.code) === '23505') return res.status(409).json({ error: 'contract_no already exists for this project' });
    res.status(e.status || 500).json(errorBody(e));
  }
});

// Contracts of one project for the Payment workspace.
router.get('/projects/:id/contracts', async (req, res) => {
  const db = getDb();
  const { limit } = readPage(req.query, { defaultLimit: 500, maxLimit: 1000 });
  res.json(await db.prepare(
    'SELECT * FROM contracts WHERE project_id = ? ORDER BY signed_date DESC NULLS LAST, id DESC LIMIT ?'
  ).allAsync(req.params.id, limit));
});

// Step 2: Create invoice in contract
router.post('/contracts/:id/invoices', async (req, res) => {
  const db = getDb();
  const { invoice_no, invoice_date, amount, vat_amount, status } = req.body || {};
  if (!invoice_no) return res.status(400).json({ error: 'invoice_no required' });
  // `!amount` used to accept amount = -500 (truthy), which then became the
  // ceiling for every payment request on that invoice and made it unpayable.
  const invoiceAmount = Number(amount);
  const vat = Number(vat_amount || 0);
  if (!Number.isFinite(invoiceAmount) || invoiceAmount <= 0) return res.status(400).json({ error: 'amount must be > 0' });
  if (!Number.isFinite(vat) || vat < 0) return res.status(400).json({ error: 'vat_amount must be >= 0' });
  try {
    const r = await withAudit(req, {
      action: 'CREATE', resourceType: 'invoice',
      context: { contract_id: Number(req.params.id) },
      after: { invoice_no, invoice_date, amount: invoiceAmount, vat_amount: vat, status },
      note: `Tạo hóa đơn ${invoice_no} (${invoiceAmount}đ)`,
    }, async (client) => {
      // Lock the contract so the cumulative cap below cannot be raced, and so
      // invoicing can never silently exceed the signed contract value.
      const contract = await client.query(
        `SELECT id, total_value FROM contracts WHERE id = $1 FOR UPDATE`,
        [req.params.id]
      );
      if (!contract.rows[0]) throw Object.assign(new Error('Contract not found'), { status: 404 });
      const totalValue = Number(contract.rows[0].total_value || 0);
      const invoiced = await client.query(
        `SELECT COALESCE(SUM(amount), 0) AS s FROM invoices WHERE contract_id = $1`,
        [req.params.id]
      );
      if (totalValue > 0 && Number(invoiced.rows[0].s) + invoiceAmount > totalValue + 0.01) {
        throw Object.assign(new Error('Tổng hóa đơn vượt quá giá trị hợp đồng'), { status: 422 });
      }
      const ins = await client.query(
        `INSERT INTO invoices (contract_id, invoice_no, invoice_date, amount, vat_amount, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [req.params.id, invoice_no, invoice_date || null, invoiceAmount, vat, status || 'DRAFT']
      );
      return ins.rows[0];
    });
    res.json(r);
  } catch (e) {
    if (String(e.code) === '23505') return res.status(409).json({ error: 'invoice_no already exists for this contract' });
    res.status(e.status || 500).json(errorBody(e));
  }
});

// Step 3: Create payment request on invoice
router.post('/invoices/:id/payment-requests', async (req, res) => {
  const db = getDb();
  const { request_no, request_date, amount, retention_amount, retention_due_date, due_date, notes } = req.body || {};
  if (!request_no || !amount) return res.status(400).json({ error: 'request_no and amount required' });
  const requestAmount = Number(amount);
  const retention = Number(retention_amount || 0);
  if (!Number.isFinite(requestAmount) || requestAmount <= 0) return res.status(400).json({ error: 'amount must be > 0' });
  if (!Number.isFinite(retention) || retention < 0) return res.status(400).json({ error: 'retention_amount must be >= 0' });
  const invoice = await db.prepare('SELECT amount FROM invoices WHERE id = ?').getAsync(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  if (requestAmount + retention > Number(invoice.amount) + 0.01) {
    return res.status(422).json({ error: 'amount + retention_amount cannot exceed invoice amount' });
  }
  if (retention_due_date && !/^\d{4}-\d{2}-\d{2}$/.test(String(retention_due_date))) {
    return res.status(400).json({ error: 'retention_due_date must be YYYY-MM-DD' });
  }
  try {
    const r = await withAudit(req, {
      action: 'CREATE', resourceType: 'payment_request',
      context: { invoice_id: Number(req.params.id) },
      after: { request_no, request_date, amount: requestAmount, retention_amount: retention, retention_due_date: retention_due_date || null },
      note: `Tạo yêu cầu thanh toán ${request_no}`,
    }, async (client) => {
      // Serialize request creation per invoice. Individual requests may be
      // partial, but their active net + retention total cannot exceed the
      // invoice value. The lock prevents two concurrent requests from both
      // passing the same cumulative check.
      const lockedInvoice = await client.query(
        'SELECT amount FROM invoices WHERE id = $1 FOR UPDATE',
        [req.params.id],
      );
      if (!lockedInvoice.rows[0]) throw Object.assign(new Error('Invoice not found'), { status: 404 });
      const activeTotal = await client.query(
        `SELECT COALESCE(SUM(amount + COALESCE(retention_amount, 0)), 0) AS total
         FROM payment_requests
         WHERE invoice_id = $1 AND status IN ('PENDING', 'SUBMITTED', 'APPROVED', 'PAID')`,
        [req.params.id],
      );
      const invoiceAmount = Number(lockedInvoice.rows[0].amount);
      const requestedTotal = Number(activeTotal.rows[0].total) + requestAmount + retention;
      if (requestedTotal > invoiceAmount + 0.01) {
        throw Object.assign(new Error('active payment requests exceed invoice amount'), { status: 422 });
      }
      const ins = await client.query(
        `INSERT INTO payment_requests (invoice_id, request_no, request_date, amount, retention_amount, retention_due_date, due_date, status, retention_status, notes, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING', $8, $9, now()) RETURNING *`,
        [req.params.id, request_no, request_date || null, requestAmount, retention, retention_due_date || null, due_date || null,
          retention > 0 ? 'PENDING' : 'NOT_APPLICABLE', notes || null]
      );
      return ins.rows[0];
    });
    res.json(r);
  } catch (e) {
    res.status(e.status || 500).json(errorBody(e));
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
  const params = [req.params.id, readPage(req.query, { defaultLimit: 500, maxLimit: 1000 }).limit];
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
  const { limit, offset } = readPage(req.query, { maxLimit: 500 });
  const clause = where.join(' AND ');
  params.push(limit, offset);
  const rows = await db.prepare(
    `SELECT pr.*, i.contract_id, i.invoice_no, c.contract_no FROM payment_requests pr
     JOIN invoices i ON i.id = pr.invoice_id
     JOIN contracts c ON c.id = i.contract_id
     WHERE ${clause} ORDER BY pr.due_date ASC LIMIT $${i++} OFFSET $${i}`
  ).allAsync(...params);
  // Bản đếm phải có **cùng** các JOIN: điều kiện lọc dùng bí danh `c` ( của
  // `contracts`), nên đếm mà thiếu JOIN thì Postgres báo "missing FROM-clause" và
  // cả route trả 500. Sai này làm hỏng cả màn `Thanh toán`, không chỉ số đếm.
  const [{ total }] = await db.prepare(
    `SELECT count(*)::int AS total FROM payment_requests pr
     JOIN invoices i ON i.id = pr.invoice_id
     JOIN contracts c ON c.id = i.contract_id
     WHERE ${clause}`
  ).allAsync(...params.slice(0, -2));
  withTotal(res, total);
  res.json(rows);
});

// Payments of one project. Kept separate from payment_requests so the Payment
// screen can show cumulative paid and retention amounts without N+1 requests.
router.get('/projects/:id/payments', async (req, res) => {
  const db = getDb();
  const { limit } = readPage(req.query, { defaultLimit: 1000, maxLimit: 2000 });
  res.json(await db.prepare(
    'SELECT * FROM payments WHERE project_id = ? ORDER BY paid_at DESC NULLS LAST, id DESC LIMIT ?'
  ).allAsync(req.params.id, limit));
});

// ---- AR (phải thu từ CĐT): Mid=read, Enterprise=full. Small gets 403. ----
router.get('/projects/:id/ar-contracts', requireFeature('ar-read'), async (req, res) => {
  const db = getDb();
  res.json(await db.prepare(
    'SELECT * FROM ar_contracts WHERE project_id = ? ORDER BY ordinal NULLS LAST, id'
  ).allAsync(req.params.id));
});

router.get('/projects/:id/ar-lines', requireFeature('ar-read'), async (req, res) => {
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

router.put('/payment-requests/:id', requireRole('admin', 'accounting', 'pm', 'pmo'), async (req, res) => {
  const db = getDb();
  const { status, notes } = req.body || {};
  if (!['PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED'].includes(status)) {
    if (status === 'PAID') return res.status(422).json({ error: 'Dùng POST /payment-requests/:id/payments để ghi PAID' });
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
      if (old.status === 'REJECTED' && (status === 'PENDING' || status === 'SUBMITTED')) {
        const invoice = await client.query('SELECT amount FROM invoices WHERE id = $1 FOR UPDATE', [old.invoice_id]);
        const active = await client.query(
          `SELECT COALESCE(SUM(amount + COALESCE(retention_amount, 0)), 0) AS total
           FROM payment_requests
           WHERE invoice_id = $1 AND id <> $2 AND status IN ('PENDING', 'SUBMITTED', 'APPROVED', 'PAID')`,
          [old.invoice_id, old.id],
        );
        const total = Number(active.rows[0]?.total || 0) + Number(old.amount || 0) + Number(old.retention_amount || 0);
        if (total > Number(invoice.rows[0]?.amount || 0) + 0.01) {
          throw Object.assign(new Error('active payment requests exceed invoice amount'), { status: 422 });
        }
      }
      const changed = await client.query(
        `UPDATE payment_requests SET status = $1::workflow_status, approved_by = CASE WHEN $1::workflow_status = 'APPROVED' THEN $2::int ELSE approved_by END, approved_date = CASE WHEN $1::workflow_status = 'APPROVED' THEN now() ELSE approved_date END, notes = COALESCE($3, notes) WHERE id = $4 AND status = $5::workflow_status`,
        [status, req.user.id, notes, req.params.id, old.status]
      );
      if (changed.rowCount !== 1) {
        throw Object.assign(new Error('Payment request đã được cập nhật bởi phiên khác'), { status: 409 });
      }
      return { ok: true };
    });
    if (status === 'APPROVED' || status === 'REJECTED') {
      // The business transaction is already committed. Notification and ERP
      // delivery are best-effort and must not turn a successful approval into
      // an HTTP 500 response.
      try {
        const { emitDecision } = await import('../lib/events.js');
        const proj = await db.prepare(
          `SELECT c.project_id FROM payment_requests pr JOIN invoices i ON i.id = pr.invoice_id JOIN contracts c ON c.id = i.contract_id WHERE pr.id = ?`
        ).getAsync(req.params.id);
        await emitDecision(db, req.user.tenant_id, { kind: 'payment_request', id: Number(req.params.id), label: old.request_no, decision: status, projectId: proj?.project_id ?? null });
        const { emitWebhook } = await import('../lib/erp-webhook.js');
        await emitWebhook(req.user.tenant_id, `payment_request.${status.toLowerCase()}`, {
          payment_request_id: Number(req.params.id), request_no: old.request_no, project_id: proj?.project_id ?? null,
        });
      } catch (e) {
        console.warn(`[payment] post-commit notification failed for ${req.params.id}: ${e.message}`);
      }
    }
    res.json({ ok: true, id: req.params.id, status });
  } catch (e) {
    res.status(e.status || 500).json(errorBody(e));
  }
});

// Step 4: Create payment (thanh toán thật) — chỉ khi PR APPROVED
router.post('/payment-requests/:id/payments', requireRole('admin', 'accounting'), async (req, res) => {
  const db = getDb();
  const pr = await db.prepare(`
    SELECT pr.*, i.contract_id, i.invoice_no, i.vat_amount AS invoice_vat_amount,
           c.project_id, c.vendor_id, c.contract_no
    FROM payment_requests pr
    JOIN invoices i ON i.id = pr.invoice_id
    JOIN contracts c ON c.id = i.contract_id
    WHERE pr.id = ?
  `).getAsync(req.params.id);
  if (!pr) return res.status(404).json({ error: 'Not found' });
  // Idempotency-Key (tùy chọn, ≤64 ký tự): replay cùng key trả về payment cũ
  // NGAY CẢ khi PR đã PAID — check này phải đứng trước check APPROVED, nếu
  // không retry sau khi chi thành công sẽ dính 422 thay vì nhận lại dòng cũ.
  const rawIdemKey = String(req.headers['idempotency-key'] || '').trim();
  if (rawIdemKey.length > 64) return res.status(400).json({ error: 'Idempotency-Key must be ≤64 characters' });
  const idemKey = rawIdemKey || null;
  if (idemKey) {
    const prev = await db.prepare('SELECT * FROM payments WHERE idempotency_key = ?').getAsync(idemKey);
    if (prev) {
      if (Number(prev.payment_request_id) === Number(pr.id)) return res.json(prev);
      return res.status(409).json({ error: 'Idempotency-Key đã dùng cho payment request khác' });
    }
  }
  if (pr.status === 'PAID') {
    return res.status(409).json({ error: 'Payment request đã được chi bởi một phiên khác' });
  }
  if (pr.status !== 'APPROVED') {
    return res.status(422).json({ error: `Payment request phải APPROVED mới chi được. Hiện tại: ${pr.status}` });
  }
  const { paid_date, retention_held, vat_paid, paid_method, notes } = req.body || {};
  const paidAmount = Number(req.body?.paid_amount);
  const retentionHeld = Object.prototype.hasOwnProperty.call(req.body || {}, 'retention_held')
    ? Number(retention_held || 0)
    : Number(pr.retention_amount || 0);
  const retentionDueDateInput = Object.prototype.hasOwnProperty.call(req.body || {}, 'retention_due_date')
    ? (req.body.retention_due_date || null)
    : (pr.retention_due_date || null);
  const retentionDueDate = retentionDueDateInput instanceof Date
    ? retentionDueDateInput.toISOString().slice(0, 10)
    : (typeof retentionDueDateInput === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(retentionDueDateInput)
      ? retentionDueDateInput.slice(0, 10)
      : retentionDueDateInput);
  if (retentionDueDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(retentionDueDate))) {
    return res.status(400).json({ error: 'retention_due_date must be YYYY-MM-DD' });
  }
  const vatPaid = Number(vat_paid || 0);
  const requestAmount = Number(pr.amount || 0);
  if (!Number.isFinite(paidAmount) || paidAmount <= 0 || paidAmount > requestAmount) {
    return res.status(400).json({ error: `paid_amount must be in (0, ${requestAmount}]` });
  }
  if (Math.abs(paidAmount - requestAmount) > 0.005) {
    return res.status(422).json({
      error: 'paid_amount must equal the approved request amount; create a separate request for each installment',
    });
  }
  const declaredRetention = Number(pr.retention_amount || 0);
  if (!Number.isFinite(retentionHeld) || retentionHeld < 0 || retentionHeld > declaredRetention) {
    return res.status(400).json({ error: 'retention_held must be within the request retention amount' });
  }
  if (declaredRetention > 0 && retentionHeld !== declaredRetention) {
    return res.status(400).json({ error: 'retention_held must equal the request retention amount' });
  }
  if (!Number.isFinite(vatPaid) || vatPaid < 0) return res.status(400).json({ error: 'vat_paid must be >= 0' });
  const paidDate = paid_date ? new Date(paid_date) : new Date();
  if (Number.isNaN(paidDate.getTime())) return res.status(400).json({ error: 'paid_date is invalid' });
  const paidAt = paidDate.toISOString();
  try {
    const r = await withAudit(req, {
      action: 'CREATE', resourceType: 'payment',
      context: { project_id: pr.project_id, contract_id: pr.contract_id, invoice_id: pr.invoice_id, payment_request_id: Number(req.params.id) },
      after: { paid_amount: paidAmount, paid_date: paidAt, paid_method },
      note: `Thanh toán ${paidAmount}đ (request ${pr.request_no})`,
    }, async (client) => {
      // Claim APPROVED→PAID before inserting the ledger row. A concurrent loser
      // blocks on this row, then rolls back without attempting another insert.
      const upd = await client.query(
        `UPDATE payment_requests SET status = 'PAID' WHERE id = $1 AND status = 'APPROVED'`,
        [pr.id]
      );
      if (upd.rowCount !== 1) {
        throw Object.assign(new Error('Payment request đã được chi bởi phiên khác (concurrent pay)'), { status: 409 });
      }
      const ins = await client.query(
        `INSERT INTO payments (project_id, payment_request_id, vendor_id, contract_no, invoice_no, amount, paid_amount, retention_amount, retention_held, vat_amount, vat_paid, due_date, paid_at, paid_method, status, notes, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'PAID', $15, $16) RETURNING *`,
        [pr.project_id, pr.id, pr.vendor_id, pr.contract_no, pr.invoice_no, pr.amount, paidAmount, pr.retention_amount, retentionHeld, pr.invoice_vat_amount ?? 0, vatPaid, pr.due_date || null, paidAt, paid_method || null, notes, idemKey]
      );
      await client.query(
        `UPDATE payment_requests
         SET retention_status = $1, retention_due_date = $2
         WHERE id = $3`,
        [retentionHeld > 0 ? 'PENDING' : 'NOT_APPLICABLE', retentionDueDate, pr.id]
      );
      return ins.rows[0];
    });
    res.status(201).json(r);
  } catch (e) {
    // 23505 = thua race ở UNIQUE DB (payment_request_id hoặc idempotency_key):
    // replay cùng key → trả payment cũ 200; còn lại 409 để client không retry mù.
    if (String(e.code) === '23505') {
      if (idemKey) {
        const prev = await db.prepare('SELECT * FROM payments WHERE idempotency_key = ?').getAsync(idemKey);
        if (prev && Number(prev.payment_request_id) === Number(pr.id)) return res.json(prev);
        if (prev) return res.status(409).json({ error: 'Idempotency-Key đã dùng cho payment request khác' });
      }
      return res.status(409).json({ error: 'Payment đã tồn tại cho request này (duplicate)' });
    }
    res.status(e.status || 500).json(errorBody(e));
  }
});

// Release all or part of the retention held by the payment ledger row.
router.post('/payment-requests/:id/retention/release', requireRole('admin', 'accounting'), async (req, res) => {
  const db = getDb();
  const before = await db.prepare('SELECT * FROM payment_requests WHERE id = ?').getAsync(req.params.id);
  if (!before) return res.status(404).json({ error: 'Not found' });
  if (before.status !== 'PAID') return res.status(422).json({ error: 'Chỉ release retention sau khi payment đã PAID' });
  if (before.retention_status === 'NOT_APPLICABLE') return res.status(422).json({ error: 'Payment request không giữ retention' });
  if (before.retention_status === 'RELEASED') return res.status(409).json({ error: 'Retention đã được release' });
  const amount = Number(req.body?.released_amount);
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'released_amount must be > 0' });
  const releasedAt = req.body?.released_at ? new Date(req.body.released_at) : new Date();
  if (Number.isNaN(releasedAt.getTime())) return res.status(400).json({ error: 'released_at is invalid' });
  try {
    const row = await withAudit(req, {
      action: 'RELEASE_RETENTION', resourceType: 'payment_request', resourceId: Number(before.id),
      context: { retention_amount: amount },
      before: { retention_status: before.retention_status, released: before.retention_released_amount },
      after: { released: Number(before.retention_released_amount || 0) + amount, at: releasedAt.toISOString() },
      note: `Release retention ${amount} cho ${before.request_no}`,
    }, async (client) => {
      const locked = await client.query('SELECT * FROM payment_requests WHERE id = $1 FOR UPDATE', [before.id]);
      const pr = locked.rows[0];
      if (!pr || pr.retention_status === 'RELEASED') throw Object.assign(new Error('Retention đã được release'), { status: 409 });
      const pay = await client.query(
        `SELECT * FROM payments WHERE payment_request_id = $1 ORDER BY id DESC LIMIT 1 FOR UPDATE`,
        [before.id]
      );
      const payment = pay.rows[0];
      if (!payment) throw Object.assign(new Error('Chưa có payment ledger để release retention'), { status: 422 });
      const held = Number(payment.retention_held || 0);
      const released = Number(pr.retention_released_amount || 0);
      const remaining = held - released;
      if (amount > remaining) throw Object.assign(new Error(`released_amount vượt số retention còn giữ (${remaining})`), { status: 422 });
      const nextReleased = released + amount;
      const fullyReleased = nextReleased >= held;
      const lifecycle = checkLifecycle('retention', pr.retention_status || 'PENDING', fullyReleased ? 'RELEASED' : 'PENDING');
      if (!lifecycle.ok) throw Object.assign(new Error(lifecycle.error), { status: 409 });
      await client.query(
        `UPDATE payments
         SET retention_released_amount = $1, retention_released_at = $2
         WHERE id = $3`,
        [nextReleased, releasedAt.toISOString(), payment.id]
      );
      const updated = await client.query(
        `UPDATE payment_requests
         SET retention_status = $1::varchar, retention_released_amount = $2,
             retention_released_at = CASE WHEN $1::varchar = 'RELEASED' THEN $3::timestamptz ELSE retention_released_at END,
             retention_released_by = CASE WHEN $1::varchar = 'RELEASED' THEN $4::int ELSE retention_released_by END
         WHERE id = $5 RETURNING *`,
        [fullyReleased ? 'RELEASED' : 'PENDING', nextReleased, releasedAt.toISOString(), req.user.id, pr.id]
      );
      return updated.rows[0];
    });
    res.json(row);
  } catch (e) { res.status(e.status || 500).json(errorBody(e)); }
});

export default router;
