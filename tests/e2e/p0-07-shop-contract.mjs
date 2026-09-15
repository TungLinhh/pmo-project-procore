// P0-07: shop transition contract (to_status/comment) + no double-JSON-stringify.
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/p0-07-shop-contract.mjs
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

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

  // zones for project 1
  const zones = await fetch(BASE + '/api/projects/1/zones', { headers: H }).then(r => r.json());
  const zoneId = zones[0]?.id;
  ok(zoneId, `zone available (id=${zoneId})`);

  // full approval chain with NEW contract
  const code = `P0-07-${Date.now()}`;
  const created = await post('/api/shop-drawings', { project_id: 1, zone_id: zoneId, drawing_code: code });
  ok(created.s === 200 && created.j.status === 'DRAFT', `create → DRAFT (got ${created.s}/${created.j.status})`);
  const id = created.j.id;
  const sub = await post(`/api/shop-drawings/${id}/transition`, { to_status: 'SUBMITTED', comment: 'gui duyet' });
  ok(sub.s === 200 && sub.j.status === 'SUBMITTED', `transition to SUBMITTED (got ${sub.s}/${sub.j.status})`);
  const app = await post(`/api/shop-drawings/${id}/transition`, { to_status: 'APPROVED', comment: 'ok' });
  ok(app.s === 200 && app.j.status === 'APPROVED', `transition to APPROVED (got ${app.s}/${app.j.status})`);

  // legacy alias payload still accepted (backward compat)
  const code2 = `P0-07B-${Date.now()}`;
  const c2 = await post('/api/shop-drawings', { project_id: 1, zone_id: zoneId, drawing_code: code2 });
  const legacy = await post(`/api/shop-drawings/${c2.j.id}/transition`, { new_status: 'SUBMITTED', reason: 'old client' });
  ok(legacy.s === 200 && legacy.j.status === 'SUBMITTED', `legacy {new_status,reason} accepted (got ${legacy.s})`);

  // daily.create fields survive (no double-stringify): weather_am must round-trip.
  // Use a throwaway project so the (project_id, report_date) unique key never collides on reruns.
  const tmpProj = await post('/api/projects', { code: `P0-07-D-${Date.now()}` });
  ok(tmpProj.s === 201, `throwaway project created (got ${tmpProj.s})`);
  const dr = await post(`/api/projects/${tmpProj.j.id}/daily-reports`, { report_date: '2026-09-06', weather_am: 'Nang nhe', weather_pm: 'Mua' });
  ok(dr.s === 200 && dr.j.weather_am === 'Nang nhe', `daily weather_am round-trips (got ${dr.j.weather_am})`);
  const mp = await post(`/api/daily-reports/${dr.j.id}/manpower`, { role_code: 'P0-07', headcount: 5 });
  ok(mp.s === 200 && mp.j.headcount === 5, `manpower headcount round-trips (got ${mp.j?.headcount})`);

  // frontend source no longer pre-stringifies (static guard)
  const api = readFileSync('frontend/src/api/index.js', 'utf8');
  ok(api.includes('to_status: newStatus'), 'shopApi.transition sends to_status');
  ok(!api.includes('JSON.stringify(data)') && !api.includes('JSON.stringify({ reason })'), 'no pre-stringified bodies');

  // cleanup throwaways (P0-07* live on real project 1)
  const { execSync: _exec } = await import('node:child_process');
  const _run = (sql) => _exec(`bash backend/scripts/pg-ctl.sh psql -c "${sql}"`, { encoding: 'utf8', cwd: new URL('../..', import.meta.url).pathname });
  _run(`DELETE FROM shop_drawings WHERE drawing_code LIKE 'P0-07%';`);
  const _tmpId = (typeof tmpProj !== 'undefined' && tmpProj.j?.id) || null;
  if (_tmpId) {
    _run(`DELETE FROM daily_manpower WHERE daily_report_id IN (SELECT id FROM daily_reports WHERE project_id = ${_tmpId});`);
    _run(`DELETE FROM daily_reports WHERE project_id = ${_tmpId};`);
    _run(`DELETE FROM project_members WHERE project_id = ${_tmpId};`);
    _run(`DELETE FROM projects WHERE id = ${_tmpId};`);
  }
  ok(true, 'throwaways cleaned');
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
