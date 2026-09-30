// S-curves E2E (SRS FR-1.7): KH vs TT lũy kế 4 trụ cột từ dates thật.
// Env-driven, tự dọn rác.
import { psqlQuery, apiBase } from '../tools/env.mjs';
import { cleanupProjectsOnExit } from './lib-cleanup.mjs';

const BASE = apiBase();
let pass = 0, fail = 0;
const ok = (name, detail) => { pass++; console.log(`  PASS — ${name}: ${detail}`); };
const ng = (name, detail) => { fail++; console.log(`  FAIL — ${name}: ${detail}`); };


// Dọn dự án thử nghiệm nếu bài dừng giữa chừng — xem `lib-cleanup.mjs`.
cleanupProjectsOnExit(['SC-%', 'SC-MSB-%', 'SCURVE-%'], { label: 's-curves' });
async function api(token, path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(BASE + path, { ...opts, headers });
  const t = await r.text();
  let data; try { data = JSON.parse(t); } catch { data = t; }
  return { status: r.status, data };
}
const exec = (sql) => psqlQuery(sql);
const mono = (a) => Array.isArray(a) && a.every((v, i) => i === 0 || v >= a[i - 1]);

const login = await api(null, '/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) });
const T = login.data?.token;
if (!T) { console.log('NO TOKEN'); process.exit(1); }
ok('login', 'admin@hbg.com');

const code = `SCURVE-${Date.now()}`;
const proj = await api(T, '/api/projects', { method: 'POST', body: JSON.stringify({ code, name_vi: 'S-curve test' }) });
const PID = proj.data?.id;
if (!PID) { ng('create project', JSON.stringify(proj.data).slice(0, 120)); process.exit(1); }
ok('create project', `id=${PID}`);

const zone = await api(T, `/api/projects/${PID}/zones`, { method: 'POST', body: JSON.stringify({ code: 'Z1' }) });
const ZID = zone.data?.id || Number(exec(`SELECT id FROM zones WHERE project_id = ${PID} AND code = 'Z1'`));
try {
  // Shop: 2 bản vẽ (KH 09-01/09-08, TT 1 cái 09-03).
  for (const [i, planned, actual] of [[1, '2026-09-01', '2026-09-03'], [2, '2026-09-08', null]]) {
    const sd = await api(T, '/api/shop-drawings', { method: 'POST', body: JSON.stringify({ project_id: PID, zone_id: ZID, drawing_code: `SC-${Date.now()}-${i}`, name_vi: `Vẽ ${i}` }) });
    exec(`UPDATE shop_drawings SET planned_submit_date = '${planned}'${actual ? `, actual_submit_date = '${actual}'` : ''} WHERE id = ${sd.data?.id}`);
  }
  // Submittal: 1 hồ sơ (trình 09-02, duyệt 09-05).
  const ms = await api(T, '/api/material-submittals', { method: 'POST', body: JSON.stringify({ project_id: PID, submittal_code: `SC-MSB-${Date.now()}` }) });
  exec(`UPDATE material_submittals SET submitted_date = '2026-09-02', approved_date = '2026-09-05', status = 'APPROVED' WHERE id = ${ms.data?.id}`);
  // Schedule: 2 items (KH 09-10/09-17, TT 1 cái 09-12).
  exec(`INSERT INTO construction_schedule_items (project_id, zone_id, source_sheet, ordinal, name_vi, progress_pct, status, plan_end_date, actual_end_date) VALUES (${PID}, ${ZID}, 'seed', 1, 'A', 1, 'DONE', '2026-09-10', '2026-09-12'), (${PID}, ${ZID}, 'seed', 2, 'B', 0.2, 'IN_PROGRESS', '2026-09-17', NULL)`);
  // Payment: 2 khoản (đáo hạn 09-15/09-22 500k/700k, trả 1 khoản 09-16).
  exec(`INSERT INTO payments (project_id, contract_no, invoice_no, amount, paid_amount, due_date, paid_at, status) VALUES (${PID}, 'C1', 'I1', 500000, 500000, '2026-09-15', '2026-09-16 10:00:00', 'PAID'), (${PID}, 'C1', 'I2', 700000, 0, '2026-09-22', NULL, 'DRAFT')`);
  ok('seed', 'shop+msb+schedule+payment dates');

  const r = await api(T, `/api/projects/${PID}/s-curves`);
  if (r.status !== 200) { ng('GET s-curves', `status=${r.status}`); }
  else {
    const d = r.data;
    for (const p of ['shop', 'material', 'construction', 'payment']) {
      const c = d[p];
      const shape = c && Array.isArray(c.planned?.labels) && Array.isArray(c.actual?.values);
      (shape ? ok : ng)(`${p} shape`, `KH=${c?.planned?.values?.length ?? '?'} TT=${c?.actual?.values?.length ?? '?'}`);
    }
    (d.unit?.payment === 'VND' ? ok : ng)('payment unit VND', d.unit?.payment);
    const sp = d.shop.planned.values, sa = d.shop.actual.values;
    (sp[sp.length - 1] === 2 && sa[sa.length - 1] === 1 && mono(sp) && mono(sa) ? ok : ng)('shop cumulative', `KH=${JSON.stringify(sp)} TT=${JSON.stringify(sa)}`);
    const pp = d.payment.planned.values;
    (pp[pp.length - 1] === 1200000 ? ok : ng)('payment cumulative VND', JSON.stringify(pp));
  }
  // Project trống → curves rỗng (UI tự ẩn), vẫn 200.
  const empty = await api(T, '/api/projects/1/s-curves');
  (empty.status === 200 ? ok : ng)('real project 200', `status=${empty.status}`);
} finally {
  exec(`DELETE FROM payments WHERE project_id = ${PID}`);
  exec(`DELETE FROM construction_schedule_items WHERE project_id = ${PID}`);
  exec(`DELETE FROM material_submittals WHERE project_id = ${PID}`);
  exec(`DELETE FROM shop_drawings WHERE project_id = ${PID}`);
  exec(`DELETE FROM zones WHERE project_id = ${PID}`);
  exec(`DELETE FROM projects WHERE id = ${PID}`);
  ok('cleanup', `project ${PID} removed`);
}

console.log(fail ? `\n${fail} FAILURE(S)` : '\nALL PASS');
process.exit(fail ? 1 : 0);
