// P1-1: GET /api/contracts/:id/invoices exists (Payment tab loads invoices per
// contract; used to 404 → invoices silently empty). Real PG + server.
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/p1-invoices-endpoint.mjs
import { spawn } from 'node:child_process';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3107';
const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3107' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 3500));

try {
  const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) });
  const { token } = await login.json();
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const post = (p, b) => fetch(BASE + p, { method: 'POST', headers: H, body: JSON.stringify(b) }).then(async r => ({ s: r.status, j: await r.json() }));

  const proj = await post('/api/projects', { code: `P1-INV-${Date.now()}` });
  const c = await post(`/api/projects/${proj.j.id}/contracts`, { contract_no: `C-${Date.now()}`, total_value: 1000 });
  ok(c.s === 200, `contract created (got ${c.s})`);
  const inv = await post(`/api/contracts/${c.j.id}/invoices`, { invoice_no: `INV-${Date.now()}`, amount: 500 });
  ok(inv.s === 200, `invoice created (got ${inv.s})`);

  const list = await fetch(BASE + `/api/contracts/${c.j.id}/invoices`, { headers: H }).then(async r => ({ s: r.status, j: await r.json() }));
  ok(list.s === 200 && Array.isArray(list.j) && list.j.some(i => i.id === inv.j.id), `GET invoices lists created invoice (got ${list.s}/${list.j.length})`);

  const empty = await fetch(BASE + '/api/contracts/999999/invoices', { headers: H }).then(async r => ({ s: r.status, j: await r.json() }));
  ok(empty.s === 200 && Array.isArray(empty.j) && empty.j.length === 0, 'unknown contract → [] not 404');

  const { getDb } = await import('../../backend/src/db/index.js');
  const db = getDb();
  await db.prepare('DELETE FROM invoices WHERE contract_id = ?').runAsync(c.j.id);
  await db.prepare('DELETE FROM contracts WHERE id = ?').runAsync(c.j.id);
  await db.prepare('DELETE FROM projects WHERE id = ?').runAsync(proj.j.id);
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
