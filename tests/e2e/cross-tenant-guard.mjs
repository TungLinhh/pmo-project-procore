// Cross-tenant guard (Phase A+B verification): RLS + API 404s + plan gates.
// - HBG admin ⇄ PILOT tenant are mutually invisible (404, no leak).
// - PILOT (plan=small) lacks ar-read/chains/bulk-import/audit-export/portfolio;
//   gated APIs answer 403; HBG (enterprise) passes.
// - RLS direct: SET app.current_tenant filters at the DB layer (defense in depth).
// - Pooled connections never leak a tenant (RESET on release).
// - Explicit members API: add/remove works; cross-tenant add 404s.
// Requires: dev DB migrated (0005-0007) + PILOT tenant provisioned
//   (node backend/scripts/provision-tenant.mjs --code PILOT --plan small ...).
// Run: node tests/e2e/cross-tenant-guard.mjs
import { waitForServer } from './lib.mjs';
import { spawn } from 'node:child_process';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3109';
const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3109' }, stdio: 'ignore' });
await waitForServer(BASE);

try {
  const loginAs = async (email) => fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'admin123' }) }).then(r => r.json()).then(j => j.token);
  const hbgT = await loginAs('admin@hbg.com');
  const pilotT = await loginAs('admin@pilot.test');
  ok(!!hbgT && !!pilotT, 'both tenant admins login');
  const H = (t) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });
  const get = (t, p) => fetch(BASE + p, { headers: H(t) }).then(async r => ({ s: r.status, j: await r.json().catch(() => null) }));

  const { getDb, getPool } = await import('../../backend/src/db/index.js');
  const db = getDb();
  const hbg = await db.prepare(`SELECT id, tenant_id FROM projects WHERE tenant_id = (SELECT id FROM tenants WHERE code = 'hbg') ORDER BY id LIMIT 1`).getAsync();
  const pilot = await db.prepare(`SELECT id, tenant_id FROM projects WHERE tenant_id = (SELECT id FROM tenants WHERE code = 'PILOT') ORDER BY id LIMIT 1`).getAsync();
  ok(!!hbg && !!pilot && hbg.tenant_id !== pilot.tenant_id, `HBG project #${hbg?.id} vs PILOT project #${pilot?.id}`);

  // 1. Mutual invisibility at the API layer (404, not 403/200)
  const x1 = await get(pilotT, `/api/projects/${hbg.id}/construction-schedule?limit=1`);
  ok(x1.s === 404, `pilot → HBG schedule = 404 (got ${x1.s})`);
  const x2 = await get(hbgT, `/api/projects/${pilot.id}/construction-schedule?limit=1`);
  ok(x2.s === 404, `HBG → pilot schedule = 404 (got ${x2.s})`);
  const x3 = await get(pilotT, `/api/projects/${hbg.id}/issues`);
  ok(x3.s === 404, `pilot → HBG issues = 404 (got ${x3.s})`);
  const x4 = await fetch(BASE + `/api/projects/${hbg.id}/issues`, { method: 'POST', headers: H(pilotT), body: JSON.stringify({ title: 'sneak' }) }).then(r => r.status);
  ok(x4 === 404, `pilot → HBG write = 404 (got ${x4})`);

  // 2. Own-tenant reads still work
  const o1 = await get(pilotT, `/api/projects/${pilot.id}/construction-schedule?limit=1`);
  ok(o1.s === 200, `pilot reads own project (got ${o1.s})`);
  const o2 = await get(hbgT, `/api/projects/${hbg.id}/construction-schedule?limit=1`);
  ok(o2.s === 200, `HBG reads own project (got ${o2.s})`);

  // 3. Plan entitlements
  const entPilot = await get(pilotT, '/api/me/entitlements');
  ok(entPilot.j?.plan === 'small', `pilot plan=small (got ${entPilot.j?.plan})`);
  for (const f of ['ar-read', 'chains', 'bulk-import', 'audit-export', 'portfolio']) {
    ok(!entPilot.j.features.includes(f), `small lacks '${f}'`);
  }
  ok(entPilot.j.features.includes('p4-ap'), 'small keeps p4-ap (payments in Small)');
  const entHbg = await get(hbgT, '/api/me/entitlements');
  ok(entHbg.j?.plan === 'enterprise', `HBG plan=enterprise (got ${entHbg.j?.plan})`);

  // 4. Plan gates enforced (403), enterprise passes
  const g1 = await get(pilotT, `/api/projects/${pilot.id}/ar-contracts`);
  ok(g1.s === 403, `small → AR = 403 (got ${g1.s})`);
  const g2 = await get(hbgT, `/api/projects/${hbg.id}/ar-contracts`);
  ok(g2.s === 200, `enterprise → AR = 200 (got ${g2.s})`);
  const g3 = await fetch(BASE + '/api/approval-chains', { method: 'POST', headers: H(pilotT), body: JSON.stringify({ resource_type: 'shop', levels: [{ level: 1, role: 'PM' }] }) }).then(r => r.status);
  ok(g3 === 403, `small → chains write = 403 (got ${g3})`);
  const g4 = await get(pilotT, '/api/dashboard/portfolio-kpi');
  ok(g4.s === 403, `small → portfolio-kpi = 403 (got ${g4.s})`);
  const g5 = await get(hbgT, '/api/dashboard/portfolio-kpi');
  ok(g5.s === 200, `enterprise → portfolio-kpi = 200 (got ${g5.s})`);

  // 5. RLS at the DB layer (raw client, bypasses app checks)
  const pool = getPool();
  const c = await pool.connect();
  try {
    const all = await c.query('SELECT count(*)::int AS n FROM projects').then(r => r.rows[0].n);
    await c.query(`SET app.current_tenant = '${pilot.tenant_id}'`);
    const onlyPilot = await c.query('SELECT id FROM projects').then(r => r.rows.map(r => r.id));
    ok(onlyPilot.length === 1 && onlyPilot[0] === pilot.id, `RLS tenant=pilot sees only #${pilot.id} (saw ${JSON.stringify(onlyPilot)})`);
    const childLeak = await c.query('SELECT count(*)::int AS n FROM construction_schedule_items WHERE project_id = $1', [hbg.id]).then(r => r.rows[0].n);
    ok(childLeak === 0, `RLS hides HBG child rows from pilot GUC (saw ${childLeak})`);
    await c.query(`SET app.current_tenant = '${hbg.tenant_id}'`);
    const onlyHbg = await c.query('SELECT id FROM projects').then(r => r.rows.map(r => r.id));
    ok(onlyHbg.includes(hbg.id) && !onlyHbg.includes(pilot.id), 'RLS tenant=hbg hides pilot project');
    await c.query('RESET app.current_tenant');
    const back = await c.query('SELECT count(*)::int AS n FROM projects').then(r => r.rows[0].n);
    ok(back === all, 'RESET restores full visibility (hatch, for migrations/seeds)');
  } finally {
    try { await c.query('RESET app.current_tenant'); } catch {}
    c.release();
  }

  // 6. No GUC leak across pooled connections after authed traffic
  const leakCheck = await db.prepare('SELECT count(*)::int AS n FROM projects').getAsync();
  const total = await getPool().connect().then(async (cc) => {
    try { return await cc.query('SELECT count(*)::int AS n FROM projects').then(r => r.rows[0].n); }
    finally { cc.release(); }
  });
  ok(leakCheck.n === total && total >= 3, `pool clean after requests (sees ${total} projects, no tenant filter stuck)`);

  // 7. Explicit members API (add/remove round-trip; cross-tenant add 404s)
  const siteHbg = await db.prepare(`SELECT id FROM users WHERE email = 'site@hbg.com'`).getAsync();
  const m1 = await fetch(BASE + `/api/projects/${pilot.id}/members`, { method: 'POST', headers: H(pilotT), body: JSON.stringify({ user_id: siteHbg.id }) }).then(r => r.status);
  ok(m1 === 404, `cross-tenant member add = 404 (got ${m1})`);
  const pilotAdmin = await db.prepare(`SELECT id FROM users WHERE email = 'admin@pilot.test'`).getAsync();
  // remove + re-add own admin (round-trip; ends in original state)
  const m2 = await fetch(BASE + `/api/projects/${pilot.id}/members/${pilotAdmin.id}`, { method: 'DELETE', headers: H(pilotT) }).then(r => r.status);
  ok(m2 === 200, `member remove = 200 (got ${m2})`);
  const m3 = await fetch(BASE + `/api/projects/${pilot.id}/members`, { method: 'POST', headers: H(pilotT), body: JSON.stringify({ user_id: pilotAdmin.id }) }).then(r => r.status);
  ok(m3 === 201, `member re-add = 201 (got ${m3})`);
  const m4 = await get(pilotT, `/api/projects/${pilot.id}/members`);
  ok(m4.s === 200 && m4.j.some((m) => m.id === pilotAdmin.id), 'members list contains pilot admin');
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
