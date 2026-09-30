// Portfolio and dashboard roll-ups must follow project assignment, not tenant only.
import { spawn } from 'node:child_process';
import { getDb, closeDb } from '../../backend/src/db/index.js';
import { cleanupProjectsOnExit } from './lib-cleanup.mjs';

const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
process.env.DATABASE_URL = DB;
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3126';
let failures = 0;
const ok = (condition, message) => { console.log(`${condition ? 'PASS' : 'FAIL'} — ${message}`); if (!condition) failures += 1; };
const call = async (token, path, options = {}) => {
  const response = await fetch(BASE + path, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
};
const login = async (email) => (await call(null, '/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password: 'admin123' }) })).body?.token;
const port = new URL(BASE).port || '3000';
const server = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: port, LOGIN_RATE_MAX: '1000' }, stdio: 'ignore' });
await new Promise((resolve) => setTimeout(resolve, 3500));
const db = getDb();
let firstId;
let secondId;
try {
  const admin = await login('admin@hbg.com');
  const pm = await login('pm@hbg.com');
  const ceo = await login('ceo@hbg.com');
  const stamp = Date.now();
  const first = await call(admin, '/api/projects', { method: 'POST', body: JSON.stringify({ code: `DASH-A-${stamp}`, name_vi: 'Dashboard A' }) });
  const second = await call(admin, '/api/projects', { method: 'POST', body: JSON.stringify({ code: `DASH-B-${stamp}`, name_vi: 'Dashboard B' }) });
  firstId = first.body?.id;
  secondId = second.body?.id;
  const pmUser = await db.prepare('SELECT id FROM users WHERE email = ?').getAsync('pm@hbg.com');
  await db.prepare('INSERT INTO project_members (project_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING').runAsync(firstId, pmUser.id);


// Dọn dự án thử nghiệm nếu bài dừng giữa chừng — xem `lib-cleanup.mjs`.
cleanupProjectsOnExit(['DASH-A-%', 'DASH-B-%'], { label: 'dashboard-scope' });
  const pmDashboard = await call(pm, '/api/dashboard');
  ok(pmDashboard.status === 200 && pmDashboard.body?.project_codes?.includes(`DASH-A-${stamp}`) && !pmDashboard.body?.project_codes?.includes(`DASH-B-${stamp}`), 'PM dashboard roll-up only includes assigned project');
  const pmPortfolio = await call(pm, '/api/dashboard/portfolio-kpi?fresh=1');
  const pmCodes = Array.isArray(pmPortfolio.body) ? pmPortfolio.body.map((row) => row.project?.code) : [];
  ok(pmPortfolio.status === 200 && pmCodes.includes(`DASH-A-${stamp}`) && !pmCodes.includes(`DASH-B-${stamp}`), 'PM portfolio roll-up only includes assigned project');
  const ceoPortfolio = await call(ceo, '/api/dashboard/portfolio-kpi?fresh=1');
  const ceoCodes = Array.isArray(ceoPortfolio.body) ? ceoPortfolio.body.map((row) => row.project?.code) : [];
  ok(ceoPortfolio.status === 200 && ceoCodes.includes(`DASH-A-${stamp}`) && ceoCodes.includes(`DASH-B-${stamp}`), 'CEO portfolio roll-up includes tenant projects');
  ok(ceoPortfolio.body?.every((row) => row.health && typeof row.health.overall === 'string'), 'portfolio rows include project health roll-up');
} finally {
  for (const projectId of [firstId, secondId]) {
    if (!projectId) continue;
    await db.prepare('DELETE FROM project_members WHERE project_id = ?').runAsync(projectId).catch(() => {});
    await db.prepare('DELETE FROM projects WHERE id = ?').runAsync(projectId).catch(() => {});
  }
  await closeDb();
  server.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
