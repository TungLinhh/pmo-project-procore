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

// Bầ dễng dịn được chạy khi thành công. File này không có `try/finally`
// mà có `process.exit(1)` đển cấy ra địn dự án (dòng 224). Một lỗn hổng giữa
// để lại dự án rác, và `p5-golden.mjs` để đỏ vày đổ trong cái các đúng
// bào cỗ gì: nhiệm vược là từp bộ "không có dữ liệu rác test lọt vào demo".
// `process.on('exit')` bềt được cho mọi đưộng thoát — kể cả `process.exit(1)`.
// `AGENTS.md`: mọi bài kiểm phải tự dọn dòng của mình.
const CLEANUP_SQL = [
  `DELETE FROM payments WHERE payment_request_id IN (SELECT pr.id FROM payment_requests pr JOIN invoices i ON i.id = pr.invoice_id JOIN contracts c ON c.id = i.contract_id WHERE c.project_id = ${PID})`,
  `DELETE FROM payment_requests WHERE invoice_id IN (SELECT i.id FROM invoices i JOIN contracts c ON c.id = i.contract_id WHERE c.project_id = ${PID})`,
  `DELETE FROM invoices WHERE contract_id IN (SELECT id FROM contracts WHERE project_id = ${PID})`,
  `DELETE FROM contracts WHERE project_id = ${PID}`,
  `DELETE FROM material_submittals WHERE project_id = ${PID}`,
  `DELETE FROM project_members WHERE project_id = ${PID}`,
  `DELETE FROM zones WHERE project_id = ${PID}`,
  `DELETE FROM audit_log WHERE resource_type = 'projects' AND resource_id = ${PID}`,
  `DELETE FROM projects WHERE id = ${PID}`,
];
process.on('exit', () => {
  // `psqlQuery` dùng sẵ dụng ESM nên dùng `require` để dọn. Handler chỉy chạy khi
  // DB còn sống; nếu không thì dõn rác cho lần sau.
  for (const sql of CLEANUP_SQL) {
    try { psqlQuery(sql); } catch { break; }
  }
});

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
  retention_due_date: '2026-10-15',
  due_date: '2026-10-01',
  notes: 'E2E test',
}) });
if (c3.status === 200 && c3.data?.id) pass('Step 3: CREATE payment_request', `id=${c3.data.id} status=${c3.data.status}`);
else { fail('Step 3: CREATE payment_request', JSON.stringify(c3.data)); }
const prId = c3.data?.id;
const invalidAmount = await api(T, `/api/invoices/${invoiceId}/payment-requests`, { method: 'POST', body: JSON.stringify({ request_no: `PR-BAD-${Date.now()}`, amount: -1 }) });
const overInvoice = await api(T, `/api/invoices/${invoiceId}/payment-requests`, { method: 'POST', body: JSON.stringify({ request_no: `PR-OVER-${Date.now()}`, amount: 600000 }) });
const invalidRetentionDate = await api(T, `/api/invoices/${invoiceId}/payment-requests`, { method: 'POST', body: JSON.stringify({ request_no: `PR-DATE-${Date.now()}`, amount: 1, retention_due_date: '15/10/2026' }) });
const cumulativeOver = await api(T, `/api/invoices/${invoiceId}/payment-requests`, { method: 'POST', body: JSON.stringify({ request_no: `PR-CUM-${Date.now()}`, amount: 1 }) });
if (invalidAmount.status === 400 && overInvoice.status === 422 && invalidRetentionDate.status === 400 && cumulativeOver.status === 422) pass('Payment request guards', `negative=${invalidAmount.status} over=${overInvoice.status} date=${invalidRetentionDate.status} cumulative=${cumulativeOver.status}`);
else fail('Payment request guards', `negative=${invalidAmount.status} over=${overInvoice.status} date=${invalidRetentionDate.status} cumulative=${cumulativeOver.status}`);

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
if (c4.status === 201 && c4.data?.id) pass('Step 4: CREATE payment', `id=${c4.data.id} paid=${c4.data.paid_amount}`);
else fail('Step 4: CREATE payment', JSON.stringify(c4.data));

