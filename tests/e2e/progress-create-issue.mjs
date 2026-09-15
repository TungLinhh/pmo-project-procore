// Progress create-issue: POST /api/projects/:id/issues works WITHOUT project_id in body
// (used to 400 'project_id and title required' every time) + schedule-source prefill persists.
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/progress-create-issue.mjs
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
  const createdIds = [];

  // 1. the reported bug: body has title but no project_id → must succeed via URL :id
  const t = `ISS-${Date.now()}`;
  const r1 = await post('/api/projects/1/issues', { title: t, category: 'PROGRESS', severity: 'MEDIUM' });
  ok(r1.s === 200 && r1.j.project_id === 1 && r1.j.title === t, `no-body-project_id → 200, project pinned to URL (got ${r1.s}/${r1.j.project_id}/${r1.j.error || 'ok'})`);
  if (r1.j.id) createdIds.push(r1.j.id);

  // 2. drill-down prefill shape: source_resource/source_id/zone_id persist
  const zones = await fetch(BASE + '/api/projects/1/zones', { headers: H }).then(r => r.json());
  const r2 = await post('/api/projects/1/issues', {
    title: `PREFILL-${Date.now()}`, body: 'from schedule drill-down',
    category: 'PROGRESS', severity: 'HIGH',
    source_resource: 'schedule', source_id: 123, zone_id: zones[0]?.id || null,
  });
  ok(r2.s === 200 && r2.j.source_resource === 'schedule' && Number(r2.j.source_id) === 123, `prefill source persisted (got ${r2.j.source_resource}:${r2.j.source_id})`);
  if (r2.j.id) createdIds.push(r2.j.id);

  // 3. title still required (validation not gutted)
  const r3 = await post('/api/projects/1/issues', { body: 'no title' });
  ok(r3.s === 400, `missing title still 400 (got ${r3.s})`);

  // cleanup (issues router has no DELETE — remove test rows directly)
  const { getDb } = await import('../../backend/src/db/index.js');
  const db = getDb();
  for (const id of createdIds) await db.prepare('DELETE FROM issues WHERE id = ?').runAsync(id);
  const left = await db.prepare(`SELECT COUNT(*) as c FROM issues WHERE title LIKE 'ISS-%' OR title LIKE 'PREFILL-%'`).getAsync();
  ok(Number(left.c) === 0, 'test issues cleaned up');
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
