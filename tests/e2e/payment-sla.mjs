// E2E test cho payment chain 4 step + material submittal SLA — env-driven
import { psqlQuery, apiBase } from '../tools/env.mjs';

const BASE = apiBase();
const log = [];
function pass(n, d) { log.push({ n, ok: true, d }); console.log(`  ✅ ${n}: ${d}`); }
function fail(n, d) { log.push({ n, ok: false, d }); console.log(`  ❌ ${n}: ${d}`); }

async function api(token, path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) },
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text.slice(0, 200); }
  return { status: res.status, data };
}

const login = await api(null, '/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) });
const T = login.data?.token;
if (!T) { fail('login', 'no token'); process.exit(1); }
pass('login', `token=${T.slice(0, 10)}...`);

// Throwaway project — never touch real projects (BTE/LVK).
const pj = await api(T, '/api/projects', { method: 'POST', body: JSON.stringify({ code: `PAY-SLA-${Date.now()}` }) });
if (!pj.data?.id) { fail('setup throwaway project', JSON.stringify(pj.data)); process.exit(1); }
const PID = pj.data.id;
pass('setup throwaway project', `id=${PID}`);

console.log('\n=== Payment chain 4 step ===');

// Step 1: Create contract
const c1 = await api(T, `/api/projects/${PID}/contracts`, { method: 'POST', body: JSON.stringify({
  contract_no: `CNT-TEST-${Date.now()}`,
  contract_name: 'HĐ test E2E',
  signed_date: '2026-09-01',
  total_value: 1000000,
}) });
if (c1.status === 200 && c1.data?.id) pass('Step 1: CREATE contract', `id=${c1.data.id} no=${c1.data.contract_no}`);
else { fail('Step 1: CREATE contract', JSON.stringify(c1.data)); }
const contractId = c1.data?.id;

// Step 2: Create invoice
const c2 = await api(T, `/api/contracts/${contractId}/invoices`, { method: 'POST', body: JSON.stringify({
  invoice_no: `INV-TEST-${Date.now()}`,
  invoice_date: '2026-09-15',
  amount: 500000,
  vat_amount: 50000,
}) });
if (c2.status === 200 && c2.data?.id) pass('Step 2: CREATE invoice', `id=${c2.data.id} amount=${c2.data.amount}`);
else { fail('Step 2: CREATE invoice', JSON.stringify(c2.data)); }
const invoiceId = c2.data?.id;

// Step 3: Create payment request
const c3 = await api(T, `/api/invoices/${invoiceId}/payment-requests`, { method: 'POST', body: JSON.stringify({
  request_no: `PR-TEST-${Date.now()}`,
  request_date: '2026-09-20',
  amount: 450000, // amount - retention
  retention_amount: 50000,
  due_date: '2026-10-01',
  notes: 'E2E test',
}) });
if (c3.status === 200 && c3.data?.id) pass('Step 3: CREATE payment_request', `id=${c3.data.id} status=${c3.data.status}`);
else { fail('Step 3: CREATE payment_request', JSON.stringify(c3.data)); }
const prId = c3.data?.id;

// Approve the payment request (needed for step 4)
const c3a = await api(T, `/api/payment-requests/${prId}`, { method: 'PUT', body: JSON.stringify({ status: 'APPROVED', notes: 'CEO approved' }) });
if (c3a.status === 200) pass('Step 3a: APPROVE payment_request', `status=${c3a.data?.status}`);
else fail('Step 3a: APPROVE payment_request', JSON.stringify(c3a.data));

// Step 4: Create payment (thanh toán thật)
const c4 = await api(T, `/api/payment-requests/${prId}/payments`, { method: 'POST', body: JSON.stringify({
  paid_amount: 450000,
  paid_date: '2026-09-25',
  paid_method: 'BANK_TRANSFER',
  notes: 'Thanh toán đợt 1',
}) });
if (c4.status === 200 && c4.data?.id) pass('Step 4: CREATE payment', `id=${c4.data.id} paid=${c4.data.paid_amount}`);
else fail('Step 4: CREATE payment', JSON.stringify(c4.data));

// Verify pr status = PAID
const c4v = await api(T, `/api/payment-requests/${prId}`);
if (c4v.data?.status === 'PAID') pass('Verify pr.status=PAID', `OK`);
else fail('Verify pr.status=PAID', `actual=${c4v.data?.status}`);

// Test negative: cannot create payment for non-APPROVED pr
const neg1 = await api(T, `/api/invoices/${invoiceId}/payment-requests`, { method: 'POST', body: JSON.stringify({
  request_no: `PR-NEG-${Date.now()}`,
  amount: 100,
}) });
const neg1Id = neg1.data?.id;
const neg2 = await api(T, `/api/payment-requests/${neg1Id}/payments`, { method: 'POST', body: JSON.stringify({ paid_amount: 100 }) });
if (neg2.status === 422) pass('Negative: cannot pay non-APPROVED pr', `status=422`);
else fail('Negative: cannot pay non-APPROVED pr', `status=${neg2.status} data=${JSON.stringify(neg2.data)}`);

console.log('\n=== Material submittal SLA (TVGS 3 days) ===');

// Create a submittal
const m1 = await api(T, '/api/material-submittals', { method: 'POST', body: JSON.stringify({
  project_id: PID,
  submittal_code: `SUB-TEST-${Date.now()}`,
  sla_days: 7,
}) });
if (m1.status === 200 && m1.data?.id) pass('Create material_submittal', `id=${m1.data.id} v=${m1.data.revision_number}`);
else { fail('Create material_submittal', JSON.stringify(m1.data)); process.exit(1); }
const msId = m1.data?.id || 1;

// Submit → should compute both deadlines
const m2 = await api(T, `/api/material-submittals/${msId}/submit`, { method: 'POST' });
if (m2.status === 200 && m2.data?.supervisor_deadline && m2.data?.sla_deadline) {
  pass('Submit → 2 deadlines', `sla=${m2.data.sla_deadline} supervisor=${m2.data.supervisor_deadline} (TVGS ${m2.data.supervisor_approval_days}d)`);
} else {
  fail('Submit → 2 deadlines', JSON.stringify(m2.data));
}

// Verify db row
const verify = psqlQuery(
  `SELECT supervisor_approval_days, supervisor_deadline, sla_deadline, sla_days, status FROM material_submittals WHERE id=${msId};`,
  { tuplesOnly: false }
);
if (verify.includes('SUBMITTED') && verify.includes(' 3 ')) {
  pass('DB verify: supervisor_approval_days=3, status=SUBMITTED', 'OK');
} else {
  fail('DB verify', verify);
}

// Pending supervisor endpoint
const m3 = await api(T, `/api/projects/${PID}/material-submittals/pending-supervisor?within_days=5`);
if (m3.status === 200 && Array.isArray(m3.data)) {
  pass('pending-supervisor endpoint', `${m3.data.length} submittals due in 5 days`);
} else {
  fail('pending-supervisor endpoint', JSON.stringify(m3.data));
}

// Overdue endpoint (should include our submittal if we set date in past, or not)
const m4 = await api(T, `/api/projects/${PID}/material-submittals/overdue`);
if (m4.status === 200) {
  pass('overdue endpoint', `${m4.data.length} overdue (SLA or TVGS)`);
} else {
  fail('overdue endpoint', JSON.stringify(m4.data));
}

// Cleanup: everything lives under the throwaway project.
try {
  const run = (sql) => psqlQuery(sql);
  run(`DELETE FROM payments WHERE payment_request_id IN (SELECT pr.id FROM payment_requests pr JOIN invoices i ON i.id = pr.invoice_id JOIN contracts c ON c.id = i.contract_id WHERE c.project_id = ${PID});`);
  run(`DELETE FROM payment_requests WHERE invoice_id IN (SELECT i.id FROM invoices i JOIN contracts c ON c.id = i.contract_id WHERE c.project_id = ${PID});`);
  run(`DELETE FROM invoices WHERE contract_id IN (SELECT id FROM contracts WHERE project_id = ${PID});`);
  run(`DELETE FROM contracts WHERE project_id = ${PID};`);
  run(`DELETE FROM material_submittals WHERE project_id = ${PID};`);
  run(`DELETE FROM project_members WHERE project_id = ${PID};`);
  run(`DELETE FROM projects WHERE id = ${PID};`);
  pass('cleanup throwaway project', `id=${PID}`);
} catch (e) { fail('cleanup throwaway project', e.message.slice(0, 120)); }

const passed = log.filter(l => l.ok).length;
console.log(`\n=== ${passed}/${log.length} PASS ===\n`);
process.exit(log.length - passed);
