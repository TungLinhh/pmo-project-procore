// P0-06: saveFile shape — daily photos + /api/upload store real storage keys (no NULL).
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/p0-06-savefile.mjs
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3106';
const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3106' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 3500));

try {
  const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) });
  const { token } = await login.json();
  const AUTH = `Bearer ${token}`;

  // --- daily photo: file_path must be the storage key, file retrievable
  // Throwaway project isolates the (project_id, report_date) unique key across reruns.
  const tmpProj = await fetch(BASE + '/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: AUTH }, body: JSON.stringify({ code: `P0-06-D-${Date.now()}` }) }).then(r => r.json());
  ok(tmpProj.id, `throwaway project created (id=${tmpProj.id})`);
  const dr = await fetch(BASE + `/api/projects/${tmpProj.id}/daily-reports`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: AUTH }, body: JSON.stringify({ report_date: '2026-09-06' }) }).then(r => r.json());
  ok(dr.id, `daily report created (id=${dr.id})`);
  const fd = new FormData();
  fd.append('photos', new Blob(['fake-png-bytes'], { type: 'image/png' }), 'site-photo.png');
  const up = await fetch(`${BASE}/api/daily-reports/${dr.id}/photos`, { method: 'POST', headers: { Authorization: AUTH }, body: fd }).then(r => r.json());
  ok(up.ok && up.count === 1, `photo upload ok (got ${JSON.stringify(up).slice(0, 120)})`);
  const photo = up.photos?.[0];
  ok(photo && photo.file_path && !photo.file_path.includes('/') && photo.file_name === 'site-photo.png',
    `file_path is storage key + file_name original (got ${photo?.file_path}/${photo?.file_name})`);

  // --- legacy /api/upload: returns upload_id + staged file_uploads row + counts
  const require = createRequire('/home/vutun/pmo_project/backend/package.json');
  const XLSX = require('xlsx');
  // Unique content per run: same sha256 would hit the (tenant_id, file_hash)
  // upsert and return an old row outside the list's LIMIT window.
  const runTag = `run ${Date.now()}`;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['STT', 'X', 'Y', 'CODE', 'Z', 'NAME', 'PROGRESS'],
    [1, '', '', 'TD-001', '', ' cong viec p0-06', 50],
    [2, '', '', 'TD-002', '', runTag, 10],
  ]), 'TD P0-ZONE');
  const xlsxBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const fd2 = new FormData();
  fd2.append('file', new Blob([xlsxBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'tien-do-p0-06.xlsx');
  fd2.append('project_code', 'BTE-WP4-HBC');
  const up2 = await fetch(`${BASE}/api/upload`, { method: 'POST', headers: { Authorization: AUTH }, body: fd2 }).then(r => r.json());
  ok(up2.upload_id && up2.result && typeof up2.total_rows === 'number',
    `upload returns upload_id + result + counts (got upload_id=${up2.upload_id} total=${up2.total_rows})`);
  ok(up2.file && up2.file.key && !up2.file.key.includes('/'), `upload file.key is storage key (got ${up2.file?.key})`);
  const staged = await fetch(`${BASE}/api/uploads`, { headers: { Authorization: AUTH } }).then(r => r.json());
  ok(Array.isArray(staged) && staged.some(u => u.id === up2.upload_id && u.storage_key === up2.file.key),
    'staged file_uploads row exists with matching storage_key');
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