// Ledger columns (P0-1). The INSERT previously mis-aligned three placeholders:
// contract_no got pr.request_no, vat_amount was hardcoded 0, and due_date was
// never written. due_date is what lib/s-curves.js reads as the planned payment
// event, so the payment S-curve had no planned line for API-created payments.
const contractRow = await api(T, `/api/projects/${PID}/contracts`);
const contractNo = (contractRow.data || []).find((c) => c.id === contractId)?.contract_no;
if (c4.data?.contract_no === contractNo) pass('Payment stores the real contract_no', `${c4.data?.contract_no}`);
else fail('Payment stores the real contract_no', `got=${c4.data?.contract_no} expected=${contractNo}`);
if (Number(c4.data?.vat_amount) === 50000) pass('Payment carries the invoice VAT basis', `vat=${c4.data?.vat_amount}`);
else fail('Payment carries the invoice VAT basis', `vat=${c4.data?.vat_amount}`);
if (String(c4.data?.due_date || '').slice(0, 10) === '2026-10-01') pass('Payment stores due_date (S-curve planned event)', `${c4.data?.due_date}`);
else fail('Payment stores due_date (S-curve planned event)', `due=${c4.data?.due_date}`);

// Verify pr status = PAID
const c4v = await api(T, `/api/payment-requests/${prId}`);
if (c4v.data?.status === 'PAID') pass('Verify pr.status=PAID', `OK`);
else fail('Verify pr.status=PAID', `actual=${c4v.data?.status}`);
if (String(c4v.data?.retention_due_date || '').slice(0, 10) === '2026-10-15') pass('Retention due date survives payment', c4v.data?.retention_due_date);
else fail('Retention due date survives payment', `actual=${c4v.data?.retention_due_date}`);
const release = await api(T, `/api/payment-requests/${prId}/retention/release`, { method: 'POST', body: JSON.stringify({ released_amount: 50000 }) });
if (release.status === 200 && release.data?.retention_status === 'RELEASED') pass('Retention released', `amount=${release.data?.retention_released_amount}`);
else fail('Retention released', `status=${release.status} data=${JSON.stringify(release.data)}`);
const releaseAgain = await api(T, `/api/payment-requests/${prId}/retention/release`, { method: 'POST', body: JSON.stringify({ released_amount: 1 }) });
if (releaseAgain.status === 409) pass('Retention release is one-way', 'status=409');
else fail('Retention release is one-way', `status=${releaseAgain.status}`);

// Use a second contract for the remaining payment edge cases. The first
// contract is fully invoiced (500000 of 500000) and the API now enforces
// "cumulative invoices <= contract total_value", so the edge-case invoice has
// to live on a contract with headroom.
const c2b = await api(T, `/api/projects/${PID}/contracts`, { method: 'POST', body: JSON.stringify({
  contract_no: `CNT-TEST-2-${Date.now()}`,
  contract_name: 'Second contract (edge cases)',
  signed_date: '2026-09-20',
  total_value: 2000000,
}) });
const edgeContractId = c2b.data?.id;
if (c2b.status === 200 && edgeContractId) pass('Second contract for edge cases', `id=${edgeContractId}`);
else fail('Second contract for edge cases', JSON.stringify(c2b.data));
const inv2 = await api(T, `/api/contracts/${edgeContractId}/invoices`, { method: 'POST', body: JSON.stringify({
  invoice_no: `INV-TEST-2-${Date.now()}`,
  invoice_date: '2026-09-20',
  amount: 1000000,
  vat_amount: 0,
}) });
if (inv2.status === 200 && inv2.data?.id) pass('Second invoice for payment edge cases', `id=${inv2.data.id}`);
else fail('Second invoice for payment edge cases', JSON.stringify(inv2.data));
const edgeInvoiceId = inv2.data?.id;

