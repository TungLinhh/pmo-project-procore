// Directive default notify: POST /api/directives without notify_to_user_ids notifies
// every PM/PMO user (used to notify NOBODY — the form hardcoded []). Real PG + server.
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/directive-notify-default.mjs
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

  const tag = `DIR-TEST-${Date.now()}`;
  // 1. no notify list at all → default PM/PMO
  const r1 = await post('/api/directives', { project_id: 1, body: tag });
  ok(r1.s === 200 && r1.j.id, `directive created (got ${r1.s})`);

  // notifyMany is async-fire-and-forget — poll briefly
  const { getDb } = await import('../../backend/src/db/index.js');
  const db = getDb();
  let found = [];
  for (let i = 0; i < 20 && found.length < 3; i++) {
    await new Promise(r => setTimeout(r, 250));
    found = await db.prepare(`SELECT user_id FROM notifications WHERE resource_type = 'directive' AND resource_id = ?`).allAsync(r1.j.id);
  }
  const got = found.map(f => Number(f.user_id)).sort((a, b) => a - b);
  ok(JSON.stringify(got) === JSON.stringify([2, 3, 4]), `PM/PMO notified by default (got user_ids [${got}])`);

  // 2. explicit empty array (old hardcoded client) → same default, not nobody
  const r2 = await post('/api/directives', { project_id: 1, body: `${tag}-EMPTY`, notify_to_user_ids: [] });
  let found2 = [];
  for (let i = 0; i < 20 && found2.length < 3; i++) {
    await new Promise(r => setTimeout(r, 250));
    found2 = await db.prepare(`SELECT user_id FROM notifications WHERE resource_type = 'directive' AND resource_id = ?`).allAsync(r2.j.id);
  }
  ok(found2.length === 3, `explicit [] also falls back to default (got ${found2.length})`);

  // 3. explicit list still respected
  const r3 = await post('/api/directives', { project_id: 1, body: `${tag}-ONE`, notify_to_user_ids: [3] });
  await new Promise(r => setTimeout(r, 1000));
  const found3 = await db.prepare(`SELECT user_id FROM notifications WHERE resource_type = 'directive' AND resource_id = ?`).allAsync(r3.j.id);
  ok(found3.length === 1 && Number(found3[0].user_id) === 3, 'explicit list respected');

  // 4. recipients endpoint lists pm/pmo first
  const rec = await fetch(BASE + '/api/directives/recipients', { headers: H }).then(r => r.json());
  ok(Array.isArray(rec) && rec.length >= 3 && ['pm', 'pmo'].includes(String(rec[0].role).toLowerCase()), `recipients endpoint (got ${rec.length} users)`);

  // cleanup
  for (const d of [r1.j, r2.j, r3.j]) {
    if (!d?.id) continue;
    await db.prepare(`DELETE FROM notifications WHERE resource_type = 'directive' AND resource_id = ?`).runAsync(d.id);
    await db.prepare('DELETE FROM directives WHERE id = ?').runAsync(d.id);
  }
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
