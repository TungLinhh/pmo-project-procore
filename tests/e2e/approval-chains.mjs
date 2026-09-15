// Wave 2: departments + per-department approval chains.
// Admin users list (no hash) → default 2-level chain (L1 PM, L2 ADMIN) →
// direct APPROVED blocked (422) → PM passes L1, PM blocked at L2 (403) →
// ADMIN passes L2 → APPROVED → approval-state shows chain → cleanup.
// Run: BASE_URL=http://localhost:3000 node tests/e2e/approval-chains.mjs
const BASE = process.env.BASE_URL || 'http://localhost:3000';

let pass = 0, fail = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); cond ? pass++ : fail++; };
async function api(path, opts = {}) {
  const r = await fetch(BASE + path, opts);
  let data = null;
  try { data = await r.json(); } catch {}
  return { status: r.status, data };
}
const loginAs = async (email) => (await api('/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: 'admin123' }),
})).data?.token;

const adminT = await loginAs('admin@hbg.com');
const pmT = await loginAs('pm@hbg.com');
ok(!!adminT && !!pmT, 'login admin + pm');
const AH = { Authorization: `Bearer ${adminT}`, 'Content-Type': 'application/json' };
const PH = { Authorization: `Bearer ${pmT}`, 'Content-Type': 'application/json' };
const J = (H, b) => ({ headers: H, body: JSON.stringify(b) });

// 1. users list has no secret
const users = await api('/api/admin/users', { headers: AH });
ok(Array.isArray(users.data) && users.data.length >= 7, `admin users list (${users.data?.length})`);
ok(users.data.every(u => !('password_hash' in u)), 'no password_hash leaked');
const pmDenied = await api('/api/admin/users', { headers: PH });
ok(pmDenied.status === 403, `pm blocked from /admin (${pmDenied.status})`);

// 2. invalid chain rejected
const badChain = await api('/api/approval-chains', { method: 'POST', ...J(AH, {
  resource_type: 'shop_drawing', levels: [{ level: 1, role: 'KING' }],
}) });
ok(badChain.status === 400, `bad role rejected 400 (got ${badChain.status})`);
const badRes = await api('/api/approval-chains', { method: 'POST', ...J(AH, {
  resource_type: 'teleport', levels: [{ level: 1, role: 'PM' }],
}) });
ok(badRes.status === 400, `bad resource rejected 400 (got ${badRes.status})`);
const badDept = await api('/api/approval-chains', { method: 'POST', ...J(AH, {
  department_id: 999999999, resource_type: 'shop_drawing', levels: [{ level: 1, role: 'PM' }],
}) });
ok(badDept.status === 404, `unknown dept rejected 404 (got ${badDept.status})`);
const tooMany = await api('/api/approval-chains', { method: 'POST', ...J(AH, {
  resource_type: 'shop_drawing', levels: [1, 2, 3, 4, 5, 6].map(i => ({ level: i, role: 'PM' })),
}) });
ok(tooMany.status === 400, `6 levels rejected 400 (got ${tooMany.status})`);
const pmWrite = await api('/api/approval-chains', { method: 'POST', ...J(PH, {
  resource_type: 'shop_drawing', levels: [{ level: 1, role: 'PM' }],
}) });
ok(pmWrite.status === 403, `pm cannot write chains 403 (got ${pmWrite.status})`);

// 3. default 2-level chain
const chain = await api('/api/approval-chains', { method: 'POST', ...J(AH, {
  resource_type: 'shop_drawing',
  levels: [{ level: 1, role: 'PM', label: 'Trưởng dự án' }, { level: 2, role: 'ADMIN', label: 'Ban TGĐ' }],
}) });
ok(chain.status === 200 && chain.data?.levels?.length === 2, 'default 2-level chain saved');
const chainId = chain.data?.id;

