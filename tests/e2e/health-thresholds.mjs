// Health thresholds E2E (SRS FR-1.6): đèn theo ngưỡng cấu hình được.
// Env-driven, tự dọn rác.
import { psqlQuery, apiBase } from '../tools/env.mjs';
import { cleanupProjectsOnExit } from './lib-cleanup.mjs';

const BASE = apiBase();
let pass = 0, fail = 0;
const ok = (name, detail) => { pass++; console.log(`  PASS — ${name}: ${detail}`); };
const ng = (name, detail) => { fail++; console.log(`  FAIL — ${name}: ${detail}`); };


// Dọn dự án thử nghiệm nếu bài dừng giữa chừng — xem `lib-cleanup.mjs`.
cleanupProjectsOnExit(['HEALTH-%'], { label: 'health-thresholds' });
async function api(token, path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(BASE + path, { ...opts, headers });
  const t = await r.text();
  let data; try { data = JSON.parse(t); } catch { data = t; }
  return { status: r.status, data };
}
const exec = (sql) => psqlQuery(sql);

const login = await api(null, '/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) });
const T = login.data?.token;
if (!T) { console.log('NO TOKEN'); process.exit(1); }
ok('login', 'admin@hbg.com');

const code = `HEALTH-${Date.now()}`;
const proj = await api(T, '/api/projects', { method: 'POST', body: JSON.stringify({ code, name_vi: 'Health test' }) });
const PID = proj.data?.id;
if (!PID) { ng('create project', JSON.stringify(proj.data).slice(0, 120)); process.exit(1); }
ok('create project', `id=${PID}`);

try {
  // 1. Defaults trên project trống: overdue=0 green; approval=0% red; 4 pillars + overall.
  const h0 = await api(T, `/api/projects/${PID}/health`);
  if (h0.status !== 200) ng('GET health', `status=${h0.status}`);
  else {
    const s = h0.data?.signals || {};
    const pills = ['shop', 'material', 'manpower', 'payment'];
    (pills.every((p) => s[p]?.level) ? ok : ng)('4 pillar signals', pills.map((p) => `${p}=${s[p]?.level}`).join(' '));
    (s.manpower?.level === 'green' && s.shop?.level === 'red' ? ok : ng)('default levels', `manpower=${s.manpower?.level} shop=${s.shop?.level}`);
    (['green', 'yellow', 'red'].includes(h0.data?.overall) ? ok : ng)('overall', h0.data?.overall);
  }

  // 2. Ngưỡng hiệu lực mặc định scope=default, đủ 4 metrics.
  const t0 = await api(T, `/api/projects/${PID}/health-thresholds`);
  (t0.status === 200 && t0.data?.length === 4 && t0.data.every((t) => t.scope === 'default') ? ok : ng)(
    'effective defaults', `rows=${t0.data?.length}`);

  // 3. PUT override project: approval {yellow 90, red 0} → red thành yellow.
  const put = await api(T, `/api/projects/${PID}/health-thresholds`, {
    method: 'PUT', body: JSON.stringify({ thresholds: [{ metric: 'approval_pct', yellow_at: 90, red_at: 0 }] }),
  });
  if (put.status !== 200) ng('PUT override', `status=${put.status} ${JSON.stringify(put.data).slice(0, 120)}`);
  else ok('PUT override', 'saved');
  const h1 = await api(T, `/api/projects/${PID}/health`);
  (h1.data?.signals?.shop?.level === 'yellow' ? ok : ng)('override flips level', `shop=${h1.data?.signals?.shop?.level}`);
  const t1 = await api(T, `/api/projects/${PID}/health-thresholds`);
  (t1.data?.find((t) => t.metric === 'approval_pct')?.scope === 'project' ? ok : ng)('scope=project', 'persisted');

  // 4. Tenant scope: overdue {yellow 10, red 20} → scope=tenant.
  const putT = await api(T, `/api/projects/${PID}/health-thresholds`, {
    method: 'PUT', body: JSON.stringify({ scope: 'tenant', thresholds: [{ metric: 'overdue_items', yellow_at: 10, red_at: 20 }] }),
  });
  (putT.status === 200 ? ok : ng)('PUT tenant scope', `status=${putT.status}`);
  const t2 = await api(T, `/api/projects/${PID}/health-thresholds`);
  (t2.data?.find((t) => t.metric === 'overdue_items')?.scope === 'tenant' ? ok : ng)('tenant default applies', 'scope=tenant');

  // 5. Invalid: metric lạ → 400; high_bad đảo thứ tự → 400; rỗng → 400.
  const bad1 = await api(T, `/api/projects/${PID}/health-thresholds`, { method: 'PUT', body: JSON.stringify({ thresholds: [{ metric: 'nope', yellow_at: 1, red_at: 2 }] }) });
  (bad1.status === 400 ? ok : ng)('unknown metric 400', `status=${bad1.status}`);
  const bad2 = await api(T, `/api/projects/${PID}/health-thresholds`, { method: 'PUT', body: JSON.stringify({ thresholds: [{ metric: 'overdue_items', yellow_at: 5, red_at: 3 }] }) });
  (bad2.status === 400 ? ok : ng)('inverted order 400', `status=${bad2.status}`);
  const bad3 = await api(T, `/api/projects/${PID}/health-thresholds`, { method: 'PUT', body: JSON.stringify({ thresholds: [] }) });
  (bad3.status === 400 ? ok : ng)('empty 400', `status=${bad3.status}`);

  // 6. Audit ghi nhận.
  const audit = await api(T, `/api/audit?resource_type=health_threshold&limit=5`);
  (Array.isArray(audit.data) && audit.data.length >= 2 ? ok : ng)('audit thresholds', `rows=${audit.data?.length ?? '?'}`);
} finally {
  exec(`DELETE FROM health_thresholds WHERE tenant_id = (SELECT tenant_id FROM projects WHERE id = ${PID}) AND (project_id = ${PID} OR project_id = 0)`);
  exec(`DELETE FROM projects WHERE id = ${PID}`);
  ok('cleanup', `project ${PID} removed`);
}

console.log(fail ? `\n${fail} FAILURE(S)` : '\nALL PASS');
process.exit(fail ? 1 : 0);
