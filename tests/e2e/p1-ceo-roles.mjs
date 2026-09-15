// P1-2: real CEO (role=pmo + is_ceo=1) passes requireRole('ceo',...) guards;
// plain PMO does not. Covers PR approve + project close guards.
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/p1-ceo-roles.mjs
import { spawn } from 'node:child_process';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3107';
const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3107' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 3500));

try {
  const loginAs = async (email) => fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'admin123' }) }).then(r => r.json()).then(j => j.token);
  const adminT = await loginAs('admin@hbg.com');
  const ceoT = await loginAs('ceo@hbg.com');
  const pmoT = await loginAs('pmo@hbg.com');
  ok(!!ceoT && !!pmoT, 'ceo + pmo logins');
  const H = (t) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });
  const post = (t, p, b) => fetch(BASE + p, { method: 'POST', headers: H(t), body: JSON.stringify(b) }).then(async r => ({ s: r.status, j: await r.json() }));

  const proj = await post(adminT, '/api/projects', { code: `P1-CEO-${Date.now()}` });
  const c = await post(adminT, `/api/projects/${proj.j.id}/contracts`, { contract_no: `C-${Date.now()}`, total_value: 1000 });
  const inv = await post(adminT, `/api/contracts/${c.j.id}/invoices`, { invoice_no: `INV-${Date.now()}`, amount: 500 });
  const pr = await post(adminT, `/api/invoices/${inv.j.id}/payment-requests`, { request_no: `PR-${Date.now()}`, amount: 500 });

  // CEO approves (was 403 before is_ceo mapping)
  const app = await fetch(BASE + `/api/payment-requests/${pr.j.id}`, { method: 'PUT', headers: H(ceoT), body: JSON.stringify({ status: 'APPROVED' }) }).then(async r => ({ s: r.status, j: await r.json() }));
  ok(app.s === 200 && app.j.status === 'APPROVED', `CEO approves PR (got ${app.s}/${app.j.status || app.j.error})`);

  // plain PMO cannot
  const pr2 = await post(adminT, `/api/invoices/${inv.j.id}/payment-requests`, { request_no: `PR2-${Date.now()}`, amount: 100 });
  const denied = await fetch(BASE + `/api/payment-requests/${pr2.j.id}`, { method: 'PUT', headers: H(pmoT), body: JSON.stringify({ status: 'APPROVED' }) }).then(r => r.status);
  ok(denied === 403, `plain PMO denied approve (got ${denied})`);

  // CEO can close project (route exists; columns may 500 until P1-3 — accept 200 or 500-with-column-error, not 403)
  const close = await post(ceoT, `/api/projects/${proj.j.id}/close`, { reason: 'test' });
  ok(close.s !== 403 && close.s !== 401, `CEO passes close guard (got ${close.s})`);

  const { getDb } = await import('../../backend/src/db/index.js');
  const db = getDb();
  await db.prepare('DELETE FROM payment_requests WHERE invoice_id = ?').runAsync(inv.j.id);
  await db.prepare('DELETE FROM invoices WHERE contract_id = ?').runAsync(c.j.id);
  await db.prepare('DELETE FROM contracts WHERE id = ?').runAsync(c.j.id);
  await db.prepare('DELETE FROM projects WHERE id = ?').runAsync(proj.j.id);
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