// 4. drawing under chain: shortcut blocked, level flow works with roles
const sd = await api('/api/shop-drawings', { method: 'POST', ...J(AH, { project_id: 1, zone_id: 1, drawing_code: 'CH-TEST-' + Date.now() }) });
const sdId = sd.data?.id;
await api(`/api/shop-drawings/${sdId}/transition`, { method: 'POST', ...J(AH, { to_status: 'SUBMITTED' }) });
const shortcut = await api(`/api/shop-drawings/${sdId}/transition`, { method: 'POST', ...J(AH, { to_status: 'APPROVED' }) });
ok(shortcut.status === 422, `direct APPROVED blocked under chain (${shortcut.status})`);
const l2early = await api(`/api/shop-drawings/${sdId}/approve-level`, { method: 'POST', ...J(AH, { level: 2, response: 'P' }) });
ok(l2early.status === 409, `L2 before L1 blocked 409 (${l2early.status})`);
const l1pm = await api(`/api/shop-drawings/${sdId}/approve-level`, { method: 'POST', ...J(PH, { level: 1, response: 'P', comment: 'PM ok' }) });
ok(l1pm.status === 200 && l1pm.data?.status === 'SUBMITTED', 'PM passes L1 (stays SUBMITTED)');
const l2pm = await api(`/api/shop-drawings/${sdId}/approve-level`, { method: 'POST', ...J(PH, { level: 2, response: 'P' }) });
ok(l2pm.status === 403, `PM blocked at L2 ADMIN (403, got ${l2pm.status})`);
const l2admin = await api(`/api/shop-drawings/${sdId}/approve-level`, { method: 'POST', ...J(AH, { level: 2, response: 'P' }) });
ok(l2admin.status === 200 && l2admin.data?.status === 'APPROVED', 'ADMIN passes L2 → APPROVED');
const state = await api(`/api/shop-drawings/${sdId}/approval-state`, { headers: AH });
ok(state.data?.chain?.length === 2 && state.data?.is_fully_approved === true, 'approval-state shows chain + fully approved');

// 5. cleanup: drawing + chain (back to legacy)
const { execSync } = await import('node:child_process');
execSync(`bash backend/scripts/pg-ctl.sh psql -c "DELETE FROM shop_drawings WHERE id = ${sdId};" > /dev/null`, { encoding: 'utf8', cwd: '/home/vutun/pmo_project' });
const del = await api(`/api/approval-chains/${chainId}`, { method: 'DELETE', headers: AH });
ok(del.status === 200, 'chain deleted (legacy restored)');

// 6. department override: project → KT, 1-level KT chain → shortcut allowed
const depts = await api('/api/master-data/departments', { headers: AH });
const kt = (depts.data || []).find(d => d.code === 'KT');
ok(!!kt, `KT department seeded (id=${kt?.id})`);
if (kt) {
  const pj = await api('/api/projects/1', { method: 'PATCH', ...J(AH, { department_id: kt.id }) });
  ok(pj.status === 200 && pj.data?.department_id === kt.id, 'project assigned to KT');
  const ktChain = await api('/api/approval-chains', { method: 'POST', ...J(AH, {
    department_id: kt.id, resource_type: 'shop_drawing',
    levels: [{ level: 1, role: 'PM', label: 'Trưởng BP' }],
  }) });
  ok(ktChain.status === 200, 'KT 1-level chain saved');
  const sd2 = await api('/api/shop-drawings', { method: 'POST', ...J(AH, { project_id: 1, zone_id: 1, drawing_code: 'CH-DEPT-' + Date.now() }) });
  await api(`/api/shop-drawings/${sd2.data?.id}/transition`, { method: 'POST', ...J(AH, { to_status: 'SUBMITTED' }) });
  const cut = await api(`/api/shop-drawings/${sd2.data?.id}/transition`, { method: 'POST', ...J(AH, { to_status: 'APPROVED' }) });
  ok(cut.status === 200, `1-level dept chain allows shortcut (${cut.status})`);
  await api('/api/projects/1', { method: 'PATCH', ...J(AH, { department_id: null }) });
  await api(`/api/approval-chains/${ktChain.data?.id}`, { method: 'DELETE', headers: AH });
  execSync(`bash backend/scripts/pg-ctl.sh psql -c "DELETE FROM shop_drawings WHERE id = ${sd2.data?.id};" > /dev/null`, { encoding: 'utf8', cwd: '/home/vutun/pmo_project' });
  ok(true, 'dept override cleaned');
}

console.log(pass && !fail ? '\nALL PASS' : `\n${fail} FAILURE(S)`);
process.exit(fail ? 1 : 0);
