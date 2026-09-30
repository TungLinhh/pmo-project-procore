// Perf proof (SRS NFR: dashboard <3s với 20 dự án song song).
// Seed 20 project PERF-* với dữ liệu thật (generate_series, nhanh), đo wall-time
// các endpoint dashboard chính (5 runs, lấy max), assert <3000ms, dọn sạch.
// Chạy: node tests/e2e/perf.mjs (cần server + PG như mọi e2e).
import { psqlQuery, apiBase } from '../tools/env.mjs';
import { cleanupProjectsOnExit } from './lib-cleanup.mjs';

const BASE = apiBase();
const N = 20;
const LIMIT_MS = 3000;
const RUNS = 5;
let fail = 0;
const ok = (n, d) => console.log(`  PASS — ${n}: ${d}`);
const ng = (n, d) => { fail++; console.log(`  FAIL — ${n}: ${d}`); };


// Dọn dự án thử nghiệm nếu bài dừng giữa chừng — xem `lib-cleanup.mjs`.
cleanupProjectsOnExit(['PERF%'], { label: 'perf' });
async function api(token, path) {
  const t0 = Date.now();
  const r = await fetch(BASE + path, { headers: { Authorization: `Bearer ${token}` } });
  await r.text();
  return { status: r.status, ms: Date.now() - t0 };
}
const exec = (sql) => psqlQuery(sql).split('\n')[0];

const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) }).then((r) => r.json());
const T = login?.token;
if (!T) { console.log('NO TOKEN'); process.exit(1); }
const stamp = Date.now();

// Seed: 20 projects × (1 zone, 50 schedule, 20 shop, 20 materials, 5 submittals,
// 1 contract→1 invoice→1 PR). Bulk bằng generate_series cho nhanh.
console.log(`seeding ${N} projects...`);
const tSeed = Date.now();
exec(`INSERT INTO projects (tenant_id, code, name_vi, status)
      SELECT 1, 'PERF-${stamp}-' || g, 'Perf ' || g, 'ACTIVE' FROM generate_series(1, ${N}) g`);
const pids = exec(`SELECT string_agg(id::text, ',') FROM projects WHERE code LIKE 'PERF-${stamp}-%'`);
exec(`INSERT INTO zones (project_id, code, name_en)
      SELECT p.id, 'PZ', 'Perf zone' FROM projects p WHERE p.code LIKE 'PERF-${stamp}-%'`);
exec(`INSERT INTO construction_schedule_items (project_id, zone_id, source_sheet, ordinal, name_vi, progress_pct, status, plan_start_date, plan_end_date)
      SELECT p.id, z.id, 'seed', g, 'Viec ' || g, (g % 10) / 10.0, CASE WHEN g % 10 = 0 THEN 'DONE' ELSE 'IN_PROGRESS' END,
             CURRENT_DATE - 30, CURRENT_DATE + (g % 60)
      FROM projects p JOIN zones z ON z.project_id = p.id, generate_series(1, 50) g
      WHERE p.code LIKE 'PERF-${stamp}-%'`);
exec(`INSERT INTO shop_drawings (project_id, zone_id, drawing_code, name_vi, status, planned_submit_date)
      SELECT p.id, z.id, 'PERF-SD-' || p.id || '-' || g, 'BV ' || g, (CASE WHEN g % 4 = 0 THEN 'APPROVED' ELSE 'SUBMITTED' END)::workflow_status, CURRENT_DATE - (g % 20)
      FROM projects p JOIN zones z ON z.project_id = p.id, generate_series(1, 20) g
      WHERE p.code LIKE 'PERF-${stamp}-%'`);
exec(`INSERT INTO materials (project_id, zone_id, material_code, name_vi, progress_pct)
      SELECT p.id, z.id, 'PERF-M-' || p.id || '-' || g, 'VT ' || g, (g % 5) / 5.0
      FROM projects p JOIN zones z ON z.project_id = p.id, generate_series(1, 20) g
      WHERE p.code LIKE 'PERF-${stamp}-%'`);
exec(`INSERT INTO material_submittals (project_id, submittal_code, status, sla_deadline)
      SELECT p.id, 'PERF-MSB-' || p.id || '-' || g, 'SUBMITTED', CURRENT_DATE + (g % 10)
      FROM projects p, generate_series(1, 5) g WHERE p.code LIKE 'PERF-${stamp}-%'`);
exec(`INSERT INTO contracts (project_id, contract_no, total_value)
      SELECT id, 'PERF-CT-' || id, 1000000 FROM projects WHERE code LIKE 'PERF-${stamp}-%'`);
