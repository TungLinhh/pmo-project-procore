// Password rotation e2e (Wave 2 A2): self-change, wrong-old 401, weak 400,
// admin reset → gate → change → login works, version bump kills old token.
// Scratch HBG user, fully cleaned in finally.
// Run: node tests/e2e/password-rotation.mjs (spawns its own server, needs dev DB)
import { spawn } from 'node:child_process';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3115';
const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3115' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 3500));

const EMAIL = `pwtest-${Date.now()}@hbg.com`;
let uid = null;
try {
  const login = (email, pw) => fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pw }) }).then(async r => ({ s: r.status, j: await r.json().catch(() => null) }));
  const adminT = await login('admin@hbg.com', 'admin123').then((r) => r.j.token);
  ok(!!adminT, 'admin login');
  const H = (t) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });
  const call = (t, m, p, b) => fetch(BASE + p, { method: m, headers: H(t), body: b ? JSON.stringify(b) : undefined }).then(async r => ({ s: r.status, j: await r.json().catch(() => null) }));

  const { getDb } = await import('../../backend/src/db/index.js');
  const db = getDb();
  const hbg = await db.prepare(`SELECT id FROM tenants WHERE code = 'hbg'`).getAsync();
  const bcrypt = (await import('bcryptjs')).default;
  const ins = await db.prepare(
    `INSERT INTO users (tenant_id, email, name, role, password_hash) VALUES (?, ?, 'PW Test', 'pm', ?) RETURNING id`
  ).runAsync(hbg.id, EMAIL, await bcrypt.hash('initial-pw-1', 10));
  uid = Number(ins.lastInsertRowid);
  await db.prepare('INSERT INTO project_members (project_id, user_id) VALUES (1, ?) ON CONFLICT DO NOTHING RETURNING project_id').runAsync(uid);

  // 1. Self-change happy path.
  const t0 = await login(EMAIL, 'initial-pw-1');
  ok(t0.s === 200 && !!t0.j.token, 'scratch login');
  const c1 = await call(t0.j.token, 'POST', '/api/me/password', { old_password: 'initial-pw-1', new_password: 'changed-pw-22' });
  ok(c1.s === 200, `change ok (got ${c1.s})`);
  const oldDead = await login(EMAIL, 'initial-pw-1');
  ok(oldDead.s === 401, 'old password dead');
  const newWorks = await login(EMAIL, 'changed-pw-22');
  ok(newWorks.s === 200, 'new password works');
  // 2. Old token died with the version bump.
  const staleUse = await call(t0.j.token, 'GET', '/api/me');
  ok(staleUse.s === 401, `pre-change token dead (got ${staleUse.s})`);
  // 3. Wrong old → 401, weak → 400.
  const t1 = newWorks.j.token;
  const c2 = await call(t1, 'POST', '/api/me/password', { old_password: 'nope', new_password: 'another-pw-33' });
  ok(c2.s === 401, `wrong old → 401 (got ${c2.s})`);
  const c3 = await call(t1, 'POST', '/api/me/password', { old_password: 'changed-pw-22', new_password: 'short' });
  ok(c3.s === 400, `weak → 400 (got ${c3.s})`);
  // 4. Admin reset → temp works, gate blocks everything but change.
  const rs = await call(adminT, 'POST', `/api/admin/users/${uid}/reset-password`);
  ok(rs.s === 200 && typeof rs.j.temp_password === 'string' && rs.j.temp_password.length >= 8, 'reset returns one-time temp');
  const temp = rs.j.temp_password;
  const gated = await login(EMAIL, temp);
  ok(gated.s === 403 && gated.j.must_change_password === true && !!gated.j.token, `reset login gates with token (got ${gated.s})`);
  const blocked = await call(gated.j.token, 'GET', '/api/projects/1/construction-schedule?limit=1');
  ok(blocked.s === 403, `gated token blocked elsewhere (got ${blocked.s})`);
  const allowedMe = await call(gated.j.token, 'GET', '/api/me');
  ok(allowedMe.s === 200, 'gated token can read /api/me');
  const chg = await call(gated.j.token, 'POST', '/api/me/password', { old_password: temp, new_password: 'final-pw-444' });
  ok(chg.s === 200, 'change with temp works');
  const finalLogin = await login(EMAIL, 'final-pw-444');
  ok(finalLogin.s === 200 && finalLogin.j.must_change_password !== true, 'gate lifted after change');
  const sched = await call(finalLogin.j.token, 'GET', '/api/projects/1/construction-schedule?limit=1');
  ok(sched.s === 200, 'endpoints work after change');
  // 5. Cross-tenant reset 404s (pilot admin target).
  const pilotAdmin = await db.prepare(`SELECT id FROM users WHERE email = 'admin@pilot.test'`).getAsync();
  const x = await call(adminT, 'POST', `/api/admin/users/${pilotAdmin.id}/reset-password`);
  ok(x.s === 404, `cross-tenant reset → 404 (got ${x.s})`);
} finally {
  if (uid) {
    const { getDb } = await import('../../backend/src/db/index.js');
    const db = getDb();
    await db.prepare('DELETE FROM project_members WHERE user_id = ?').runAsync(uid).catch(() => {});
    await db.prepare('DELETE FROM auth_refresh_tokens WHERE user_id = ?').runAsync(uid).catch(() => {});
    await db.prepare('DELETE FROM audit_log WHERE user_id = ?').runAsync(uid).catch(() => {});
    await db.prepare('DELETE FROM users WHERE id = ?').runAsync(uid).catch(() => {});
  }
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
