// E2E test toàn bộ flow PMO MVP
// Chạy: BASE_URL=http://localhost:3000 node tests/e2e/api.mjs (cần backend running)
import { apiBase, psqlQuery } from '../tools/env.mjs';

const BASE = apiBase();
const results = [];
const log = (n, ok, detail = '') => results.push({ n, ok, detail });

async function api(token, path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) },
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text.slice(0, 200); }
  return { status: res.status, data };
}

// 1. Login
const login = await api(null, '/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) });
log('login', login.status === 200 && login.data?.token, `status=${login.status}`);
const T = login.data?.token;

// 2. List projects (active only)
const projs = await api(T, '/api/projects');
log('list projects (active only)', projs.status === 200 && projs.data.length >= 1, `${projs.data?.length} projects`);
const activeProj = projs.data?.find(p => p.status === 'ACTIVE');
const closedProj = projs.data?.find(p => p.status === 'CLOSED') || { id: 1, code: 'BTE-WP4-HBC' };

// 3. List include_closed
const allProjs = await api(T, '/api/projects?include_closed=1');
log('list projects (include_closed=1)', allProjs.data?.length >= projs.data?.length, `total=${allProjs.data?.length}`);

// 4. Revoke close (BTE-WP4-HBC was closed earlier)
const rRevoke = await api(T, '/api/projects/1/revoke-close', { method: 'POST' });
log('revoke-close (re-activate p1)', rRevoke.status === 200 || rRevoke.status === 409, `status=${rRevoke.status}`);

// 5. Close p1 again
const rClose = await api(T, '/api/projects/1/close', { method: 'POST', body: JSON.stringify({ reason: 'E2E test' }) });
log('close project 1', rClose.status === 200 || rClose.status === 409, `status=${rClose.status} data.status=${rClose.data?.status}`);

// 6. List filter (active should not include p1)
const afterClose = await api(T, '/api/projects');
log('after close: p1 hidden', !afterClose.data?.some(p => p.id === 1), `visible=${afterClose.data?.map(p => p.id).join(',')}`);

// 7. Create issue
const issue = await api(T, '/api/projects/1/issues', { method: 'POST', body: JSON.stringify({ project_id: 1, title: 'E2E test issue', severity: 'HIGH' }) });
log('create issue', issue.status === 200 || issue.status === 201, `id=${issue.data?.id}`);
const issueId = issue.data?.id;

// 8. List issues
const issues = await api(T, '/api/issues?project_id=1');
log('list issues', issues.status === 200, `count=${issues.data?.length}`);

// 9. Audit log (filter by project)
const audit = await api(T, '/api/audit?project_id=1&limit=10');
log('audit log filter project_id=1', audit.status === 200, `count=${audit.data?.length}`);

// 10. Audit log export CSV
const csv = await fetch(`${BASE}/api/audit/export?format=csv&limit=5`, { headers: { Authorization: `Bearer ${T}` } });
log('audit export CSV', csv.status === 200, `len=${(await csv.text()).length}b`);

// 11. Audit log export JSON
const json = await fetch(`${BASE}/api/audit/export?format=json&limit=5`, { headers: { Authorization: `Bearer ${T}` } });
const jd = await json.json();
log('audit export JSON', json.status === 200 && jd.count >= 1, `count=${jd.count}`);

// 12. KPI target list
const kpis = await api(T, '/api/projects/1/kpi-targets');
log('KPI list active', kpis.status === 200, `count=${kpis.data?.length}`);

// 13. KPI include history
const kpiHist = await api(T, '/api/projects/1/kpi-targets?include_history=1');
log('KPI list all versions', kpiHist.status === 200, `count=${kpiHist.data?.length}`);

// 14. KPI history by code (if any)
if (kpiHist.data?.[0]) {
  const code = kpiHist.data[0].kpi_code;
  const h = await api(T, `/api/projects/1/kpi-targets/${code}/history?include_history=1`);
  log(`KPI ${code} history`, h.status === 200, `versions=${h.data?.length}`);
} else {
  log('KPI history', true, 'skipped (no KPI)');
}

// 15. KPI create
const kpiNew = await api(T, '/api/projects/1/kpi-targets', { method: 'POST', body: JSON.stringify({ kpi_code: 'TEST_E2E', name_vi: 'Test E2E', target_value: 95, unit: '%' }) });
log('KPI create', kpiNew.status === 200, `id=${kpiNew.data?.id} v=${kpiNew.data?.version}`);

// KPI update = create v2
const kpiUpd = await api(T, `/api/kpi-targets/${kpiNew.data?.id}`, { method: 'PUT', body: JSON.stringify({ target_value: 99 }) });
log('KPI update v2', kpiUpd.status === 200 && kpiUpd.data?.version > (kpiNew.data?.version || 0), `v=${kpiUpd.data?.version} (was v${kpiNew.data?.version})`);

// 17. Schedule baseline create (idempotent — nếu đã có, version tăng)
const baseline = await api(T, '/api/projects/1/schedule-baselines', { method: 'POST', body: JSON.stringify({ notes: 'E2E test baseline' }) });
log('schedule baseline create', baseline.status === 200 && baseline.data?.version >= 1, `v=${baseline.data?.version}`);

// 18. Schedule baseline list
const baselines = await api(T, '/api/projects/1/schedule-baselines');
log('schedule baseline list', baselines.status === 200, `count=${baselines.data?.length}`);

// 19. Shop drawing list (project-scoped)
const sds = await api(T, '/api/projects/1/shop-drawings');
log('shop drawings list', sds.status === 200 && Array.isArray(sds.data), `count=${sds.data?.length}`);

// 20. Shop PATCH (DRAFT/REJECTED only)
const draftSd = sds.data?.find(s => s.status === 'DRAFT' || s.status === 'REJECTED');
if (draftSd) {
  const patch = await api(T, `/api/shop-drawings/${draftSd.id}`, { method: 'PATCH', body: JSON.stringify({ progress_pct: 80, name_vi: 'E2E patched' }) });
  log('shop PATCH (DRAFT/REJECTED)', patch.status === 200, `status=${patch.status} pct=${patch.data?.progress_pct}`);
  // 21. Shop history
  const hist = await api(T, `/api/shop-drawings/${draftSd.id}/history`);
  log('shop history', hist.status === 200, `count=${hist.data?.length}`);
} else {
  log('shop PATCH', true, 'skipped (no DRAFT/REJECTED)');
}

// 22. Material submittal list
const subs = await api(T, '/api/projects/1/material-submittals');
log('material-submittals list', subs.status === 200, `count=${subs.data?.length}`);

// 23. Notification prefs
const prefs = await api(T, '/api/me/notification-prefs');
log('notification prefs GET', prefs.status === 200, `channels=${JSON.stringify(prefs.data?.channels)}`);
const prefsBefore = prefs.data;

// 24. Notification prefs PUT
const prefsPut = await api(T, '/api/me/notification-prefs', { method: 'PUT', body: JSON.stringify({ notify_email: false, notify_zalo: false }) });
log('notification prefs PUT', prefsPut.status === 200, `email=${prefsPut.data?.channels?.email} zalo=${prefsPut.data?.channels?.zalo}`);

// 25. Directive create
const dir = await api(T, '/api/directives', { method: 'POST', body: JSON.stringify({ project_id: 1, body: 'E2E test directive' }) });
log('directive create', dir.status === 200, `id=${dir.data?.id}`);

// 26. Notification list (should include directive)
const notifs = await api(T, '/api/notifications?limit=5');
log('notifications list', notifs.status === 200, `count=${notifs.data?.length}`);

// 27. Contracts list
const contracts = await api(T, '/api/projects/1/contracts');
log('contracts list', contracts.status === 200, `count=${contracts.data?.length}`);

// 28. Daily reports list
const drs = await api(T, '/api/projects/1/daily-reports');
log('daily-reports list', drs.status === 200, `count=${drs.data?.length}`);

// 29. Manpower list
const mp = await api(T, '/api/projects/1/manpower');
log('manpower list', mp.status === 200, `count=${mp.data?.length}`);

// 30. /api/health (final)
const health = await api(null, '/api/health');
log('final health', health.status === 200, 'OK');

// 31. Cleanup: this suite runs against the live dev DB — restore everything
// it mutated (project 1 close, created issue/directive/KPI, shop patch, prefs).
const rRevokeEnd = await api(T, '/api/projects/1/revoke-close', { method: 'POST' });
log('cleanup: revoke-close project 1', rRevokeEnd.status === 200, `status=${rRevokeEnd.status}`);
if (issueId) {
  try {
    psqlQuery(`UPDATE directives SET issue_id = NULL WHERE issue_id = ${issueId}; DELETE FROM issues WHERE id = ${issueId};`);
    log('cleanup: delete E2E issue', true, `id=${issueId}`);
  } catch { log('cleanup: delete E2E issue', false, 'psql failed'); }
}
if (dir.data?.id) {
  try {
    psqlQuery(`DELETE FROM directives WHERE id = ${dir.data.id};`);
    log('cleanup: delete E2E directive', true, `id=${dir.data.id}`);
  } catch { log('cleanup: delete E2E directive', false, 'psql failed'); }
}
if (kpiNew.data?.id) {
  try {
    psqlQuery(`DELETE FROM kpi_targets WHERE kpi_code = 'TEST_E2E';`);
    log('cleanup: delete E2E KPI', true, 'kpi_code=TEST_E2E');
  } catch { log('cleanup: delete E2E KPI', false, 'psql failed'); }
}
if (draftSd) {
  const restore = await api(T, `/api/shop-drawings/${draftSd.id}`, { method: 'PATCH', body: JSON.stringify({ progress_pct: draftSd.progress_pct ?? 0, name_vi: draftSd.name_vi }) });
  log('cleanup: restore shop PATCH', restore.status === 200, `status=${restore.status}`);
}
if (prefsBefore?.channels) {
  const rPrefs = await api(T, '/api/me/notification-prefs', { method: 'PUT', body: JSON.stringify({
    notify_email: prefsBefore.channels.email, notify_zalo: prefsBefore.channels.zalo, zalo_user_id: prefsBefore.zalo_user_id,
  }) });
  log('cleanup: restore notification prefs', rPrefs.status === 200, `status=${rPrefs.status}`);
}

// Summary
const pass = results.filter(r => r.ok).length;
const fail = results.filter(r => !r.ok);
console.log(`\n=== E2E Results: ${pass}/${results.length} PASS ===\n`);
results.forEach(r => {
  console.log(`  ${r.ok ? '✅' : '❌'} ${r.n}: ${r.detail}`);
});
if (fail.length) {
  console.log(`\n=== FAILED: ${fail.length} ===`);
  fail.forEach(r => console.log(`  ❌ ${r.n}: ${r.detail}`));
  process.exit(1);
}