// Financial invariants that were previously missing.
const negInvoice = await api(T, `/api/contracts/${edgeContractId}/invoices`, { method: 'POST', body: JSON.stringify({
  invoice_no: `INV-NEG-${Date.now()}`, invoice_date: '2026-09-20', amount: -500, vat_amount: 0,
}) });
if (negInvoice.status === 400) pass('Negative invoice rejected', `status=${negInvoice.status}`);
else fail('Negative invoice rejected', `status=${negInvoice.status} data=${JSON.stringify(negInvoice.data)}`);
const overContract = await api(T, `/api/contracts/${edgeContractId}/invoices`, { method: 'POST', body: JSON.stringify({
  invoice_no: `INV-OVER-${Date.now()}`, invoice_date: '2026-09-20', amount: 1500000, vat_amount: 0,
}) });
if (overContract.status === 422) pass('Invoice cannot exceed contract value', `status=${overContract.status}`);
else fail('Invoice cannot exceed contract value', `status=${overContract.status} data=${JSON.stringify(overContract.data)}`);
const dupInvoice = await api(T, `/api/contracts/${edgeContractId}/invoices`, { method: 'POST', body: JSON.stringify({
  invoice_no: inv2.data?.invoice_no, invoice_date: '2026-09-20', amount: 1000, vat_amount: 0,
}) });
if (dupInvoice.status === 409) pass('Duplicate invoice_no returns 409', `status=${dupInvoice.status}`);
else fail('Duplicate invoice_no returns 409', `status=${dupInvoice.status} data=${JSON.stringify(dupInvoice.data)}`);

// A request is one installment. A smaller payment must not be recorded as PAID.
const partialPR = await api(T, `/api/invoices/${edgeInvoiceId}/payment-requests`, { method: 'POST', body: JSON.stringify({
  request_no: `PR-PARTIAL-${Date.now()}`,
  amount: 1000,
}) });
await api(T, `/api/payment-requests/${partialPR.data?.id}`, { method: 'PUT', body: JSON.stringify({ status: 'APPROVED' }) });
const partialPay = await api(T, `/api/payment-requests/${partialPR.data?.id}/payments`, { method: 'POST', body: JSON.stringify({ paid_amount: 500 }) });
const partialState = await api(T, `/api/payment-requests/${partialPR.data?.id}`);
if (partialPay.status === 422 && partialState.data?.status === 'APPROVED') {
  pass('Partial payment rejected without PAID transition', `pay=${partialPay.status} status=${partialState.data?.status}`);
} else {
  fail('Partial payment rejected without PAID transition', `pay=${partialPay.status} state=${partialState.data?.status}`);
}

// Test negative: cannot create payment for non-APPROVED pr
const neg1 = await api(T, `/api/invoices/${edgeInvoiceId}/payment-requests`, { method: 'POST', body: JSON.stringify({
  request_no: `PR-NEG-${Date.now()}`,
  amount: 100,
}) });
const neg1Id = neg1.data?.id;
const neg2 = await api(T, `/api/payment-requests/${neg1Id}/payments`, { method: 'POST', body: JSON.stringify({ paid_amount: 100 }) });
if (neg2.status === 422) pass('Negative: cannot pay non-APPROVED pr', `status=422`);
else fail('Negative: cannot pay non-APPROVED pr', `status=${neg2.status} data=${JSON.stringify(neg2.data)}`);

const rejectedPR = await api(T, `/api/invoices/${edgeInvoiceId}/payment-requests`, { method: 'POST', body: JSON.stringify({ request_no: `PR-REJ-${Date.now()}`, amount: 998801 }) });
const rejected = await api(T, `/api/payment-requests/${rejectedPR.data?.id}`, { method: 'PUT', body: JSON.stringify({ status: 'REJECTED' }) });
const reserve = await api(T, `/api/invoices/${edgeInvoiceId}/payment-requests`, { method: 'POST', body: JSON.stringify({ request_no: `PR-RESERVE-${Date.now()}`, amount: 100 }) });
const reactivate = await api(T, `/api/payment-requests/${rejectedPR.data?.id}`, { method: 'PUT', body: JSON.stringify({ status: 'PENDING' }) });
if (rejected.status === 200 && reserve.status === 200 && reactivate.status === 422) pass('Rejected request reactivation respects invoice cap', `reject=${rejected.status} reserve=${reserve.status} reactivate=${reactivate.status}`);
else fail('Rejected request reactivation respects invoice cap', `reject=${rejected.status} reserve=${reserve.status} reactivate=${reactivate.status}`);

