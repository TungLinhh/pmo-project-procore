// P2-12: permission middleware enforced — role/action matrix on real routes.
// admin bypass; PM writes own project; PMO cannot write schedule; SITE cannot
// read master-data; unauthenticated 401 everywhere. Real PG + server.
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/p2-authz-matrix.mjs
import { spawn } from 'node:child_process';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3107';
const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3107' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 3500));

try {
  const loginAs = async (email) => fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'admin123' }) }).then(r => r.json()).then(j => j.token);
  const T = {};
  for (const e of ['admin@hbg.com', 'pm@hbg.com', 'pmo@hbg.com', 'site@hbg.com']) T[e] = await loginAs(e);
  const H = (t) => ({ 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) });
  const call = (t, m, p, b) => fetch(BASE + p, { method: m, headers: H(t), body: b ? JSON.stringify(b) : undefined }).then(r => r.status);

  // unauthenticated
  ok((await call(null, 'GET', '/api/projects/1/construction-schedule')) === 401, 'no token → 401');

  // admin bypass
  ok((await call(T['admin@hbg.com'], 'GET', '/api/master-data/vendors')) === 200, 'admin bypasses matrix');

  // PM writes own project (member via backfill)
  const sched = await fetch(BASE + '/api/projects/1/construction-schedule?limit=1', { headers: H(T['pm@hbg.com']) }).then(async r => ({ s: r.status, j: await r.json() }));
  ok(sched.s === 200, `PM reads own project schedule (got ${sched.s})`);
  const item = sched.j?.[0];
  const pw = await call(T['pm@hbg.com'], 'PATCH', `/api/projects/1/construction-schedule/${item.id}`, { progress_pct: item.progress_pct ?? 0 });
  ok(pw === 200, `PM writes own schedule (got ${pw})`);

  // PMO cannot write schedule (matrix write=false) but can read + write directives
  const pmoW = await call(T['pmo@hbg.com'], 'PATCH', `/api/projects/1/construction-schedule/${item.id}`, { progress_pct: 0.1 });
  ok(pmoW === 403, `PMO denied schedule write (got ${pmoW})`);
  const pmoR = await call(T['pmo@hbg.com'], 'GET', '/api/projects/1/construction-schedule?limit=1');
  ok(pmoR === 200, 'PMO reads schedule');
  const pmoD = await fetch(BASE + '/api/directives', { method: 'POST', headers: H(T['pmo@hbg.com']), body: JSON.stringify({ project_id: 1, body: 'matrix test directive' }) }).then(async r => ({ s: r.status, j: await r.json() }));
  ok(pmoD.s === 200, `PMO writes directive (got ${pmoD.s})`);

  // SITE cannot read master-data, cannot write payment-adjacent, can write schedule (member)
  ok((await call(T['site@hbg.com'], 'GET', '/api/master-data/vendors')) === 403, 'SITE denied master-data read');
  ok((await call(T['site@hbg.com'], 'PATCH', `/api/projects/1/construction-schedule/${item.id}`, { progress_pct: 0.2 })) === 200, 'SITE writes assigned schedule');
  // SITE cannot approve payments
  const pr = await fetch(BASE + '/api/projects/1/payment-requests?limit=1', { headers: H(T['admin@hbg.com']) }).then(r => r.json());
  if (pr?.[0]) {
    const denied = await call(T['site@hbg.com'], 'PUT', `/api/payment-requests/${pr[0].id}`, { status: 'APPROVED' });
    ok(denied === 403, 'SITE denied payment approve');
  } else ok(true, 'no PR to test approve guard (skipped)');

  // cleanup directive
  if (pmoD.j?.id) {
    const { getDb } = await import('../../backend/src/db/index.js');
    const db = getDb();
    await db.prepare(`DELETE FROM notifications WHERE resource_type = 'directive' AND resource_id = ?`).runAsync(pmoD.j.id);
    await db.prepare('DELETE FROM directives WHERE id = ?').runAsync(pmoD.j.id);
  }
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
