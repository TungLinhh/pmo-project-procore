// Manpower plan E2E (SRS FR-1.3): kế hoạch PMO vs. thực tế + loading %.
// Env-driven, tự dọn rác.
import { psqlQuery, apiBase } from '../tools/env.mjs';
import { cleanupProjectsOnExit } from './lib-cleanup.mjs';

const BASE = apiBase();
let pass = 0, fail = 0;
const ok = (name, detail) => { pass++; console.log(`  PASS — ${name}: ${detail}`); };
const ng = (name, detail) => { fail++; console.log(`  FAIL — ${name}: ${detail}`); };


// Dọn dự án thử nghiệm nếu bài dừng giữa chừng — xem `lib-cleanup.mjs`.
cleanupProjectsOnExit(['MPLAN-%'], { label: 'manpower-plan' });
async function api(token, path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(BASE + path, { ...opts, headers });
  const t = await r.text();
  let data; try { data = JSON.parse(t); } catch { data = t; }
  return { status: r.status, data };
}
const exec = (sql) => psqlQuery(sql).split('\n')[0];

const login = await api(null, '/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) });
const T = login.data?.token;
if (!T) { console.log('NO TOKEN'); process.exit(1); }
ok('login', 'admin@hbg.com');

const code = `MPLAN-${Date.now()}`;
const proj = await api(T, '/api/projects', { method: 'POST', body: JSON.stringify({ code, name_vi: 'Manpower plan test' }) });
const PID = proj.data?.id;
if (!PID) { ng('create project', JSON.stringify(proj.data).slice(0, 120)); process.exit(1); }
ok('create project', `id=${PID}`);

// Thứ Hai tuần này (server chuẩn hóa giống date_trunc('week')).
const now = new Date();
const dow = (now.getUTCDay() + 6) % 7;
const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dow)).toISOString().slice(0, 10);
const today = new Date().toISOString().slice(0, 10);

