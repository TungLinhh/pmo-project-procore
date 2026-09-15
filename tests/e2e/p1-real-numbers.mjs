// P1-5: numbers are real — manpower rollup shape, daily counts written on commit,
// no invented constants left in ControlCenter/Manpower. Real PG (+server for rollup).
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/p1-real-numbers.mjs
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
  const H = { Authorization: `Bearer ${token}` };

  // 1. manpower rollup returns real rows (Manpower tab source)
  const roll = await fetch(BASE + '/api/manpower/rollup', { headers: H }).then(r => r.json());
  ok(Array.isArray(roll.rows), `rollup shape {rows} (got ${typeof roll.rows}, n=${roll.rows?.length})`);

  // 2. daily commit writes counts (FieldHome reads these)
  const { commit } = await import('../../backend/src/services/ingest/daily_report.js');
  const { getDb } = await import('../../backend/src/db/index.js');
  const db = getDb();
  const proj = await db.prepare(`INSERT INTO projects (tenant_id, code, name_vi) VALUES (1, 'P1-NUM-${Date.now()}', 'x') RETURNING id`).getAsync();
  await commit({ sheets: [{ sheet: 's', report_date: '2026-09-11', prepared_by: null,
    work_items: [{ ordinal: 1, name_vi: 'w1' }, { ordinal: 2, name_vi: 'w2' }],
    materials: [], manpower: [{ role_name: 'Team X', today_qty: 3 }], acceptance: [] }] }, proj.id);
  const dr = await db.prepare('SELECT work_items_count, manpower_count, materials_count FROM daily_reports WHERE project_id = ?').getAsync(proj.id);
  ok(dr && Number(dr.work_items_count) === 2 && Number(dr.manpower_count) === 1, `counts written (got w=${dr?.work_items_count} mp=${dr?.manpower_count})`);

  // 3. no invented constants in dashboard sources
  const cc = readFileSync('frontend/src/hq/ControlCenter.jsx', 'utf8');
  ok(!cc.includes('plannedPct = 78') && !cc.includes('Synced 2 phút') && !/value: 89/.test(cc) && !cc.includes('C20 ngày 23.5.2021'), 'ControlCenter free of invented numbers');
  const mp = readFileSync('frontend/src/hq/Manpower.jsx', 'utf8');
  ok(!mp.includes('Cẩu tháp Potain') && !mp.includes('Thợ điện') && mp.includes('manpower.rollup'), 'Manpower free of demo arrays, uses rollup');

  await db.prepare('DELETE FROM daily_work_items WHERE daily_report_id IN (SELECT id FROM daily_reports WHERE project_id = ?)').runAsync(proj.id);
  await db.prepare('DELETE FROM daily_manpower WHERE daily_report_id IN (SELECT id FROM daily_reports WHERE project_id = ?)').runAsync(proj.id);
  await db.prepare('DELETE FROM daily_reports WHERE project_id = ?').runAsync(proj.id);
  await db.prepare('DELETE FROM projects WHERE id = ?').runAsync(proj.id);
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
