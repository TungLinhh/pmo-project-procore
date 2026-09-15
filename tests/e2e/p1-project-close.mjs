// P1-3: project close/revoke-close round-trip works (columns exist, guard passes for CEO).
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/p1-project-close.mjs
import { spawn } from 'node:child_process';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3107';
const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3107' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 3500));

try {
  const loginAs = async (email) => fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'admin123' }) }).then(r => r.json()).then(j => j.token);
  const ceoT = await loginAs('ceo@hbg.com');
  const siteT = await loginAs('site@hbg.com');
  const H = (t) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });
  const post = (t, p, b) => fetch(BASE + p, { method: 'POST', headers: H(t), body: JSON.stringify(b) }).then(async r => ({ s: r.status, j: await r.json() }));

  const adminT = await loginAs('admin@hbg.com');
  const proj = await post(adminT, '/api/projects', { code: `P1-CLOSE-${Date.now()}` });

  const denied = await post(siteT, `/api/projects/${proj.j.id}/close`, { reason: 'x' });
  ok(denied.s === 404, `site (non-member) gets 404, no leak (got ${denied.s})`);
  // member but wrong role → informative 403 (existence already known to members)
  const memberDenied = await post(siteT, '/api/projects/1/close', { reason: 'x' });
  ok(memberDenied.s === 403, `site member denied close with 403 (got ${memberDenied.s})`);

  const closed = await post(ceoT, `/api/projects/${proj.j.id}/close`, { reason: 'test close' });
  ok(closed.s === 200 && closed.j.status === 'CLOSED', `close works (got ${closed.s}/${closed.j.status})`);

  const double = await post(ceoT, `/api/projects/${proj.j.id}/close`, { reason: 'again' });
  ok(double.s === 409, `double close → 409 (got ${double.s})`);

  const revoked = await post(ceoT, `/api/projects/${proj.j.id}/revoke-close`, {});
  ok(revoked.s === 200 && revoked.j.status !== 'CLOSED', `revoke-close works (got ${revoked.s}/${revoked.j.status})`);

  const { getDb } = await import('../../backend/src/db/index.js');
  const db = getDb();
  await db.prepare('DELETE FROM projects WHERE id = ?').runAsync(proj.j.id);
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