try {
  // 1. PUT kế hoạch 2 roles (1 row gửi ngày giữa tuần → chuẩn hóa về thứ Hai).
  const wed = new Date(new Date(monday + 'T00:00:00Z').getTime() + 2 * 86400000).toISOString().slice(0, 10);
  const put = await api(T, `/api/projects/${PID}/manpower-plan`, {
    method: 'PUT', body: JSON.stringify({ rows: [
      { role_name_vi: 'Thợ điện', week_start: monday, planned_headcount: 10 },
      { role_name_vi: 'Thợ nước', week_start: wed, planned_headcount: 6 },
    ] }),
  });
  (put.status === 200 && put.data?.length === 2 ? ok : ng)('PUT plan', `status=${put.status} rows=${put.data?.length}`);
  const plan = await api(T, `/api/projects/${PID}/manpower-plan`);
  const weeks = new Set((Array.isArray(plan.data) ? plan.data : []).map((r) => String(r.week_start).slice(0, 10)));
  (weeks.size === 1 && weeks.has(monday) ? ok : ng)('weeks normalized to Monday', [...weeks].join(','));

  // 1b. Equipment (kind=equipment): lưu riêng, không trộn vào loading labor.
  const putEq = await api(T, `/api/projects/${PID}/manpower-plan`, {
    method: 'PUT', body: JSON.stringify({ rows: [
      { role_name_vi: 'Cẩu tháp', week_start: monday, planned_headcount: 2, kind: 'equipment' },
    ] }),
  });
  (putEq.status === 200 && putEq.data?.[0]?.kind === 'equipment' ? ok : ng)('PUT equipment', `status=${putEq.status} kind=${putEq.data?.[0]?.kind}`);
  const badKind = await api(T, `/api/projects/${PID}/manpower-plan`, { method: 'PUT', body: JSON.stringify({ rows: [{ role_name_vi: 'X', week_start: monday, planned_headcount: 1, kind: 'robot' }] }) });
  (badKind.status === 400 ? ok : ng)('bad kind 400', `status=${badKind.status}`);

  // 2. Thực tế: báo cáo hôm nay 4 thợ điện + 3 thợ nước → loading (4+3)/(10+6).
  const dr = await api(T, `/api/projects/${PID}/daily-reports`, { method: 'POST', body: JSON.stringify({ report_date: today }) });
  await api(T, `/api/daily-reports/${dr.data?.id}/manpower`, { method: 'POST', body: JSON.stringify({ role_name_vi: 'Thợ điện', headcount: 4 }) });
  await api(T, `/api/daily-reports/${dr.data?.id}/manpower`, { method: 'POST', body: JSON.stringify({ role_name_vi: 'Thợ nước', headcount: 3 }) });
  await api(T, `/api/daily-reports/${dr.data?.id}/manpower`, { method: 'POST', body: JSON.stringify({ role_name_vi: 'Cẩu tháp', headcount: 1, kind: 'equipment' }) });
  const load = await api(T, `/api/projects/${PID}/manpower-loading`);
  const wk = (Array.isArray(load.data?.weeks) ? load.data.weeks : []).find((w) => String(w.week_start).slice(0, 10) === monday);
  (wk && wk.planned === 16 && wk.actual === 7 && wk.pct === 43.8 ? ok : ng)(
    'loading math (equipment excluded)', `planned=${wk?.planned} actual=${wk?.actual} pct=${wk?.pct}`);
  (load.data?.total?.pct === 43.8 ? ok : ng)('total pct', load.data?.total?.pct);
  const eqWeek = (Array.isArray(load.data?.equipment_weeks) ? load.data.equipment_weeks : []).find((w) => String(w.week_start).slice(0, 10) === monday);
  (eqWeek && eqWeek.planned === 2 && eqWeek.actual === 1 && eqWeek.pct === 50 ? ok : ng)(
    'equipment loading curve', `planned=${eqWeek?.planned} actual=${eqWeek?.actual} pct=${eqWeek?.pct}`);

  // 3. Validation: ngày xấu, số âm, rỗng → 400.
  const bad1 = await api(T, `/api/projects/${PID}/manpower-plan`, { method: 'PUT', body: JSON.stringify({ rows: [{ role_name_vi: 'X', week_start: 'not-a-date', planned_headcount: 5 }] }) });
  (bad1.status === 400 ? ok : ng)('bad date 400', `status=${bad1.status}`);
  const bad2 = await api(T, `/api/projects/${PID}/manpower-plan`, { method: 'PUT', body: JSON.stringify({ rows: [{ role_name_vi: 'X', week_start: monday, planned_headcount: -1 }] }) });
  (bad2.status === 400 ? ok : ng)('negative 400', `status=${bad2.status}`);
  const bad3 = await api(T, `/api/projects/${PID}/manpower-plan`, { method: 'PUT', body: JSON.stringify({ rows: [] }) });
  (bad3.status === 400 ? ok : ng)('empty 400', `status=${bad3.status}`);

  // 4. Audit ghi nhận.
  const audit = await api(T, `/api/audit?resource_type=manpower_plan&resource_id=${PID}&limit=3`);
  (Array.isArray(audit.data) && audit.data.length > 0 ? ok : ng)('audit plan', `rows=${audit.data?.length ?? '?'}`);
} finally {
  exec(`DELETE FROM daily_manpower WHERE daily_report_id IN (SELECT id FROM daily_reports WHERE project_id = ${PID})`);
  exec(`DELETE FROM daily_reports WHERE project_id = ${PID}`);
  exec(`DELETE FROM manpower_plans WHERE project_id = ${PID}`);
  exec(`DELETE FROM projects WHERE id = ${PID}`);
  ok('cleanup', `project ${PID} removed`);
}

console.log(fail ? `\n${fail} FAILURE(S)` : '\nALL PASS');
process.exit(fail ? 1 : 0);