exec(`INSERT INTO invoices (contract_id, invoice_no, amount)
      SELECT c.id, 'PERF-INV-' || c.id, 500000 FROM contracts c JOIN projects p ON p.id = c.project_id WHERE p.code LIKE 'PERF-${stamp}-%'`);
exec(`INSERT INTO payment_requests (invoice_id, request_no, amount, status, due_date)
      SELECT i.id, 'PERF-PR-' || i.id, 450000, 'SUBMITTED', CURRENT_DATE + 10 FROM invoices i
      WHERE i.invoice_no LIKE 'PERF-INV-%'`);
console.log(`seeded in ${Date.now() - tSeed}ms`);
const firstPid = pids.split(',')[0];

try {
  // Warm-up (pool + plan cache) rồi đo.
  await api(T, '/api/dashboard');
  const targets = [
    ['GET /api/dashboard', '/api/dashboard'],
    ['GET /api/dashboard/portfolio-kpi', '/api/dashboard/portfolio-kpi'],
    [`GET pillar-gates`, `/api/projects/${firstPid}/pillar-gates`],
    [`GET s-curves`, `/api/projects/${firstPid}/s-curves`],
    [`GET health`, `/api/projects/${firstPid}/health`],
    [`GET manpower-loading`, `/api/projects/${firstPid}/manpower-loading`],
  ];
  for (const [name, path] of targets) {
    const samples = [];
    let status = 0;
    for (let i = 0; i < RUNS; i++) {
      const r = await api(T, path);
      samples.push(r.ms);
      status = r.status;
    }
    const max = Math.max(...samples);
    (status === 200 && max < LIMIT_MS ? ok : ng)(name, `status=${status} max=${max}ms (runs: ${samples.join(',')})`);
  }

  // Control summary must carry the same real rows as the individual endpoints.
  const getJson = async (path) => fetch(BASE + path, { headers: { Authorization: `Bearer ${T}` } }).then((r) => r.json());
  const [summary, schedule, shop, materials, gates, curves, health, loading] = await Promise.all([
    getJson(`/api/projects/${firstPid}/control-summary`),
    getJson(`/api/projects/${firstPid}/construction-schedule?limit=2000`),
    getJson(`/api/projects/${firstPid}/shop-drawings?limit=2000`),
    getJson(`/api/projects/${firstPid}/materials?limit=2000`),
    getJson(`/api/projects/${firstPid}/pillar-gates`),
    getJson(`/api/projects/${firstPid}/s-curves`),
    getJson(`/api/projects/${firstPid}/health`),
    getJson(`/api/projects/${firstPid}/manpower-loading?weeks=8`),
  ]);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  (same(summary.schedule, schedule) && same(summary.shop, shop) && same(summary.materials, materials)
    && same(summary.gates, gates) && same(summary.curves, curves) && same(summary.health, health)
    && same(summary.loading, loading) ? ok : ng)('control-summary byte parity', 'all compared sections match individual endpoints');
} finally {
  console.log('cleaning...');
  exec(`DELETE FROM payment_requests WHERE invoice_id IN (SELECT i.id FROM invoices i JOIN contracts c ON c.id = i.contract_id WHERE c.contract_no LIKE 'PERF-CT-%')`);
  exec(`DELETE FROM invoices WHERE contract_id IN (SELECT id FROM contracts WHERE contract_no LIKE 'PERF-CT-%')`);
  exec(`DELETE FROM contracts WHERE contract_no LIKE 'PERF-CT-%'`);
  exec(`DELETE FROM material_submittals WHERE submittal_code LIKE 'PERF-MSB-%'`);
  exec(`DELETE FROM materials WHERE material_code LIKE 'PERF-M-%'`);
  exec(`DELETE FROM shop_drawings WHERE drawing_code LIKE 'PERF-SD-%'`);
  exec(`DELETE FROM construction_schedule_items WHERE source_sheet = 'seed' AND project_id IN (SELECT id FROM projects WHERE code LIKE 'PERF-${stamp}-%')`);
  exec(`DELETE FROM zones WHERE project_id IN (SELECT id FROM projects WHERE code LIKE 'PERF-${stamp}-%')`);
  exec(`DELETE FROM projects WHERE code LIKE 'PERF-${stamp}-%'`);
  console.log('cleaned');
}

console.log(fail ? `\n${fail} FAILURE(S)` : '\nALL PASS');
process.exit(fail ? 1 : 0);
