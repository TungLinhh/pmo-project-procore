// STEP0-04: bulk picker contract — relative_path staged per file, visible for review.
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/step0-04-bulk-picker.mjs
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };

// static: picker UI + api surface the bulk flow needs
const wiz = readFileSync('frontend/src/components/UploadWizard.jsx', 'utf8');
ok(wiz.includes('webkitdirectory'), 'folder picker (webkitdirectory) present');
ok(wiz.includes('handleBulkUpload') && wiz.includes('handleZipUpload'), 'bulk + zip handlers present');
ok(wiz.includes('relativePath: item.rel'), 'per-file relative path sent');
const api = readFileSync('frontend/src/api/index.js', 'utf8');
ok(api.includes('relative_path') && api.includes('batchZip'), 'api sends relative_path + has batchZip');

const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3214';
const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3214' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 3500));
try {
  const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) });
  const { token } = await login.json();
  const AUTH = `Bearer ${token}`;

  // what the bulk picker does per file: POST /api/upload with relative_path
  const rels = ['P/TIẾN ĐỘ SHOP/A.xlsx', 'P/QUY TRÌNH/B.xlsx'];
  const ids = [];
  let n = 0;
  for (const rel of rels) {
    const fd = new FormData();
    fd.append('file', new Blob([`content-${Date.now()}-${n++}`], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), rel.split('/').pop());
    fd.append('relative_path', rel);
    const r = await fetch(BASE + '/api/upload', { method: 'POST', headers: { Authorization: AUTH }, body: fd }).then(x => x.json());
    ok(r.upload_id && r.staged_only, `staged ${rel} (id=${r.upload_id})`);
    ids.push(r.upload_id);
  }
  const list = await fetch(BASE + '/api/uploads', { headers: { Authorization: AUTH } }).then(r => r.json());
  for (let i = 0; i < rels.length; i++)
    ok(list.some(u => u.id === ids[i] && u.relative_path === rels[i]), `review source keeps ${rels[i]}`);
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
