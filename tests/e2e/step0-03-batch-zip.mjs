// STEP0-03: POST /api/upload/batch — zip intake with slip validation + caps + reasons.
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/step0-03-batch-zip.mjs
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3213';

// build fixtures: 2 real xlsx via backend's own xlsx dep, malicious zip via python stdlib
const require = createRequire('/home/vutun/pmo_project/backend/package.json');
const XLSX = require('xlsx');
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['STT', 'Name'], [1, 'a']]), 'S1');
const xlsxBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
require('node:fs').writeFileSync('/tmp/step0-03-a.xlsx', xlsxBuf);
// malicious + mixed-type zip via python stdlib (quoted heredoc: no shell expansion of $)
execSync(`python3 << 'PYEOF'
# -*- coding: utf-8 -*-
import zipfile
z = zipfile.ZipFile('/tmp/step0-03-batch.zip', 'w', zipfile.ZIP_STORED)
z.writestr('2020.01.11 MEP-BTE-PCR/TIẾN ĐỘ SHOP/MEP-BTE-SHD-BOH.xlsx', open('/tmp/step0-03-a.xlsx','rb').read())
z.writestr('FILE START.xlsx', open('/tmp/step0-03-a.xlsx','rb').read())
z.writestr('TIẾN ĐỘ SHOP/legacy.xls', b'old')
z.writestr('QUY TRÌNH/spec.pdf', b'%PDF')
z.writestr('TIẾN ĐỘ SHOP/~$lock.xlsx', b'lock')
z.writestr('../evil.xlsx', b'evil')
z.writestr('/abs.xlsx', b'abs')
z.writestr('docs/readme.txt', b'hi')
z.close()
print('zip rebuilt')
PYEOF`);

const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3213' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 3500));
try {
  const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) });
  const { token } = await login.json();
  const AUTH = `Bearer ${token}`;

  const zipBuf = require('node:fs').readFileSync('/tmp/step0-03-batch.zip');
  const fd = new FormData();
  fd.append('file', new Blob([zipBuf], { type: 'application/zip' }), 'bte.zip');
  const r = await fetch(BASE + '/api/upload/batch', { method: 'POST', headers: { Authorization: AUTH }, body: fd });
  ok(r.status === 202, `batch accepted (got ${r.status})`);
  const j = await r.json();
  ok(j.total === 8, `all 8 entries accounted (got ${j.total})`);
  ok(j.staged === 2, `2 xlsx staged (got ${j.staged})`);
  ok(j.skipped === 6, `6 skipped with reasons (got ${j.skipped})`);
  const byRel = Object.fromEntries(j.files.map(f => [f.relative_path, f]));
  ok(byRel['2020.01.11 MEP-BTE-PCR/TIẾN ĐỘ SHOP/MEP-BTE-SHD-BOH.xlsx']?.status === 'STAGED', 'folder path preserved in relative_path');
  ok(byRel['2020.01.11 MEP-BTE-PCR/TIẾN ĐỘ SHOP/MEP-BTE-SHD-BOH.xlsx']?.upload_id > 0, 'staged entry has upload_id');
  ok(byRel['TIẾN ĐỘ SHOP/legacy.xls']?.status === 'SKIPPED_FORMAT', 'legacy .xls skipped with reason');
  ok(byRel['QUY TRÌNH/spec.pdf']?.status === 'SKIPPED_FORMAT', 'pdf skipped with reason');
  ok(byRel['TIẾN ĐỘ SHOP/~$lock.xlsx']?.status === 'SKIPPED_FORMAT', 'lockfile skipped');
  const slips = j.files.filter(f => /Zip-slip blocked/.test(f.skip_reason || ''));
  ok(slips.length === 2, `both hostile paths blocked + recorded (got ${slips.length})`);
  ok(slips.every(f => f.status === 'SKIPPED_FORMAT' && f.upload_id > 0), 'slip entries recorded with ids, never staged');
  ok(j.files.every(f => f.upload_id > 0 && f.skip_reason !== undefined), 'every entry has upload_id + skip_reason key');
  ok(j.files.filter(f => f.status === 'STAGED').every(f => f.skip_reason === null), 'staged entries carry null reason');

  // non-zip rejected
  const fd2 = new FormData();
  fd2.append('file', new Blob(['x']), 'a.xlsx');
  const r2 = await fetch(BASE + '/api/upload/batch', { method: 'POST', headers: { Authorization: AUTH }, body: fd2 });
  ok(r2.status === 400, `non-zip → 400 (got ${r2.status})`);
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
  execSync('rm -f /tmp/step0-03-batch.zip /tmp/step0-03-a.xlsx');
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
