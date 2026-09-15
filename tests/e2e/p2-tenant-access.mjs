// P2-11: tenant + project isolation — membership gate, cross-tenant 404 (not 403,
// no existence leak), creator auto-member. Real PG + server.
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/p2-tenant-access.mjs
import { spawn } from 'node:child_process';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3107';
const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3107' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 3500));

try {
  const loginAs = async (email) => fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'admin123' }) }).then(r => r.json()).then(j => j.token);
  const siteT = await loginAs('site@hbg.com');
  const adminT = await loginAs('admin@hbg.com');
  const H = (t) => ({ Authorization: `Bearer ${t}` });
  const get = (t, p) => fetch(BASE + p, { headers: H(t) }).then(async r => ({ s: r.status, j: await r.json().catch(() => null) }));

  const { getDb } = await import('../../backend/src/db/index.js');
  const db = getDb();
  const site = await db.prepare(`SELECT id, tenant_id FROM users WHERE email = 'site@hbg.com'`).getAsync();

  // 1. member reads own project
  const r1 = await get(siteT, '/api/projects/1/construction-schedule?limit=1');
  ok(r1.s === 200, `member reads project data (got ${r1.s})`);

  // 2. membership revoked → 404 (not 403, no leak); admin bypass still works
  await db.prepare('DELETE FROM project_members WHERE project_id = 1 AND user_id = ?').runAsync(site.id);
  const r2 = await get(siteT, '/api/projects/1/construction-schedule?limit=1');
  ok(r2.s === 404, `non-member gets 404 (got ${r2.s})`);
  const r2b = await get(adminT, '/api/projects/1/construction-schedule?limit=1');
  ok(r2b.s === 200, 'admin bypasses membership');
  await db.prepare('INSERT INTO project_members (project_id, user_id) VALUES (1, ?) ON CONFLICT DO NOTHING RETURNING project_id').runAsync(site.id);
  const r2c = await get(siteT, '/api/projects/1/construction-schedule?limit=1');
  ok(r2c.s === 200, 'membership restored → 200');

  // 3. cross-tenant project invisible + unguessable
  // NOTE: INSERT via runAsync (sequence auto-repair lives there, not in getAsync).
  const t2ins = await db.prepare(`INSERT INTO tenants (code, name) VALUES ('T2-${Date.now()}', 'x') RETURNING id`).runAsync();
  const t2 = { id: Number(t2ins.lastInsertRowid) };
  const p2 = await db.prepare('INSERT INTO projects (tenant_id, code, name_vi) VALUES (?, ?, ?) RETURNING id').getAsync(t2.id, `X-${Date.now()}`, 'x');
  const z2 = await db.prepare('INSERT INTO zones (project_id, code, name_en) VALUES (?, ?, ?) RETURNING id').getAsync(p2.id, 'ZX', 'zx');
  await db.prepare('INSERT INTO construction_schedule_items (project_id, zone_id, source_sheet, ordinal, name_vi, status) VALUES (?, ?, ?, ?, ?, ?)').runAsync(p2.id, z2.id, 's', 1, 'secret task', 'PENDING');
  const r3 = await get(siteT, `/api/projects/${p2.id}/construction-schedule?limit=1`);
  ok(r3.s === 404, `cross-tenant read → 404 (got ${r3.s})`);
  const r3b = await get(siteT, `/api/projects/${p2.id}/issues`);
  ok(r3b.s === 404, 'cross-tenant issues → 404');
  const r3c = await fetch(BASE + `/api/projects/${p2.id}/issues`, { method: 'POST', headers: { ...H(siteT), 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'sneak' }) }).then(r => r.status);
  ok(r3c === 404, 'cross-tenant write → 404');

  // 4. creator auto-member of new project
  const created = await fetch(BASE + '/api/projects', { method: 'POST', headers: { ...H(siteT), 'Content-Type': 'application/json' }, body: JSON.stringify({ code: `SITE-NEW-${Date.now()}` }) }).then(async r => ({ s: r.status, j: await r.json() }));
  ok(created.s === 201, `site creates project (got ${created.s})`);
  const r4 = await get(siteT, `/api/projects/${created.j.id}/construction-schedule?limit=1`);
  ok(r4.s === 200, 'creator reads own new project');

  // cleanup
  await db.prepare('DELETE FROM construction_schedule_items WHERE project_id = ?').runAsync(p2.id);
  await db.prepare('DELETE FROM zones WHERE project_id = ?').runAsync(p2.id);
  await db.prepare('DELETE FROM project_members WHERE project_id = ?').runAsync(p2.id);
  await db.prepare('DELETE FROM projects WHERE id = ?').runAsync(p2.id);
  await db.prepare('DELETE FROM tenants WHERE id = ?').runAsync(t2.id);
  await db.prepare('DELETE FROM project_members WHERE project_id = ?').runAsync(created.j.id);
  await db.prepare('DELETE FROM projects WHERE id = ?').runAsync(created.j.id);
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
