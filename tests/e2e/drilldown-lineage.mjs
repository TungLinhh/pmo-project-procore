// Drill-down lineage: commit stamps upload_id → item API exposes it → single
// upload lookup + original-file download serve the modal's source link.
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/drilldown-lineage.mjs
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3218';

// golden schedule workbook (same shape as step1-02)
const require = createRequire('/home/vutun/pmo_project/backend/package.json');
const XLSX = require('xlsx');
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
  ['TỔNG TIẾN ĐỘ THI CÔNG'],
  [null, null, null, 'Stt/No', 'Công việc thi công/Work', '% Hoàn thành', 'Tình trạng', 'Ngày bắt đầu', null, 'Ngày kết thúc', null, 'Số ngày'],
  [null, null, null, null, null, null, null, 'KH', 'TT', 'KH', 'TT'],
  [null, null, null, 1, 'Lắp đặt ống', 1, 'YES', new Date(2024, 0, 1), new Date(2024, 0, 1), new Date(2024, 0, 10), new Date(2024, 0, 10), 10],
]), 'MEP-BTE-CSP-TST');
const buf = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3218' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 3500));
try {
  const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) });
  const { token } = await login.json();
  const H = { Authorization: `Bearer ${token}` };
  const J = { ...H, 'Content-Type': 'application/json' };

  const proj = await fetch(BASE + '/api/projects', { method: 'POST', headers: J, body: JSON.stringify({ code: `DRILL-${Date.now()}` }) }).then(r => r.json());
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'sched-drill.xlsx');
  const up = await fetch(BASE + '/api/upload', { method: 'POST', headers: H, body: fd }).then(r => r.json());
  const cfg = await fetch(BASE + `/api/upload/${up.upload_id}/configure`, { method: 'POST', headers: J, body: JSON.stringify({ project_id: proj.id, new_zone: { code: 'DRZ' }, doc_type: 'construction_schedule' }) }).then(r => r.json());
  ok(cfg.total_rows === 1, `configured 1 row (got ${cfg.total_rows})`);
  const cmt = await fetch(BASE + `/api/upload/${up.upload_id}/commit`, { method: 'POST', headers: H }).then(r => r.json());
  ok(cmt.status === 'SUCCESS' && cmt.ok === 1, `committed (got ${cmt.status}/${cmt.ok})`);

  // drill-down data: list rows carry upload_id + full date set
  const items = await fetch(BASE + `/api/projects/${proj.id}/construction-schedule`, { headers: H }).then(r => r.json());
  const row = items[0];
  ok(row && row.upload_id === up.upload_id, `row stamped with upload_id (got ${row?.upload_id})`);
  ok(row?.plan_start_date?.slice(0, 10) === '2024-01-01' && row?.plan_end_date?.slice(0, 10) === '2024-01-10', 'drill-down dates present');

  // single upload lookup (modal source line)
  const meta = await fetch(BASE + `/api/uploads/${up.upload_id}`, { headers: H }).then(r => r.json());
  ok(meta.original_filename === 'sched-drill.xlsx', `upload lookup returns filename (got ${meta.original_filename})`);
  const meta404 = await fetch(BASE + '/api/uploads/999999999', { headers: H });
  ok(meta404.status === 404, `unknown upload → 404 (got ${meta404.status})`);
  const meta400 = await fetch(BASE + '/api/uploads/abc', { headers: H });
  ok(meta400.status === 400, `bad id → 400 (got ${meta400.status})`);

  // original-file download (modal "tải file gốc" button target)
  const dl = await fetch(BASE + `/api/uploads/${up.upload_id}/download`, { headers: H });
  const dlBuf = Buffer.from(await dl.arrayBuffer());
  ok(dl.status === 200 && dlBuf.slice(0, 2).toString() === 'PK', `download returns xlsx bytes (got ${dl.status}/${dlBuf.length}b)`);
  ok((dl.headers.get('content-disposition') || '').includes('sched-drill.xlsx'), 'download filename preserved');
  const dl404 = await fetch(BASE + '/api/uploads/999999999/download', { headers: H });
  ok(dl404.status === 404, `missing download → 404 (got ${dl404.status})`);
  const dlUnauth = await fetch(BASE + `/api/uploads/${up.upload_id}/download`);
  ok(dlUnauth.status === 401, `download requires auth (got ${dlUnauth.status})`);
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
