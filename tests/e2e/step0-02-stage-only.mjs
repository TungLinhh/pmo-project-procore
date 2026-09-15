// STEP0-02: staged-only upload (no project_code) + work_breakdown reference stub.
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/step0-02-stage-only.mjs
import { spawn } from 'node:child_process';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3212';
const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3212' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 3500));
try {
  const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) });
  const { token } = await login.json();
  const AUTH = `Bearer ${token}`;

  // 1. bare upload without project_code stages instead of 400
  // Unique content per run: constant bytes would hit the (tenant_id, file_hash)
  // upsert and return an ancient row outside the list's LIMIT window.
  const fd = new FormData();
  fd.append('file', new Blob([`note ${Date.now()}`], { type: 'text/plain' }), 'notes.txt');
  const staged = await fetch(BASE + '/api/upload', { method: 'POST', headers: { Authorization: AUTH }, body: fd }).then(r => r.json());
  ok(staged.ok && staged.upload_id && staged.staged_only && staged.project === null, `staged-only upload returns upload_id (got id=${staged.upload_id})`);

  // 2. work_breakdown is classified: configure works, commit reports skip (not failure)
  const cfg = await fetch(BASE + `/api/upload/${staged.upload_id}/configure`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: AUTH }, body: JSON.stringify({ project_id: 1, doc_type: 'work_breakdown' }) }).then(r => r.json());
  ok(cfg.doc_type === 'work_breakdown' && cfg.total_rows === 0, `work_breakdown configure classifies zero-row preview (got ${cfg.doc_type}/${cfg.total_rows})`);
  const cmt = await fetch(BASE + `/api/upload/${staged.upload_id}/commit`, { method: 'POST', headers: { Authorization: AUTH } }).then(r => r.json());
  ok(cmt.status === 'SKIPPED_REFERENCE', `work_breakdown commit → SKIPPED_REFERENCE (got ${cmt.status})`);

  // 3. staged row visible in uploads list with STAGED-family status
  const list = await fetch(BASE + '/api/uploads', { headers: { Authorization: AUTH } }).then(r => r.json());
  ok(list.some(u => u.id === staged.upload_id), 'staged row listed in /api/uploads');
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