// Idempotency-Key: pay 1 PR mới 2 lần cùng key → 1 dòng, lần 2 trả về dòng cũ.
const idemPR = await api(T, `/api/invoices/${edgeInvoiceId}/payment-requests`, { method: 'POST', body: JSON.stringify({
  request_no: `PR-IDEM-${Date.now()}`,
  amount: 200000,
}) });
await api(T, `/api/payment-requests/${idemPR.data?.id}`, { method: 'PUT', body: JSON.stringify({ status: 'APPROVED' }) });
const idemKey = `e2e-${Date.now()}`;
const payOpts = { method: 'POST', headers: { 'Idempotency-Key': idemKey }, body: JSON.stringify({ paid_amount: 200000 }) };
const ip1 = await api(T, `/api/payment-requests/${idemPR.data?.id}/payments`, payOpts);
const ip2 = await api(T, `/api/payment-requests/${idemPR.data?.id}/payments`, payOpts);
if (ip1.status === 201 && ip2.status === 200 && ip1.data?.id === ip2.data?.id) pass('Idempotent replay same row', `id=${ip1.data.id}`);
else fail('Idempotent replay same row', `s1=${ip1.status} s2=${ip2.status} ids=${ip1.data?.id}/${ip2.data?.id}`);

// Distinct keys in parallel: DB guard must let exactly one request win.
const racePR = await api(T, `/api/invoices/${edgeInvoiceId}/payment-requests`, { method: 'POST', body: JSON.stringify({ request_no: `PR-RACE-${Date.now()}`, amount: 300000 }) });
await api(T, `/api/payment-requests/${racePR.data?.id}`, { method: 'PUT', body: JSON.stringify({ status: 'APPROVED' }) });
const racePayments = await Promise.all([
  api(T, `/api/payment-requests/${racePR.data?.id}/payments`, { method: 'POST', headers: { 'Idempotency-Key': `race-a-${Date.now()}` }, body: JSON.stringify({ paid_amount: 300000 }) }),
  api(T, `/api/payment-requests/${racePR.data?.id}/payments`, { method: 'POST', headers: { 'Idempotency-Key': `race-b-${Date.now()}` }, body: JSON.stringify({ paid_amount: 300000 }) }),
]);
const raceStatuses = racePayments.map((r) => r.status).sort((a, b) => a - b);
const raceRows = psqlQuery(`SELECT COUNT(*) FROM payments WHERE payment_request_id = ${racePR.data?.id};`).trim();
if (raceStatuses[0] === 201 && raceStatuses[1] === 409 && raceRows === '1') pass('Concurrent pay creates one row', `statuses=${raceStatuses.join('/')} rows=${raceRows}`);
else fail('Concurrent pay creates one row', `statuses=${raceStatuses.join('/')} rows=${raceRows}`);

const directPaid = await api(T, `/api/payment-requests/${prId}`, { method: 'PUT', body: JSON.stringify({ status: 'PAID' }) });
if (directPaid.status === 422) pass('Direct PAID transition blocked', 'status=422');
else fail('Direct PAID transition blocked', `status=${directPaid.status}`);

console.log('\n=== Material submittal SLA (TVGS 3 days) ===');

// Create a submittal
const m1 = await api(T, '/api/material-submittals', { method: 'POST', body: JSON.stringify({
  project_id: PID,
  submittal_code: `SUB-TEST-${Date.now()}`,
  sla_days: 7,
}) });
if (m1.status === 201 && m1.data?.id) pass('Create material_submittal', `id=${m1.data.id} v=${m1.data.revision_number}`);
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
  for (const sql of CLEANUP_SQL) run(sql);
  pass('cleanup throwaway project', `id=${PID}`);
} catch (e) { fail('cleanup throwaway project', e.message.slice(0, 120)); }

const passed = log.filter(l => l.ok).length;
console.log(`\n=== ${passed}/${log.length} PASS ===\n`);
process.exit(log.length - passed);
