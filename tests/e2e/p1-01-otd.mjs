// P1-01: OTD endpoint uses real schema columns (plan_end_date/actual_end_date), no 500, math correct.
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/p1-01-otd.mjs
import { spawn, execSync } from 'node:child_process';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3201';
const PSQL = 'PGPASSWORD=pmo_dev_pwd /home/linuxbrew/.linuxbrew/bin/psql -h 127.0.0.1 -p 5433 -U pmo_user -d pmo -t -A';
const psql = (sql) => execSync(`${PSQL} -c "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();

const code = `P1-01-${Date.now()}`;
psql(`INSERT INTO projects (tenant_id, code, name_vi) VALUES (1, '${code}', 'otd test') ON CONFLICT DO NOTHING;`);
const pid = psql(`SELECT id FROM projects WHERE tenant_id=1 AND code='${code}';`);
const zid = psql(`INSERT INTO zones (project_id, code, name_en) VALUES (${pid}, 'OTD', 'otd') RETURNING id;`).split('\n')[0];
// 1 on-time (actual == plan), 1 late (actual > plan), 1 open-but-future (counts on-time), 1 no plan (excluded)
psql(`INSERT INTO construction_schedule_items (project_id, zone_id, source_sheet, ordinal, name_vi, plan_end_date, actual_end_date) VALUES
 (${pid}, ${zid}, 's', 1, 'on time', CURRENT_DATE, CURRENT_DATE),
 (${pid}, ${zid}, 's', 2, 'late', CURRENT_DATE - 5, CURRENT_DATE),
 (${pid}, ${zid}, 's', 3, 'open future', CURRENT_DATE + 30, NULL),
 (${pid}, ${zid}, 's', 4, 'no plan', NULL, NULL);`);

const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3201' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 3500));
try {
  const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) });
  const { token } = await login.json();
  const H = { Authorization: `Bearer ${token}` };
  const r = await fetch(`${BASE}/api/projects/${pid}/otd?from=2020-01-01&to=2030-01-01`, { headers: H });
  ok(r.status === 200, `GET otd → 200 (got ${r.status})`);
  const j = await r.json();
  ok(j.total === 3, `total=3 planned items (got ${j.total})`);
  ok(j.on_time === 2, `on_time=2 (got ${j.on_time})`);
  ok(j.late === 1, `late=1 (got ${j.late})`);
  ok(Math.abs(j.otd_pct - 66.7) < 0.1, `otd_pct≈66.7 (got ${j.otd_pct})`);
  ok(Array.isArray(j.by_zone) && j.by_zone.length === 1 && j.by_zone[0].zone_code === 'OTD', 'by_zone breakdown present');
  ok(Array.isArray(j.trend), 'trend present');
  // grace_days=10 forgives the 5-day-late item → on_time=3, late=0
  const g = await fetch(`${BASE}/api/projects/${pid}/otd?from=2020-01-01&to=2030-01-01&grace_days=10`, { headers: H }).then(x => x.json());
  ok(g.on_time === 3 && g.late === 0, `grace_days forgives late item (got on_time=${g.on_time} late=${g.late})`);
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
  psql(`DELETE FROM construction_schedule_items WHERE project_id=${pid}; DELETE FROM zones WHERE id=${zid}; DELETE FROM projects WHERE id=${pid};`);
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
