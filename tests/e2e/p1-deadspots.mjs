// P1-4: dead spots wired — daily photo download round-trips bytes, master-data
// create works, /field/wbs redirects to material. Real PG + server.
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/p1-deadspots.mjs
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
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const post = (p, b) => fetch(BASE + p, { method: 'POST', headers: H, body: JSON.stringify(b) }).then(async r => ({ s: r.status, j: await r.json() }));

  // 1. photo upload → download same bytes
  const proj = await post('/api/projects', { code: `P1-DS-${Date.now()}` });
  const dr = await post(`/api/projects/${proj.j.id}/daily-reports`, { report_date: '2026-09-11' });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const fd = new FormData();
  fd.append('photos', new Blob([png], { type: 'image/png' }), 'deadspot.png');
  const up = await fetch(BASE + `/api/daily-reports/${dr.j.id}/photos`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd }).then(r => r.json());
  const photoId = up.photos?.[0]?.id;
  ok(!!photoId, 'photo uploaded');
  const dl = await fetch(BASE + `/api/daily-reports/photos/${photoId}/download`, { headers: { Authorization: `Bearer ${token}` } });
  const buf = Buffer.from(await dl.arrayBuffer());
  ok(dl.status === 200 && buf.equals(png), `download round-trips bytes (got ${dl.status}/${buf.length}B)`);
  const missing = await fetch(BASE + '/api/daily-reports/photos/999999/download', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.status);
  ok(missing === 404, 'unknown photo → 404');

  // 2. master-data create (MasterDataEdit Lưu)
  const v = await post('/api/master-data/vendors', { tenant_id: 1, code: `V-${Date.now()}`, name: 'Deadspot Vendor' });
  ok(v.s === 200 && v.j.id, `vendor created (got ${v.s} id=${v.j.id})`);

  // 3. /field/wbs redirects (static: dead stub route retired)
  const app = readFileSync('frontend/src/App.jsx', 'utf8');
  ok(app.includes('path="wbs" element={<Navigate to="../material"'), '/field/wbs redirects to material');

  const { getDb } = await import('../../backend/src/db/index.js');
  const db = getDb();
  await db.prepare('DELETE FROM daily_photos WHERE daily_report_id = ?').runAsync(dr.j.id);
  await db.prepare('DELETE FROM daily_reports WHERE id = ?').runAsync(dr.j.id);
  await db.prepare('DELETE FROM vendors WHERE id = ?').runAsync(v.j.id);
  await db.prepare('DELETE FROM projects WHERE id = ?').runAsync(proj.j.id);
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
