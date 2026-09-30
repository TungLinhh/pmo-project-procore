// Schedule links (v0.6.0 Phase 0): CRUD validation, cycle rejection,
// cross-project 404, auto-chain preview + confirm. Self-cleaning (PILOT only).
// Run: node tests/e2e/schedule-links.mjs (spawns its own server, needs dev DB)
import { waitForServer } from './lib.mjs';
import { spawn } from 'node:child_process';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3111';
const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3111' }, stdio: 'ignore' });
await waitForServer(BASE);

try {
  const loginAs = async (email) => fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'admin123' }) }).then(r => r.json()).then(j => j.token);
  const T = await loginAs('admin@pilot.test');
  ok(!!T, 'pilot admin login');
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${T}` };
  const call = (m, p, b) => fetch(BASE + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined }).then(async r => ({ s: r.status, j: await r.json().catch(() => null) }));

  const { getDb } = await import('../../backend/src/db/index.js');
  const db = getDb();
  const pilot = await db.prepare(`SELECT id FROM projects WHERE code = 'PILOT-001'`).getAsync();
  const hbgItem = await db.prepare(`SELECT id FROM construction_schedule_items WHERE project_id = 1 ORDER BY id LIMIT 1`).getAsync();
  // Clean slate: remove pilot links created by earlier runs/manual probes.
  await db.prepare('DELETE FROM schedule_links WHERE project_id = ?').runAsync(pilot.id);

  const items = await db.prepare('SELECT id FROM construction_schedule_items WHERE project_id = ? ORDER BY id').allAsync(pilot.id);
  const [a, b, c] = items.map((i) => i.id);

  // 1. create FS link
  const r1 = await call('POST', `/api/projects/${pilot.id}/schedule-links`, { predecessor_id: a, successor_id: b });
  ok(r1.s === 201 && r1.j.link_type === 'FS', `create FS link (got ${r1.s})`);
  // 2. duplicate → 422
  const r2 = await call('POST', `/api/projects/${pilot.id}/schedule-links`, { predecessor_id: a, successor_id: b });
  ok(r2.s === 422, `duplicate → 422 (got ${r2.s})`);
  // 3. reverse edge → cycle 422 with path
  const r3 = await call('POST', `/api/projects/${pilot.id}/schedule-links`, { predecessor_id: b, successor_id: a });
  ok(r3.s === 422 && Array.isArray(r3.j.cycle), `reverse → cycle 422 with path (got ${r3.s})`);
  // 4. self-link → 422
  const r4 = await call('POST', `/api/projects/${pilot.id}/schedule-links`, { predecessor_id: a, successor_id: a });
  ok(r4.s === 422, `self-link → 422 (got ${r4.s})`);
  // 5. bad type → 422
  const r5 = await call('POST', `/api/projects/${pilot.id}/schedule-links`, { predecessor_id: b, successor_id: c, link_type: 'XX' });
  ok(r5.s === 422, `bad type → 422 (got ${r5.s})`);
  // 6. cross-project end → 404
  const r6 = await call('POST', `/api/projects/${pilot.id}/schedule-links`, { predecessor_id: a, successor_id: hbgItem.id });
  ok(r6.s === 404, `cross-project end → 404 (got ${r6.s})`);
  // 7. list shows the 1 link with names
  const r7 = await call('GET', `/api/projects/${pilot.id}/schedule-links`);
  ok(r7.s === 200 && r7.j.length === 1 && !!r7.j[0].pred_name, `list 1 link with names (got ${r7.s}/${r7.j?.length})`);
  // 8. SS link allowed (non-FS types work)
  const r8 = await call('POST', `/api/projects/${pilot.id}/schedule-links`, { predecessor_id: b, successor_id: c, link_type: 'SS', lag_days: 2 });
  ok(r8.s === 201, `SS+lag link (got ${r8.s})`);
  // 9. delete
  const r9 = await call('DELETE', `/api/schedule-links/${r8.j.id}`);
  ok(r9.s === 200, `delete (got ${r9.s})`);
  const r9b = await call('DELETE', `/api/schedule-links/${r8.j.id}`);
  ok(r9b.s === 404, `re-delete → 404 (got ${r9b.s})`);
  // 10. auto-chain preview is honest (no writes)
  await db.prepare('DELETE FROM schedule_links WHERE project_id = ?').runAsync(pilot.id);
  const r10 = await call('POST', `/api/projects/${pilot.id}/schedule-links/auto-chain`, {});
  ok(r10.s === 200 && r10.j.confirm_required === true && r10.j.proposed.length >= 1, `auto-chain preview, no write (got ${r10.s}/${r10.j?.proposed?.length})`);
  const afterPreview = await db.prepare('SELECT COUNT(*)::int AS n FROM schedule_links WHERE project_id = ?').getAsync(pilot.id);
  ok(afterPreview.n === 0, 'preview wrote nothing');
  // 11. auto-chain confirm writes exactly the proposed set
  const r11 = await call('POST', `/api/projects/${pilot.id}/schedule-links/auto-chain`, { confirm: true });
  ok(r11.s === 201 && r11.j.created === r10.j.proposed.length, `auto-chain confirm creates ${r11.j?.created} (got ${r11.s})`);

  // cleanup: leave pilot as seeded (links from auto-chain are legit demo graph)
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
