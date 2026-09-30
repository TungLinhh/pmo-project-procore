// PDPL E2E (task 10, Luat BVDL ca nhan): consents, export, DSR ERASE,
// admin duyet + an danh hoa, guard role, audit day du. Chay tren user rac
// tu tao (copy hash admin123), finally xoa sach (audit -> requests ->
// consents -> user, do FK audit_log.user_id RESTRICT).
import { psqlQuery, apiBase } from '../tools/env.mjs';

const BASE = apiBase();
let pass = 0, fail = 0;
const ok = (name, detail) => { pass++; console.log(`  PASS — ${name}: ${detail}`); };
const ng = (name, detail) => { fail++; console.log(`  FAIL — ${name}: ${detail}`); };

async function api(path, opts = {}) {
  const r = await fetch(BASE + path, opts);
  const t = await r.text();
  let data; try { data = JSON.parse(t); } catch { data = t; }
  return { status: r.status, data };
}
const J = (body, token) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});
const exec = (sql) => psqlQuery(sql).split('\n')[0];

const stamp = Date.now();
const email = `pdpl-t10-${stamp}@hbg.com`;
let uid = null;
try {
  const admin = await api('/api/auth/login', J({ email: 'admin@hbg.com', password: 'admin123' }));
  const A = admin.data?.token;
  if (!A) { ng('login', 'admin no token'); process.exit(1); }
  ok('login', 'admin@hbg.com');
  const AH = { Authorization: `Bearer ${A}` };

  // 0. User rac (copy hash de login duoc admin123).
  uid = Number(exec(`INSERT INTO users (tenant_id, email, name, role, password_hash) SELECT tenant_id, '${email}', 'PDPL T10', 'site', password_hash FROM users WHERE email = 'admin@hbg.com' RETURNING id`));
  if (!uid) { ng('seed user', 'no id'); process.exit(1); }
  ok('seed user', `id=${uid}`);
  const u = await api('/api/auth/login', J({ email, password: 'admin123' }));
  const T = u.data?.token;
  if (!T) { ng('login', 'throwaway no token'); process.exit(1); }
  ok('login', 'throwaway');
  const H = { Authorization: `Bearer ${T}` };

  // 1. GET privacy: policy + 3 muc dich, account bat buoc.
  const p = await api('/api/me/privacy', { headers: H });
  (p.status === 200 && p.data?.policy_version === '2026-09-v1' && (p.data?.purposes || []).length === 3
    ? ok : ng)('privacy get', `purposes=${(p.data?.purposes || []).length}`);
  const acc = (p.data?.purposes || []).find((x) => x.purpose === 'account');
  (acc?.granted === true && acc?.required === true ? ok : ng)('account consent', 'bat buoc + granted');

  // 2. Rut notify -> tat kenh; cap lai -> mo email.
  const w = await api('/api/me/privacy/consents', J({ purpose: 'notify', granted: false }, T));
  (w.status === 200 ? ok : ng)('consent withdraw', `status=${w.status}`);
  const ne = exec(`SELECT notify_email FROM users WHERE id = ${uid}`);
  (ne === 'f' ? ok : ng)('withdraw coupling', `notify_email=${ne}`);
  const g = await api('/api/me/privacy/consents', J({ purpose: 'notify', granted: true }, T));
  (g.status === 200 && exec(`SELECT notify_email FROM users WHERE id = ${uid}`) === 't' ? ok : ng)('consent grant', 'mo lai email');
  const bad = await api('/api/me/privacy/consents', J({ purpose: 'account', granted: false }, T));
  (bad.status === 422 ? ok : ng)('account immutable', `status=${bad.status}`);

  // 3. Export + tu hieu chinh ten.
  const ex = await api('/api/me/privacy/export', { headers: H });
  (ex.status === 200 && ex.data?.user?.email === email && Array.isArray(ex.data?.consents) && ex.data?.exported_at
    ? ok : ng)('export', 'email + consents + timestamp');
  ((!JSON.stringify(ex.data).includes('password_hash') && !JSON.stringify(ex.data).includes('mfa_secret')
    ? ok : ng)('export no secrets', 'khong lo hash/secret'));
  const rn = await api('/api/me/privacy/profile', { method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'PDPL Renamed' }) });
  (rn.status === 200 && rn.data?.name === 'PDPL Renamed' ? ok : ng)('rectify name', `status=${rn.status}`);
  const badName = await api('/api/me/privacy/profile', { method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '' }) });
  (badName.status === 400 ? ok : ng)('rectify guard', `status=${badName.status}`);

  // 4. Tao ERASE -> admin queue -> duyet -> an danh.
  const er = await api('/api/me/privacy/requests', J({ type: 'ERASE', detail: 'test cleanup' }, T));
  const rid = er.data?.id;
  (er.status === 201 && rid ? ok : ng)('dsr create', `id=${rid}`);
  const badType = await api('/api/me/privacy/requests', J({ type: 'NOPE' }, T));
  (badType.status === 400 ? ok : ng)('dsr type guard', `status=${badType.status}`);
  const q = await api('/api/admin/dsr?status=PENDING', { headers: AH });
  (q.status === 200 && (q.data?.requests || []).some((r) => r.id === rid) ? ok : ng)('dsr queue', `pending=${q.data?.pending}`);
  // Guard: role thuong (site tu tao, DB hien tai chi seed admin) -> 403.
  const gid = Number(exec(`INSERT INTO users (tenant_id, email, name, role, password_hash) SELECT tenant_id, 'pdpl-guard-${stamp}@hbg.com', 'Guard', 'site', password_hash FROM users WHERE email = 'admin@hbg.com' RETURNING id`));
  const glogin = await api('/api/auth/login', J({ email: `pdpl-guard-${stamp}@hbg.com`, password: 'admin123' }));
  const q403 = await api('/api/admin/dsr', { headers: { Authorization: `Bearer ${glogin.data?.token}` } });
  (q403.status === 403 ? ok : ng)('dsr guard', `site -> ${q403.status}`);
  exec(`DELETE FROM users WHERE id = ${gid}`);
  const done = await api(`/api/admin/dsr/${rid}/resolve`, J({ decision: 'DONE', note: 'test approve' }, A));
  (done.status === 200 && done.data?.status === 'DONE' ? ok : ng)('dsr resolve', `status=${done.status}`);
  const anon = exec(`SELECT email FROM users WHERE id = ${uid}`);
  (anon === `deleted-${uid}@invalid.local` ? ok : ng)('anonymize', anon);
  const relogin = await api('/api/auth/login', J({ email, password: 'admin123' }));
  (relogin.status === 401 ? ok : ng)('login dead', `status=${relogin.status}`);

  // 5. Audit day du.
  const au = Number(exec(`SELECT COUNT(*) FROM audit_log WHERE user_id = ${uid} AND action IN ('CONSENT_WITHDRAW','DSR_CREATE')`));
  const ar = Number(exec(`SELECT COUNT(*) FROM audit_log WHERE resource_type = 'pdpl_request' AND resource_id = ${rid} AND action = 'DSR_RESOLVE'`));
  ((au >= 1 && ar === 1) ? ok : ng)('audit trail', `user-actions=${au}, resolve=${ar}`);

  // 6. Don rac (thu tu do FK RESTRICT + audit resolve dung user admin).
  exec(`DELETE FROM audit_log WHERE user_id = ${uid}`);
  exec(`DELETE FROM audit_log WHERE resource_type = 'pdpl_request' AND resource_id = ${rid}`);
  exec(`DELETE FROM pdpl_requests WHERE user_id = ${uid}`);
  exec(`DELETE FROM pdpl_consents WHERE user_id = ${uid}`);
  exec(`DELETE FROM users WHERE id = ${uid}`);
  (exec(`SELECT COUNT(*) FROM users WHERE id = ${uid}`) === '0' ? ok : ng)('cleanup', `user ${uid} removed`);
  uid = null;
} catch (e) {
  ng('exception', e.message);
  if (uid) {
    try {
      exec(`DELETE FROM audit_log WHERE user_id = ${uid}`);
      exec(`DELETE FROM pdpl_requests WHERE user_id = ${uid}`);
      exec(`DELETE FROM pdpl_consents WHERE user_id = ${uid}`);
      exec(`DELETE FROM users WHERE id = ${uid}`);
    } catch { /* best effort */ }
  }
}

console.log(fail ? `\n${fail} FAILURE(S)` : '\nALL PASS');
process.exit(fail ? 1 : 0);
