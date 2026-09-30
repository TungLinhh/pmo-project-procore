// Jobs attention E2E ("Cần xử lý"): gom quá hạn 4 trụ cột theo project.
// Env-driven, tự dọn rác.
import { psqlQuery, apiBase } from '../tools/env.mjs';
import { cleanupProjectsOnExit } from './lib-cleanup.mjs';

const BASE = apiBase();
let pass = 0, fail = 0;
const ok = (name, detail) => { pass++; console.log(`  PASS — ${name}: ${detail}`); };
const ng = (name, detail) => { fail++; console.log(`  FAIL — ${name}: ${detail}`); };


// Dọn dự án thử nghiệm nếu bài dừng giữa chừng — xem `lib-cleanup.mjs`.
cleanupProjectsOnExit(['ATTN-%'], { label: 'attention' });
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

const code = `ATTN-${Date.now()}`;
const proj = await api(T, '/api/projects', { method: 'POST', body: JSON.stringify({ code, name_vi: 'Attention test' }) });
const PID = proj.data?.id;
if (!PID) { ng('create project', JSON.stringify(proj.data).slice(0, 120)); process.exit(1); }

try {
  const zone = await api(T, `/api/projects/${PID}/zones`, { method: 'POST', body: JSON.stringify({ code: 'Z1', name_en: 'Zone 1' }) });
  const ZID = zone.data?.id || Number(exec(`SELECT id FROM zones WHERE project_id = ${PID} AND code = 'Z1'`) || 0);
  // 1 schedule quá hạn + 1 shop chờ duyệt quá 3 ngày.
  exec(`INSERT INTO construction_schedule_items (project_id, zone_id, source_sheet, ordinal, name_vi, progress_pct, status, plan_start_date, plan_end_date) VALUES (${PID}, ${ZID}, 'seed', 1, 'Viec tre', 0.2, 'IN_PROGRESS', '2026-01-01', '2026-01-10')`);
  exec(`INSERT INTO shop_drawings (project_id, zone_id, source_sheet, drawing_code, name_vi, planned_submit_date, actual_submit_date) VALUES (${PID}, ${ZID}, 'seed', 'ATTN-001', 'Ban ve tre', '2026-01-01', '2026-01-02')`);

  const bad = await api(T, '/api/jobs/attention');
  (bad.status === 400 ? ok : ng)('missing project_id → 400', `status=${bad.status}`);

  const r = await api(T, `/api/jobs/attention?project_id=${PID}`);
  const groups = Array.isArray(r.data?.groups) ? r.data.groups : [];
  const byKey = Object.fromEntries(groups.map((g) => [g.key, g]));
  (r.status === 200 && r.data?.total >= 2 ? ok : ng)('attention total', `total=${r.data?.total}`);
  (byKey.schedule?.count >= 1 && byKey.schedule.items[0]?.href?.includes(`/hq/progress?project=${PID}`) ? ok : ng)(
    'schedule group', `count=${byKey.schedule?.count}`);
  (byKey.shop?.count >= 1 && byKey.shop.items[0]?.href?.includes('drawing=') ? ok : ng)(
    'shop group deep-link', `href=${byKey.shop?.items?.[0]?.href}`);
  const allLinked = groups.every((g) => g.href && g.items.every((it) => it.href));
  (allLinked ? ok : ng)('every row deep-linked', 'href present on all items');
  (byKey.schedule?.items?.[0]?.priority === 'HIGH' ? ok : ng)('RAG priority', `priority=${byKey.schedule?.items?.[0]?.priority}`);

  const digestDate = '2099-01-01';
  const digest1 = await api(T, '/api/jobs/overdue-digest', { method: 'POST', body: JSON.stringify({ date: digestDate }) });
  const digest2 = await api(T, '/api/jobs/overdue-digest', { method: 'POST', body: JSON.stringify({ date: digestDate }) });
  const firstDeliveries = Array.isArray(digest1.data?.deliveries) ? digest1.data.deliveries : [];
  const secondDeliveries = Array.isArray(digest2.data?.deliveries) ? digest2.data.deliveries : [];
  (digest1.status === 200 && firstDeliveries.length > 0 ? ok : ng)('daily digest created', `deliveries=${firstDeliveries.length}`);
  (secondDeliveries.length > 0 && secondDeliveries.every((d) => d.duplicate) ? ok : ng)('daily digest retry is idempotent', `duplicates=${secondDeliveries.length}`);
} finally {
  exec(`DELETE FROM notifications WHERE resource_type = 'overdue_digest' AND resource_id IN (SELECT id FROM attention_digest_runs WHERE digest_date = '2099-01-01')`);
  exec(`DELETE FROM attention_digest_runs WHERE digest_date = '2099-01-01'`);
  exec(`DELETE FROM shop_drawings WHERE project_id = ${PID}`);
  exec(`DELETE FROM construction_schedule_items WHERE project_id = ${PID}`);
  exec(`DELETE FROM zones WHERE project_id = ${PID}`);
  exec(`DELETE FROM projects WHERE id = ${PID}`);
  ok('cleanup', `project ${PID} removed`);
}

console.log(fail ? `\n${fail} FAILURE(S)` : '\nALL PASS');
process.exit(fail ? 1 : 0);
