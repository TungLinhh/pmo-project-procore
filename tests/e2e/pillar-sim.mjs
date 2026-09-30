// Pillar what-if E2E (SRS Mục 4.2: CTL-01 → CTL-06, preview + DRAFT, không
// ghi đè baseline). Env-driven, tự dọn rác.
import { psqlQuery, apiBase } from '../tools/env.mjs';
import { cleanupProjectsOnExit } from './lib-cleanup.mjs';

const BASE = apiBase();
let pass = 0, fail = 0;
const ok = (name, detail) => { pass++; console.log(`  PASS — ${name}: ${detail}`); };
const ng = (name, detail) => { fail++; console.log(`  FAIL — ${name}: ${detail}`); };


// Dọn dự án thử nghiệm nếu bài dừng giữa chừng — xem `lib-cleanup.mjs`.
cleanupProjectsOnExit(['SIM-%'], { label: 'pillar-sim' });
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
const pmLogin = await api(null, '/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'pm@hbg.com', password: 'admin123' }) });
const PM = pmLogin.data?.token;
ok('login', 'admin@hbg.com');
ok('pm login', 'pm@hbg.com');

const code = `SIM-${Date.now()}`;
const proj = await api(T, '/api/projects', { method: 'POST', body: JSON.stringify({ code, name_vi: 'Sim test', end_date: '2026-12-31' }) });
const PID = proj.data?.id;
if (!PID) { ng('create project', JSON.stringify(proj.data).slice(0, 160)); process.exit(1); }
ok('create project', `id=${PID}`);
const pmUser = JSON.parse(exec("SELECT row_to_json(u) FROM users u WHERE email = 'pm@hbg.com'"));
await api(T, `/api/projects/${PID}/members`, { method: 'POST', body: JSON.stringify({ user_id: pmUser.id }) });

// Seed tối thiểu: zone + 2 schedule items (1 open có plan_end) + manpower 7d
// + chuỗi contract→invoice→PR chưa PAID (outstanding > 0).
const zone = await api(T, `/api/projects/${PID}/zones`, { method: 'POST', body: JSON.stringify({ code: 'Z1', name_en: 'Zone 1' }) });
const ZID = zone.data?.id || JSON.parse(exec(`SELECT id FROM zones WHERE project_id = ${PID} AND code = 'Z1'`) || '0');
exec(`INSERT INTO construction_schedule_items (project_id, zone_id, source_sheet, ordinal, name_vi, progress_pct, status, plan_start_date, plan_end_date) VALUES (${PID}, ${ZID}, 'seed', 1, 'Viec A', 0.5, 'IN_PROGRESS', '2026-09-01', '2026-11-30')`);
exec(`INSERT INTO construction_schedule_items (project_id, zone_id, source_sheet, ordinal, name_vi, progress_pct, status, plan_start_date, plan_end_date) VALUES (${PID}, ${ZID}, 'seed', 2, 'Viec B', 1, 'DONE', '2026-09-01', '2026-10-15')`);
exec(`INSERT INTO construction_schedule_items (project_id, zone_id, source_sheet, ordinal, name_vi, progress_pct, status, plan_start_date, plan_end_date) VALUES (${PID}, ${ZID}, 'seed', 3, 'Viec C', 0.2, 'IN_PROGRESS', '2026-09-01', '2026-11-20')`);
const priorityId = exec(`SELECT id FROM construction_schedule_items WHERE project_id = ${PID} AND ordinal = 1`);
const downstreamId = exec(`SELECT id FROM construction_schedule_items WHERE project_id = ${PID} AND ordinal = 3`);
const dependency = await api(T, `/api/projects/${PID}/schedule-links`, { method: 'POST', body: JSON.stringify({ predecessor_id: Number(priorityId), successor_id: Number(downstreamId), link_type: 'FS', lag_days: 0 }) });
ok(dependency.status === 201, `schedule dependency linked (${dependency.status})`);
const dr = await api(T, `/api/projects/${PID}/daily-reports`, { method: 'POST', body: JSON.stringify({ report_date: new Date().toISOString().slice(0, 10) }) });
if (dr.data?.id) await api(T, `/api/daily-reports/${dr.data.id}/manpower`, { method: 'POST', body: JSON.stringify({ role_name_vi: 'Tho dien', headcount: 14 }) });
const ct = await api(T, `/api/projects/${PID}/contracts`, { method: 'POST', body: JSON.stringify({ contract_no: `SIM-CT-${Date.now()}`, total_value: 2000000 }) });
const inv = await api(T, `/api/contracts/${ct.data?.id}/invoices`, { method: 'POST', body: JSON.stringify({ invoice_no: `SIM-INV-${Date.now()}`, amount: 800000 }) });
await api(T, `/api/invoices/${inv.data?.id}/payment-requests`, { method: 'POST', body: JSON.stringify({ request_no: `SIM-PR-${Date.now()}`, amount: 700000 }) });
exec(`INSERT INTO ar_contracts (project_id, source_sheet, ordinal, client_name, contract_value, paid_value, remaining_value, due_now_value)
      VALUES (${PID}, 'SIM-AR', 1, 'Investor', 2000000, 1000000, 1000000, 0)`);
ok('seed', 'zone+schedule+manpower+payment+AR cashflow');
const pushBefore = exec('SELECT COUNT(*) FROM erp_push_log');

const sim = (type, params) => api(T, `/api/projects/${PID}/pillar-scenarios/simulate`, { method: 'POST', body: JSON.stringify({ type, params }) });

try {
  const cases = [
    ['CTL-01', { extend_days: 14 }],
    ['CTL-02', { cut_days: 7, cost_per_head_day: 500000, priority_item_ids: [Number(priorityId)] }],
    ['CTL-03', { delay_days: 10 }],
    ['CTL-04', { late_days: 15 }],
    ['CTL-05', { delta_pct: 20 }],
    ['CTL-06', { rounds: 2, days_per_round: 5 }],
  ];
  for (const [type, params] of cases) {
    const r = await sim(type, params);
    if (r.status !== 201) { ng(`${type} simulate`, `status=${r.status} ${JSON.stringify(r.data).slice(0, 140)}`); continue; }
    const res = r.data?.result || {};
    const shape = res.before && res.after && res.deltas && res.risk && Array.isArray(res.notes_vi);
    (r.data?.status === 'DRAFT' && shape ? ok : ng)(`${type} DRAFT`, `risk=${res.risk} slip=${JSON.stringify(res.deltas).slice(0, 80)}`);
  }

  const pmSim = await api(PM, `/api/projects/${PID}/pillar-scenarios/simulate`, { method: 'POST', body: JSON.stringify({ type: 'CTL-03', params: { delay_days: 1 } }) });
  const pmApply = pmSim.data?.id ? await api(PM, `/api/pillar-scenarios/${pmSim.data.id}/apply`, { method: 'POST' }) : { status: 0 };
  (pmSim.status === 201 && pmApply.status === 403 ? ok : ng)('PM simulate but cannot apply', `simulate=${pmSim.status} apply=${pmApply.status}`);

  // Lan truyền đúng: CTL-03 lùi mốc đúng 10 ngày trên baseline thật 2026-11-30.
  const list = await api(T, `/api/projects/${PID}/pillar-scenarios`);
  const c3 = (Array.isArray(list.data) ? list.data : []).find((s) => {
    const result = typeof s.result === 'string' ? JSON.parse(s.result) : s.result;
    return s.type === 'CTL-03' && Number(result?.deltas?.completion_slip_days) === 10;
  });
  const res3 = typeof c3?.result === 'string' ? JSON.parse(c3.result) : c3?.result;
  (res3?.before?.completion === '2026-11-30' && res3?.after?.completion === '2026-12-10' ? ok : ng)(
    'CTL-03 propagation', `before=${res3?.before?.completion} after=${res3?.after?.completion}`);

  // CTL-01: gia hạn 14 ngày → 2026-11-30 → 2026-12-14, dàn mỏng nhân lực.
  const c1 = (Array.isArray(list.data) ? list.data : []).find((s) => s.type === 'CTL-01');
  const res1 = typeof c1?.result === 'string' ? JSON.parse(c1.result) : c1?.result;
  (res1?.after?.completion === '2026-12-14' && res1?.deltas?.extension_days === 14 ? ok : ng)(
    'CTL-01 propagation', `after=${res1?.after?.completion} respread=${res1?.after?.manpower_rate_respread}`);
  const bad0 = await sim('CTL-01', { extend_days: 0 });
  (bad0.status === 400 ? ok : ng)('extend_days=0 → 400', `status=${bad0.status}`);

  // CTL-02: nén 7 ngày trên baseline 2026-11-30 → cần thêm nhân lực + ước tính chi phí.
  const c2 = (Array.isArray(list.data) ? list.data : []).find((s) => s.type === 'CTL-02');
  const res2 = typeof c2?.result === 'string' ? JSON.parse(c2.result) : c2?.result;
  const shrink = (res2?.before?.remaining_days ?? 0) - (res2?.after?.remaining_days ?? 0);
  (res2?.before?.completion === '2026-11-30' && shrink === 7 && Number(res2?.after?.required_extra_pct) > 0 && Number(res2?.after?.affected_items) >= 1 ? ok : ng)(
    'CTL-02 compression + priority scope', `shrink=${shrink} extra=${res2?.after?.required_extra_pct}% affected=${res2?.after?.affected_items}`);
  (Number(res2?.after?.estimated_cost_vnd) === Number(res2?.after?.extra_head_days) * 500000 ? ok : ng)(
    'CTL-02 cost estimate', `cost=${res2?.after?.estimated_cost_vnd}`);
  (res2?.after?.cpm?.before_duration_days > res2?.after?.cpm?.after_duration_days && res2?.after?.cpm?.critical_item_ids?.length > 0 ? ok : ng)(
    'CTL-02 CPM dependency result', `critical=${JSON.stringify(res2?.after?.cpm?.critical_item_ids)}`);
  const deleteLink = await api(T, `/api/schedule-links/${dependency.data.id}`, { method: 'DELETE' });
  ok(deleteLink.status === 200, `dependency link removed for stale test (${deleteLink.status})`);
  const changedLink = await api(T, `/api/projects/${PID}/schedule-links`, { method: 'POST', body: JSON.stringify({ predecessor_id: Number(priorityId), successor_id: Number(downstreamId), link_type: 'FS', lag_days: 1 }) });
  const staleDependencyApply = await api(T, `/api/pillar-scenarios/${c2.id}/apply`, { method: 'POST' });
  ok(staleDependencyApply.status === 409, `dependency changed after preview → 409 (${staleDependencyApply.status})`);
  await api(T, `/api/schedule-links/${changedLink.data.id}`, { method: 'DELETE' });
  const restoredLink = await api(T, `/api/projects/${PID}/schedule-links`, { method: 'POST', body: JSON.stringify({ predecessor_id: Number(priorityId), successor_id: Number(downstreamId), link_type: 'FS', lag_days: 0 }) });
  ok(restoredLink.status === 201, `dependency link restored (${restoredLink.status})`);
  const bad02a = await sim('CTL-02', { cut_days: 0 });
  (bad02a.status === 400 ? ok : ng)('cut_days=0 → 400', `status=${bad02a.status}`);
  const bad02b = await sim('CTL-02', { cut_days: 365 });
  (bad02b.status === 400 ? ok : ng)('cut_days > remaining → 400', `status=${bad02b.status}`);

  // CTL-04 đề xuất tạm ứng = outstanding 700000.
  const c4 = (Array.isArray(list.data) ? list.data : []).find((s) => s.type === 'CTL-04');
  const res4 = typeof c4?.result === 'string' ? JSON.parse(c4.result) : c4?.result;
  (Number(res4?.after?.proposed_advance) === 700000 && Number(res4?.after?.cash_in_total) === 1000000 ? ok : ng)(
    'CTL-04 advance from actual AR cashflow', `advance=${res4?.after?.proposed_advance} cashIn=${res4?.after?.cash_in_total}`);

  // Input xấu → 400, type lạ → 400.
  const bad1 = await sim('CTL-03', { delay_days: 0 });
  (bad1.status === 400 ? ok : ng)('delay_days=0 → 400', `status=${bad1.status}`);
  const bad2 = await sim('CTL-99', {});
  (bad2.status === 400 ? ok : ng)('unknown type → 400', `status=${bad2.status}`);

  const audit = await api(T, `/api/audit?resource_type=pillar_scenario&limit=5`);
  (Array.isArray(audit.data) && audit.data.length >= 4 ? ok : ng)('audit SIMULATE', `rows=${audit.data?.length ?? '?'}`);

  // A schedule edit after preview must block apply with 409.
  const stale = await sim('CTL-03', { delay_days: 1 });
  exec(`UPDATE construction_schedule_items SET plan_end_date = '2026-12-01' WHERE project_id = ${PID} AND ordinal = 1`);
  const staleApply = await api(T, `/api/pillar-scenarios/${stale.data?.id}/apply`, { method: 'POST' });
  ok(staleApply.status === 409, `stale scenario apply → 409 (${staleApply.status})`);
  exec(`UPDATE construction_schedule_items SET plan_end_date = '2026-11-30' WHERE project_id = ${PID} AND ordinal = 1`);

  // Apply CTL-03 → plan_end 2026-11-30 +10 = 2026-12-10, status APPLIED.
  const c3id = c3?.id;
  const ap = await api(T, `/api/pillar-scenarios/${c3id}/apply`, { method: 'POST' });
  (ap.status === 200 && ap.data?.scenario?.status === 'APPLIED' ? ok : ng)('apply CTL-03', `status=${ap.status} changed=${ap.data?.changed}`);
  const endAfter = exec(`SELECT plan_end_date FROM construction_schedule_items WHERE project_id = ${PID} AND ordinal = 1`);
  (endAfter === '2026-12-10' ? ok : ng)('dates shifted +10', `got ${endAfter}`);
  const ap2 = await api(T, `/api/pillar-scenarios/${c3id}/apply`, { method: 'POST' });
  (ap2.status === 409 ? ok : ng)('re-apply → 409', `status=${ap2.status}`);

  // Rollback → về 2026-11-30, ROLLED_BACK; rollback nữa → 409.
  const rb = await api(T, `/api/pillar-scenarios/${c3id}/rollback`, { method: 'POST' });
  (rb.status === 200 && Number(rb.data?.restored) === 3 ? ok : ng)('rollback CTL-03', `restored=${rb.data?.restored}`);
  const endBack = exec(`SELECT plan_end_date FROM construction_schedule_items WHERE project_id = ${PID} AND ordinal = 1`);
  (endBack === '2026-11-30' ? ok : ng)('dates restored', `got ${endBack}`);
  const rb2 = await api(T, `/api/pillar-scenarios/${c3id}/rollback`, { method: 'POST' });
  (rb2.status === 409 ? ok : ng)('re-rollback → 409', `status=${rb2.status}`);

  // Apply CTL-01 (+14) rồi rollback → về mốc gốc (chứng minh đường apply chung).
  const c1id = c1?.id;
  const ap1 = await api(T, `/api/pillar-scenarios/${c1id}/apply`, { method: 'POST' });
  (ap1.status === 200 && ap1.data?.scenario?.status === 'APPLIED' ? ok : ng)('apply CTL-01', `status=${ap1.status} shift=${ap1.data?.shift_days}`);
  const endExt = exec(`SELECT plan_end_date FROM construction_schedule_items WHERE project_id = ${PID} AND ordinal = 1`);
  (endExt === '2026-12-14' ? ok : ng)('dates extended +14', `got ${endExt}`);
  const rb1 = await api(T, `/api/pillar-scenarios/${c1id}/rollback`, { method: 'POST' });
  const endBack1 = exec(`SELECT plan_end_date FROM construction_schedule_items WHERE project_id = ${PID} AND ordinal = 1`);
  (rb1.status === 200 && Number(rb1.data?.restored) === 3 && endBack1 === '2026-11-30' ? ok : ng)('rollback CTL-01', `restored=${rb1.data?.restored} date=${endBack1}`);

  // Apply CTL-02 (-7) rồi rollback → về mốc gốc (dịch âm qua đường apply chung).
  const c2id = c2?.id;
  const ap2x = await api(T, `/api/pillar-scenarios/${c2id}/apply`, { method: 'POST' });
  (ap2x.status === 200 && ap2x.data?.shift_days === -7 ? ok : ng)('apply CTL-02', `status=${ap2x.status} shift=${ap2x.data?.shift_days}`);
  const endCut = exec(`SELECT plan_end_date FROM construction_schedule_items WHERE project_id = ${PID} AND ordinal = 1`);
  (endCut === '2026-11-23' ? ok : ng)('dates compressed -7', `got ${endCut}`);
  const untouched = exec(`SELECT plan_end_date FROM construction_schedule_items WHERE project_id = ${PID} AND ordinal = 3`);
  (untouched === '2026-11-20' ? ok : ng)('non-priority item unchanged', `got ${untouched}`);
  const rb2x = await api(T, `/api/pillar-scenarios/${c2id}/rollback`, { method: 'POST' });
  const endBack2 = exec(`SELECT plan_end_date FROM construction_schedule_items WHERE project_id = ${PID} AND ordinal = 1`);
  (rb2x.status === 200 && Number(rb2x.data?.restored) === 3 && endBack2 === '2026-11-30' ? ok : ng)('rollback CTL-02', `restored=${rb2x.data?.restored} date=${endBack2}`);

  // Apply CTL-04 (không dịch ngày) → APPLIED + advance = outstanding.
  const c4id = (Array.isArray(list.data) ? list.data : []).find((s) => s.type === 'CTL-04')?.id;
  const ap4 = await api(T, `/api/pillar-scenarios/${c4id}/apply`, { method: 'POST' });
  (ap4.status === 200 && ap4.data?.scenario?.status === 'APPLIED' ? ok : ng)('apply CTL-04', `status=${ap4.status}`);
  const audit2 = await api(T, `/api/audit?resource_type=pillar_scenario&limit=10`);
  const acts = new Set((Array.isArray(audit2.data) ? audit2.data : []).map((a) => a.action));
  (acts.has('APPLY') && acts.has('ROLLBACK') ? ok : ng)('audit APPLY+ROLLBACK', [...acts].join(','));
  const pushAfter = exec('SELECT COUNT(*) FROM erp_push_log');
  (pushAfter === pushBefore ? ok : ng)('simulation sends no ERP/webhook', `push logs ${pushBefore}→${pushAfter}`);
} finally {
  exec(`DELETE FROM notifications WHERE project_id = ${PID}`);
  exec(`DELETE FROM pillar_scenarios WHERE project_id = ${PID}`);
  exec(`DELETE FROM schedule_baseline_items WHERE baseline_id IN (SELECT id FROM schedule_baselines WHERE project_id = ${PID})`);
  exec(`DELETE FROM schedule_baselines WHERE project_id = ${PID}`);
  exec(`DELETE FROM ar_contracts WHERE project_id = ${PID}`);
  exec(`DELETE FROM payment_requests WHERE invoice_id IN (SELECT i.id FROM invoices i JOIN contracts c ON c.id = i.contract_id WHERE c.project_id = ${PID})`);
  exec(`DELETE FROM invoices WHERE contract_id IN (SELECT id FROM contracts WHERE project_id = ${PID})`);
  exec(`DELETE FROM contracts WHERE project_id = ${PID}`);
  exec(`DELETE FROM daily_manpower WHERE daily_report_id IN (SELECT id FROM daily_reports WHERE project_id = ${PID})`);
  exec(`DELETE FROM daily_reports WHERE project_id = ${PID}`);
  exec(`DELETE FROM construction_schedule_items WHERE project_id = ${PID}`);
  exec(`DELETE FROM zones WHERE project_id = ${PID}`);
  exec(`DELETE FROM projects WHERE id = ${PID}`);
  ok('cleanup', `project ${PID} removed`);
}

console.log(fail ? `\n${fail} FAILURE(S)` : '\nALL PASS');
process.exit(fail ? 1 : 0);
