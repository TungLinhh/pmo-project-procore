// QA/QC extension pillar: create, legal transitions, summary, cleanup.
import { spawn } from 'node:child_process';
import { cleanupProjectsOnExit } from './lib-cleanup.mjs';

let failures = 0;
const ok = (cond, detail) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${detail}`); if (!cond) failures++; };
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3119';
const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3119', NODE_ENV: 'test' }, stdio: 'ignore' });
await new Promise((resolve) => setTimeout(resolve, 3500));


// Dọn dự án thử nghiệm nếu bài dừng giữa chừng — xem `lib-cleanup.mjs`.
cleanupProjectsOnExit(['QA%'], { label: 'qa-inspections' });
const ids = [];
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const r = await fetch(BASE + path, { ...opts, headers });
  const body = await r.json().catch(() => null);
  return { status: r.status, body };
}

try {
  const login = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) });
  const token = login.body?.token;
  ok(!!token, 'admin login');
  const H = { Authorization: `Bearer ${token}` };
  const code = `QA-${Date.now()}`;
  const created = await api('/api/projects/1/qa-inspections', {
    method: 'POST', headers: H, body: JSON.stringify({ code, title_vi: 'Nghiệm thu tường tầng 1', inspector: 'QA E2E' }),
  });
  ok(created.status === 201 && created.body?.status === 'OPEN', `create OPEN (${created.status})`);
  ids.push(created.body?.id);

  const bad = await api(`/api/qa-inspections/${created.body.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ status: 'DRAFT' }) });
  ok(bad.status === 422, `illegal transition → 422 (${bad.status})`);
  const failed = await api(`/api/qa-inspections/${created.body.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ status: 'FAILED' }) });
  ok(failed.status === 200 && failed.body?.status === 'FAILED', 'OPEN → FAILED');
  const passed = await api(`/api/qa-inspections/${created.body.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ status: 'PASSED' }) });
  ok(passed.status === 200 && passed.body?.status === 'PASSED', 'FAILED → PASSED');
  const reopened = await api(`/api/qa-inspections/${created.body.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ status: 'OPEN' }) });
  ok(reopened.status === 200 && reopened.body?.status === 'OPEN', 'PASSED → OPEN');

  const summary = await api('/api/projects/1/control-summary', { headers: H });
  ok(summary.status === 200 && summary.body?.qa?.total >= 1, `control-summary includes QA (${summary.body?.qa?.total})`);

  const { getDb, closeDb } = await import('../../backend/src/db/index.js');
  const db = getDb();
  for (const id of ids.filter(Boolean)) {
    await db.prepare('DELETE FROM audit_log WHERE resource_type = ? AND resource_id = ?').runAsync('qa_inspection', id);
    await db.prepare('DELETE FROM qa_inspections WHERE id = ?').runAsync(id);
  }
  await closeDb();
} catch (e) {
  failures++;
  console.log(`FAIL — ${e.message}`);
} finally {
  srv.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
