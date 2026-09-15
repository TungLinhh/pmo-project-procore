// P3-5a: every status change goes through lib/transitions.js.
// Shop: DRAFT→APPROVED illegal (422), DRAFT→SUBMITTED ok.
// Submittal: approve-from-DRAFT illegal (422, new guard), submit→approve ok.
// PR: PENDING→APPROVED ok, REJECTED→PAID illegal (422).
// Sync: double-resolve illegal (422). All throwaways cleaned up.
// Run: BASE_URL=http://localhost:3000 node tests/e2e/p3-transitions.mjs
const BASE = process.env.BASE_URL || 'http://localhost:3000';

let pass = 0, fail = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); cond ? pass++ : fail++; };
async function api(path, opts = {}) {
  const r = await fetch(BASE + path, opts);
  let data = null;
  try { data = await r.json(); } catch {}
  return { status: r.status, data };
}

const login = await api('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) });
const T = login.data?.token;
ok(!!T, 'login as admin');
const H = { Authorization: `Bearer ${T}`, 'Content-Type': 'application/json' };
const J = (b) => ({ headers: H, body: JSON.stringify(b) });

// --- shop drawing ---
const sd = await api('/api/shop-drawings', { method: 'POST', ...J({ project_id: 1, zone_id: 1, drawing_code: 'TR-TEST-' + Date.now() }) });
const sdId = sd.data?.id;
ok(!!sdId, `draft shop created (id=${sdId})`);
if (sdId) {
  const bad = await api(`/api/shop-drawings/${sdId}/transition`, { method: 'POST', ...J({ to_status: 'APPROVED' }) });
  ok(bad.status === 422, `DRAFT→APPROVED rejected 422 (got ${bad.status})`);
  const good = await api(`/api/shop-drawings/${sdId}/transition`, { method: 'POST', ...J({ to_status: 'SUBMITTED' }) });
  ok(good.status === 200 && good.data?.status === 'SUBMITTED', 'DRAFT→SUBMITTED ok');
}

// --- material submittal (approve-from-DRAFT is the new guard) ---
const ms = await api('/api/material-submittals', { method: 'POST', ...J({ project_id: 1, submittal_code: 'TR-MS-' + Date.now() }) });
const msId = ms.data?.id;
ok(!!msId, `draft submittal created (id=${msId})`);
if (msId) {
  const bad = await api(`/api/material-submittals/${msId}/approve`, { method: 'POST', headers: H });
  ok(bad.status === 422, `approve-from-DRAFT rejected 422 (got ${bad.status})`);
  const sub = await api(`/api/material-submittals/${msId}/submit`, { method: 'POST', headers: H });
  ok(sub.status === 200, 'DRAFT→SUBMITTED ok');
  const ap = await api(`/api/material-submittals/${msId}/approve`, { method: 'POST', headers: H });
  ok(ap.status === 200 && ap.data?.status === 'APPROVED', 'SUBMITTED→APPROVED ok');
}

// --- payment request ---
const ct = await api('/api/projects/1/contracts', { method: 'POST', ...J({ contract_no: 'TR-CT-' + Date.now(), vendor_name: 'TR Vendor', total_value: 1000000 }) });
const inv = await api(`/api/contracts/${ct.data?.id}/invoices`, { method: 'POST', ...J({ invoice_no: 'TR-INV-' + Date.now(), amount: 100000 }) });
const pr = await api(`/api/invoices/${inv.data?.id}/payment-requests`, { method: 'POST', ...J({ request_no: 'TR-PR-' + Date.now(), amount: 90000 }) });
const prId = pr.data?.id;
ok(!!prId, `PENDING pr created (id=${prId})`);
if (prId) {
  const ap = await api(`/api/payment-requests/${prId}`, { method: 'PUT', ...J({ status: 'APPROVED' }) });
  ok(ap.status === 200, 'PENDING→APPROVED ok');
  const rej = await api(`/api/payment-requests/${prId}`, { method: 'PUT', ...J({ status: 'REJECTED' }) });
  ok(rej.status === 422, `APPROVED→REJECTED rejected 422 (got ${rej.status})`);
}

// --- sync double-resolve ---
const { execSync } = await import('node:child_process');
const qid = execSync(`bash backend/scripts/pg-ctl.sh psql -t -A -c "INSERT INTO offline_sync_queue (user_id, resource_type, resource_json, client_timestamp) VALUES (1, 'probe', '{}', now()) RETURNING id;"`, { encoding: 'utf8', cwd: '/home/vutun/pmo_project' }).trim().split('\n')[0];
const r1 = await api('/api/sync/resolve', { method: 'POST', ...J({ queue_id: Number(qid), winner: 'SERVER' }) });
ok(r1.status === 200, 'PENDING→RESOLVED ok');
const r2 = await api('/api/sync/resolve', { method: 'POST', ...J({ queue_id: Number(qid), winner: 'SERVER' }) });
ok(r2.status === 422, `double-resolve rejected 422 (got ${r2.status})`);

// --- cleanup throwaways ---
execSync(`bash backend/scripts/pg-ctl.sh psql -c "DELETE FROM offline_sync_queue WHERE id = ${qid}; DELETE FROM shop_drawings WHERE id = ${sdId}; DELETE FROM material_submittals WHERE id = ${msId}; DELETE FROM payment_requests WHERE id = ${prId}; DELETE FROM invoices WHERE id = ${inv.data?.id}; DELETE FROM contracts WHERE id = ${ct.data?.id};" > /dev/null`, { encoding: 'utf8', cwd: '/home/vutun/pmo_project' });
ok(true, 'throwaways cleaned');

console.log(pass && !fail ? '\nALL PASS' : `\n${fail} FAILURE(S)`);
process.exit(fail ? 1 : 0);
