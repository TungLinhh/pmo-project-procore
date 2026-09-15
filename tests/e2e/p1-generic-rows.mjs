// P1-6: generic_sheets readable — GET /api/uploads/:id/rows returns committed
// generic rows; domain types answer 404 with a pointer. Real PG + server.
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/p1-generic-rows.mjs
import { spawn } from 'node:child_process';
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
  const J = { ...H, 'Content-Type': 'application/json' };
  const post = (p, b) => fetch(BASE + p, { method: 'POST', headers: J, body: JSON.stringify(b) }).then(async r => ({ s: r.status, j: await r.json() }));

  // tiny generic-shape file (STT + name cols)
  const FP = '/tmp/generic-rows-test.xlsx';
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['STT', 'Tên hạng mục', 'Ghi chú'],
    [1, 'Mục generic A', 'note a'],
    [2, 'Mục generic B', 'note b'],
  ]), 'Sheet1');
  XLSX.writeFile(wb, FP);
  const { readFileSync } = await import('node:fs');
  const proj = await post('/api/projects', { code: `P1-GEN-${Date.now()}` });
  const fd = new FormData();
  fd.append('file', new Blob([readFileSync(FP)]), 'file start test.xlsx');
  const staged = await fetch(BASE + '/api/upload', { method: 'POST', headers: H, body: fd }).then(r => r.json());
  const cfg = await post(`/api/upload/${staged.upload_id}/configure`, { project_id: proj.j.id, doc_type: 'file_index' });
  ok(cfg.s === 200, `generic configure 200 (got ${cfg.s})`);
  const cmt = await post(`/api/upload/${staged.upload_id}/commit`, {});
  ok(cmt.s === 200 && cmt.j.status === 'SUCCESS', `generic commit SUCCESS (got ${cmt.j.status})`);

  const rows = await fetch(BASE + `/api/uploads/${staged.upload_id}/rows`, { headers: H }).then(async r => ({ s: r.status, j: await r.json() }));
  ok(rows.s === 200 && rows.j.rows?.length === 2 && rows.j.rows[0].col_1 === 'Mục generic A', `rows readable (got ${rows.s}/${rows.j.rows?.length})`);

  // domain-type upload → 404 pointer, not rows
  const fd2 = new FormData();
  fd2.append('file', new Blob([readFileSync(FP)]), 'sched test.xlsx');
  const st2 = await fetch(BASE + '/api/upload', { method: 'POST', headers: H, body: fd2 }).then(r => r.json());
  await post(`/api/upload/${st2.upload_id}/configure`, { project_id: proj.j.id, doc_type: 'construction_schedule' });
  const dom = await fetch(BASE + `/api/uploads/${st2.upload_id}/rows`, { headers: H }).then(async r => ({ s: r.status, j: await r.json() }));
  ok(dom.s === 404, `domain type → 404 pointer (got ${dom.s})`);

  const unk = await fetch(BASE + '/api/uploads/999999/rows', { headers: H }).then(r => r.status);
  ok(unk === 404, 'unknown upload → 404');

  const { getDb } = await import('../../backend/src/db/index.js');
  const db = getDb();
  await db.prepare('DELETE FROM generic_sheets WHERE project_id = ?').runAsync(proj.j.id);
  await db.prepare('DELETE FROM file_uploads WHERE project_id = ?').runAsync(proj.j.id);
  await db.prepare('DELETE FROM projects WHERE id = ?').runAsync(proj.j.id);
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
