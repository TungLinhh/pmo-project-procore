// Field site actions as site@hbg.com: schedule progress PATCH, today's report +
// manpower + photo upload + material usage. Real PG + server.
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/field-site-actions.mjs
import { spawn } from 'node:child_process';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3107';
const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3107' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 3500));

try {
  const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'site@hbg.com', password: 'admin123' }) });
  const { token } = await login.json();
  ok(!!token, 'site login');
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const get = (p) => fetch(BASE + p, { headers: H }).then(async r => ({ s: r.status, j: await r.json() }));
  const post = (p, b) => fetch(BASE + p, { method: 'POST', headers: H, body: JSON.stringify(b) }).then(async r => ({ s: r.status, j: await r.json() }));
  const today = new Date().toISOString().slice(0, 10);

  // 1. schedule progress PATCH (site updates %) — pick an item without actual_end_date
  // so the derived-status assertion is unambiguous
  const sched = await get('/api/projects/1/construction-schedule?limit=2000');
  const item = (sched.j || []).find(i => !i.actual_end_date);
  ok(!!item, `schedule item without actual_end found (id=${item?.id})`);
  const oldPct = item.progress_pct;
  const patched = await fetch(BASE + `/api/projects/1/construction-schedule/${item.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ progress_pct: 0.5, note: 'test site update' }) }).then(async r => ({ s: r.status, j: await r.json() }));
  ok(patched.s === 200 && Number(patched.j.progress_pct) === 0.5 && patched.j.status === 'IN_PROGRESS', `PATCH progress → IN_PROGRESS (got ${patched.s}/${patched.j.progress_pct}/${patched.j.status})`);
  const bad = await fetch(BASE + `/api/projects/1/construction-schedule/${item.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({}) }).then(r => r.status);
  ok(bad === 400, 'PATCH without progress_pct → 400');
  // restore
  await fetch(BASE + `/api/projects/1/construction-schedule/${item.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ progress_pct: oldPct ?? 0 }) });

  // 2. ensure-today report + manpower
  const reps = await get('/api/projects/1/daily-reports');
  let rep = (Array.isArray(reps.j) ? reps.j : []).find(r => (r.report_date || '').slice(0, 10) === today);
  if (!rep) rep = (await post('/api/projects/1/daily-reports', { report_date: today })).j;
  ok(!!rep?.id, `today report (id=${rep?.id})`);
  const mp = await post(`/api/daily-reports/${rep.id}/manpower`, { role_name_vi: 'SITE-TEST-TEAM', headcount: 7 });
  ok(mp.s === 200 && mp.j.headcount === 7, 'manpower added by site');

  // 3. photo upload
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const fd = new FormData();
  fd.append('photos', new Blob([png], { type: 'image/png' }), 'site-test.png');
  const up = await fetch(BASE + `/api/daily-reports/${rep.id}/photos`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd }).then(async r => ({ s: r.status, j: await r.json() }));
  ok(up.s === 200, `photo uploaded by site (got ${up.s} ${up.j.error || 'ok'})`);

  // 4. material usage
  const code = `SITE-MAT-${Date.now()}`;
  const mat = await post('/api/materials', { project_id: 1, code, name_vi: 'Site test material', notes: 'SL dùng: 5' });
  ok(mat.s === 200 && mat.j.material_code === code, 'material usage recorded by site');

  // cleanup (only test rows; today's shared report row stays if pre-existing)
  const { getDb } = await import('../../backend/src/db/index.js');
  const db = getDb();
  await db.prepare(`DELETE FROM daily_manpower WHERE daily_report_id = ? AND role_name_vi = 'SITE-TEST-TEAM'`).runAsync(rep.id);
  await db.prepare(`DELETE FROM daily_photos WHERE daily_report_id = ? AND file_name = 'site-test.png'`).runAsync(rep.id);
  await db.prepare('DELETE FROM materials WHERE material_code = ?').runAsync(code);
  const stillRef = await db.prepare('SELECT COUNT(*) as c FROM daily_manpower WHERE daily_report_id = ?').getAsync(rep.id);
  const repCreated = (await db.prepare('SELECT created_at FROM daily_reports WHERE id = ?').getAsync(rep.id));
  const fresh = repCreated && (Date.now() - new Date(repCreated.created_at).getTime()) < 10 * 60 * 1000 && Number(stillRef.c) === 0;
  if (fresh) {
    await db.prepare('DELETE FROM daily_reports WHERE id = ?').runAsync(rep.id);
    ok(true, 'throwaway today-report removed');
  } else {
    ok(true, 'shared today-report kept (pre-existing data)');
  }
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
