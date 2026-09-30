// Project report export E2E (SRS FR-1.9): workbook xlsx thật, không rỗng.
// Env-driven, tự dọn rác.
import { psqlQuery, apiBase } from '../tools/env.mjs';
import { cleanupProjectsOnExit } from './lib-cleanup.mjs';

const BASE = apiBase();
let pass = 0, fail = 0;
const ok = (name, detail) => { pass++; console.log(`  PASS — ${name}: ${detail}`); };
const ng = (name, detail) => { fail++; console.log(`  FAIL — ${name}: ${detail}`); };


// Dọn dự án thử nghiệm nếu bài dừng giữa chừng — xem `lib-cleanup.mjs`.
cleanupProjectsOnExit(['RPT-%'], { label: 'project-report' });
const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) }).then((r) => r.json());
const T = login?.token;
if (!T) { console.log('NO TOKEN'); process.exit(1); }
ok('login', 'admin@hbg.com');
const H = { Authorization: `Bearer ${T}` };
const exec = (sql) => psqlQuery(sql).split('\n')[0];

const code = `RPT-${Date.now()}`;
const pid = await fetch(BASE + '/api/projects', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ code, name_vi: 'Report test' }) }).then((r) => r.json()).then((j) => j.id);
if (!pid) { ng('create project', 'no id'); process.exit(1); }
ok('create project', `id=${pid}`);

try {
  const zid = Number(exec(`INSERT INTO zones (project_id, code, name_en) VALUES (${pid}, 'Z1', 'Zone 1') RETURNING id`));
  exec(`INSERT INTO shop_drawings (project_id, zone_id, drawing_code, name_vi, status) VALUES (${pid}, ${zid}, 'RPT-SD-1', 'BV 1', 'APPROVED')`);
  exec(`INSERT INTO construction_schedule_items (project_id, zone_id, source_sheet, ordinal, name_vi, progress_pct, status) VALUES (${pid}, ${zid}, 'seed', 1, 'Viec 1', 0.5, 'IN_PROGRESS')`);

  // 1. Tải workbook: 200 + đúng content-type + magic PK + đủ lớn (6 sheets).
  const r = await fetch(`${BASE}/api/export/project-report.xlsx?project_id=${pid}`, { headers: H });
  const buf = Buffer.from(await r.arrayBuffer());
  const ct = r.headers.get('content-type') || '';
  const cd = r.headers.get('content-disposition') || '';
  (r.status === 200 ? ok : ng)('download 200', `status=${r.status}`);
  (ct.includes('spreadsheetml') ? ok : ng)('content-type xlsx', ct);
  (buf[0] === 0x50 && buf[1] === 0x4b ? ok : ng)('zip magic PK', buf.slice(0, 2).toString('hex'));
  (buf.length > 4000 ? ok : ng)('non-trivial size', `${buf.length} bytes`);
  (/bao-cao-.*\.xlsx/.test(cd) ? ok : ng)('filename', cd.slice(0, 80));

  // 1b. Browser-printable bilingual HTML. The browser supplies "Save as PDF".
  const vi = await fetch(`${BASE}/api/export/project-report.html?project_id=${pid}&lang=vi&print=1`, { headers: H });
  const viHtml = await vi.text();
  const en = await fetch(`${BASE}/api/export/project-report.html?project_id=${pid}&lang=en`, { headers: H });
  const enHtml = await en.text();
  (vi.status === 200 && viHtml.includes('Báo cáo dự án') && viHtml.includes('window.print()') ? ok : ng)('Vietnamese print report', `${vi.status}/${viHtml.length}b`);
  (en.status === 200 && enHtml.includes('Project report') && enHtml.includes('Construction progress') ? ok : ng)('English print report', `${en.status}/${enHtml.length}b`);
  const exportAudit = await fetch(`${BASE}/api/audit?resource_type=project_report&resource_id=${pid}&limit=10`, { headers: H });
  const auditRows = await exportAudit.json();
  (auditRows.some((row) => row.context?.format === 'xlsx') && auditRows.some((row) => row.context?.format === 'print_html') ? ok : ng)('exports audited', `rows=${auditRows.length}`);

  // 2. Guardrails: thiếu project_id 400, project lạ 404, không token 401.
  const b400 = await fetch(`${BASE}/api/export/project-report.xlsx`, { headers: H });
  (b400.status === 400 ? ok : ng)('missing project_id 400', `status=${b400.status}`);
  const b404 = await fetch(`${BASE}/api/export/project-report.xlsx?project_id=999999999`, { headers: H });
  (b404.status === 404 ? ok : ng)('unknown project 404', `status=${b404.status}`);
  const b401 = await fetch(`${BASE}/api/export/project-report.xlsx?project_id=${pid}`);
  (b401.status === 401 ? ok : ng)('no token 401', `status=${b401.status}`);
} finally {
  exec(`DELETE FROM audit_log WHERE resource_type = 'project_report' AND resource_id = ${pid}`);
  exec(`DELETE FROM construction_schedule_items WHERE project_id = ${pid}`);
  exec(`DELETE FROM shop_drawings WHERE project_id = ${pid}`);
  exec(`DELETE FROM zones WHERE project_id = ${pid}`);
  exec(`DELETE FROM projects WHERE id = ${pid}`);
  ok('cleanup', `project ${pid} removed`);
}

console.log(fail ? `\n${fail} FAILURE(S)` : '\nALL PASS');
process.exit(fail ? 1 : 0);
