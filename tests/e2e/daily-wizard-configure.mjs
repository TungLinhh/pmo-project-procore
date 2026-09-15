// Daily wizard crash: POST /api/upload/:id/configure with doc_type=daily_report used to
// 500 "Cannot read properties of undefined (reading 'length')" because daily sheets carry
// {work_items, materials, manpower, acceptance} instead of {rows}. Full flow: stage →
// configure (preview) → commit → daily_reports row. Real PG + real server.
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/daily-wizard-configure.mjs
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
const XLSX = (await import('xlsx')).default;

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
  const post = (p, b) => fetch(BASE + p, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(async r => ({ s: r.status, j: await r.json() }));

  // C20-mini daily file: 1 date-named sheet, fixed bands.
  // readSheet drops all-blank rows (blankrows:false), so pad every row with a
  // filler in col 32 (no parser band reads past col 31) to keep band positions.
  const blank = (n) => { const r = Array(n).fill(null); r[32] = '.'; return r; };
  const grid = Array.from({ length: 85 }, () => blank(33));
  grid[1][24] = 'Tester';
  grid[27][0] = 1; grid[27][1] = 'Parent work'; grid[27][2] = 'blocker note';
  grid[28][7] = 1; grid[28][8] = 'Sub A'; grid[28][10] = 2.5;
  grid[28][11] = '2021-05-23'; grid[28][12] = '2021-05-24'; grid[28][13] = 0; grid[28][14] = 0.5;
  grid[42][7] = 2; grid[42][8] = 'Mat A';
  grid[42][11] = '2021-05-23'; grid[42][12] = '2021-05-24'; grid[42][13] = 0; grid[42][14] = 0.3;
  grid[63][10] = 'Team A'; grid[63][19] = 10; grid[63][25] = 2; grid[63][31] = 1;
  grid[64][0] = 1; grid[64][2] = 5;
  const FP = '/tmp/daily-wizard-test.xlsx';
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(grid), '23.5.2021');
  XLSX.writeFile(wb, FP);

  const proj = await post('/api/projects', { code: `DAILY-WZ-${Date.now()}` });
  ok(proj.s === 201, `throwaway project (got ${proj.s})`);

  const fd = new FormData();
  fd.append('file', new Blob([readFileSync(FP)]), 'bao cao cong viec test.xlsx');
  const staged = await fetch(BASE + '/api/upload', { method: 'POST', headers: H, body: fd }).then(r => r.json());
  ok(staged.upload_id, `staged (got id=${staged.upload_id} err=${staged.error || 'none'})`);

  // the former 500:
  const cfg = await post(`/api/upload/${staged.upload_id}/configure`, { project_id: proj.j.id, doc_type: 'daily_report' });
  ok(cfg.s === 200, `configure 200 (got ${cfg.s} err=${cfg.j.error || 'none'})`);
  const sh = cfg.j.sheets?.[0];
  ok(sh && sh.row_count === 5 && sh.report_date === '2021-05-23', `sheet summarized (rows=${sh?.row_count} date=${sh?.report_date})`);
  ok(sh && Array.isArray(sh.sample) && sh.sample.length > 0 && sh.sample[0].name_vi === 'Parent work', 'sample carries work items');

  const cmt = await post(`/api/upload/${staged.upload_id}/commit`, {});
  ok(cmt.s === 200 && cmt.j.status === 'SUCCESS' && cmt.j.total?.ok === 5, `commit SUCCESS ok=5 (got ${cmt.j.status} ok=${cmt.j.total?.ok} err=${JSON.stringify(cmt.j.sheets?.[0]?.failures || []).slice(0, 200)})`);

  const { getDb } = await import('../../backend/src/db/index.js');
  const db = getDb();
  const dr = await db.prepare('SELECT id FROM daily_reports WHERE project_id = ? AND report_date = ?').getAsync(proj.j.id, '2021-05-23');
  ok(!!dr, 'daily_reports row committed');

  // cleanup
  if (dr) {
    for (const t of ['daily_work_items', 'daily_materials', 'daily_manpower', 'daily_acceptance', 'daily_safety', 'daily_recommendations'])
      await db.prepare(`DELETE FROM ${t} WHERE daily_report_id = ?`).runAsync(dr.id).catch(() => {});
    await db.prepare('DELETE FROM daily_reports WHERE id = ?').runAsync(dr.id);
  }
  await db.prepare('DELETE FROM file_uploads WHERE id = ?').runAsync(staged.upload_id);
  await db.prepare('DELETE FROM projects WHERE id = ?').runAsync(proj.j.id);
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
