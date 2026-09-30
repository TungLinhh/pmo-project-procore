// CEO reads/controls and closes projects but does not enter payment data.
// PM approves an assigned payment request; an unassigned site user gets 404.
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/p1-ceo-roles.mjs
import { waitForServer } from './lib.mjs';
import { spawn } from 'node:child_process';
import { cleanupProjectsOnExit } from './lib-cleanup.mjs';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3107';
const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3107' }, stdio: 'ignore' });
await waitForServer(BASE);


// Dọn dự án thử nghiệm nếu bài dừng giữa chừng — xem `lib-cleanup.mjs`.
cleanupProjectsOnExit(['P1-CEO-%'], { label: 'p1-ceo-roles' });
try {
  const loginAs = async (email) => fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'admin123' }) }).then(r => r.json()).then(j => j.token);
  const adminT = await loginAs('admin@hbg.com');
  const ceoT = await loginAs('ceo@hbg.com');
  const pmT = await loginAs('pm@hbg.com');
  const siteT = await loginAs('site@hbg.com');
  ok(!!ceoT && !!pmT && !!siteT, 'ceo + pm + site logins');
  const H = (t) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });
  const post = (t, p, b) => fetch(BASE + p, { method: 'POST', headers: H(t), body: JSON.stringify(b) }).then(async r => ({ s: r.status, j: await r.json() }));

  const proj = await post(pmT, '/api/projects', { code: `P1-CEO-${Date.now()}` });
  const c = await post(adminT, `/api/projects/${proj.j.id}/contracts`, { contract_no: `C-${Date.now()}`, total_value: 1000 });
  const inv = await post(adminT, `/api/contracts/${c.j.id}/invoices`, { invoice_no: `INV-${Date.now()}`, amount: 500 });
  const pr = await post(adminT, `/api/invoices/${inv.j.id}/payment-requests`, { request_no: `PR-${Date.now()}`, amount: 500 });

  const ceoPayment = await fetch(BASE + `/api/payment-requests/${pr.j.id}`, { method: 'PUT', headers: H(ceoT), body: JSON.stringify({ status: 'APPROVED' }) });
  ok(ceoPayment.status === 403, `CEO cannot enter payment approval (got ${ceoPayment.status})`);

  const app = await fetch(BASE + `/api/payment-requests/${pr.j.id}`, { method: 'PUT', headers: H(pmT), body: JSON.stringify({ status: 'APPROVED' }) }).then(async r => ({ s: r.status, j: await r.json() }));
  ok(app.s === 200 && app.j.status === 'APPROVED', `PM approves assigned PR (got ${app.s}/${app.j.status || app.j.error})`);

  const sitePayment = await fetch(BASE + `/api/payment-requests/${pr.j.id}`, { method: 'PUT', headers: H(siteT), body: JSON.stringify({ status: 'REJECTED' }) });
  ok(sitePayment.status === 404, `unassigned site user cannot see PR (got ${sitePayment.status})`);

  const close = await post(ceoT, `/api/projects/${proj.j.id}/close`, { reason: 'test' });
  ok(close.s === 200, `CEO closes project (got ${close.s}/${close.j?.error || ''})`);

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
