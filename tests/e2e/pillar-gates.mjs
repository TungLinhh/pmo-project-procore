// Pillar gates E2E (SRS Mục 2.5 + 5): GET trạng thái liên thông + PUT cấu hình
// PMO + audit. Env-driven (BASE_URL, PGHOST/PGPORT/…/PSQL_BIN), tự dọn rác.
import { psqlQuery, apiBase } from '../tools/env.mjs';
import { cleanupProjectsOnExit } from './lib-cleanup.mjs';

const BASE = apiBase();
let pass = 0, fail = 0;
const ok = (name, detail) => { pass++; console.log(`  PASS — ${name}: ${detail}`); };
const ng = (name, detail) => { fail++; console.log(`  FAIL — ${name}: ${detail}`); };


// Dọn dự án thử nghiệm nếu bài dừng giữa chừng — xem `lib-cleanup.mjs`.
cleanupProjectsOnExit(['GATE-%', 'GATE2-%'], { label: 'pillar-gates' });
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

// Throwaway project (xóa cuối test).
const code = `GATE-${Date.now()}`;
const proj = await api(T, '/api/projects', { method: 'POST', body: JSON.stringify({ code, name_vi: 'Gate test' }) });
const PID = proj.data?.id;
if (!PID) { ng('create project', JSON.stringify(proj.data).slice(0, 160)); console.log(`${fail} FAILURE(S)`); process.exit(1); }
ok('create project', `id=${PID}`);

// Snapshot tenant defaults có sẵn (để finally khôi phục, không phá config PMO).
const TENANT_ID = exec(`SELECT tenant_id FROM projects WHERE id = ${PID}`);
const tenantSnap = exec(`SELECT from_pillar || '|' || to_pillar || '|' || (CASE WHEN enabled THEN 1 ELSE 0 END) || '|' || threshold_pct || '|' || COALESCE(note, '') FROM pillar_gate_configs WHERE tenant_id = ${TENANT_ID} AND project_id = 0 ORDER BY from_pillar, to_pillar`);

try {
  // 1. GET gates trên project trống → 200, đủ 5 gates + 4 layers, L2-L4 WAITING.
  const g0 = await api(T, `/api/projects/${PID}/pillar-gates`);
  if (g0.status !== 200) ng('GET gates', `status=${g0.status}`);
  else {
    const gates = g0.data?.gates || [];
    const layers = g0.data?.layers || [];
    (gates.length === 5 ? ok : ng)('5 gates', gates.map((g) => g.id).join(','));
    (layers.length === 4 ? ok : ng)('4 layers', layers.map((l) => `L${l.layer}:${l.state}`).join(' '));
    const l2 = layers.find((l) => l.pillar === 'material');
    (l2?.state === 'WAITING' && l2?.blocked_by?.includes('G1') ? ok : ng)('L2 chờ điều kiện', JSON.stringify(l2).slice(0, 120));
    (g0.data?.feedback?.state ? ok : ng)('feedback G5', g0.data?.feedback?.state || 'missing');
  }

  // 2. PUT config: tắt G1 → L2 READY (không chặn).
  const put1 = await api(T, `/api/projects/${PID}/pillar-gates`, {
    method: 'PUT', body: JSON.stringify({ gates: [{ from: 'shop', to: 'material', enabled: false }] }),
  });
  if (put1.status !== 200) ng('PUT disable G1', `status=${put1.status} ${JSON.stringify(put1.data).slice(0, 120)}`);
  else ok('PUT disable G1', 'saved');
  const g1 = await api(T, `/api/projects/${PID}/pillar-gates`);
  const l2b = g1.data?.layers?.find((l) => l.pillar === 'material');
  const g1row = g1.data?.gates?.find((g) => g.id === 'G1');
  (g1row?.state === 'DISABLED' && l2b?.state === 'READY' ? ok : ng)('G1 tắt → L2 READY', `G1=${g1row?.state} L2=${l2b?.state}`);

  // 3. PUT ngưỡng 0 cho G2/G3/G4 → L3+L4 thoát WAITING do thiếu dữ liệu? Không:
  // ngưỡng 0 vẫn WAITING khi chưa có dữ liệu nguồn (thiết kế) — kiểm tra G4.
  const put2 = await api(T, `/api/projects/${PID}/pillar-gates`, {
    method: 'PUT', body: JSON.stringify({ gates: [{ from: 'manpower', to: 'payment', enabled: true, threshold_pct: 0 }] }),
  });
  if (put2.status !== 200) ng('PUT threshold G4=0', `status=${put2.status}`);
  else ok('PUT threshold G4=0', 'saved');
  const g2 = await api(T, `/api/projects/${PID}/pillar-gates`);
  const g4 = g2.data?.gates?.find((g) => g.id === 'G4');
  (g4?.threshold_pct === 0 ? ok : ng)('G4 threshold persisted', `got ${g4?.threshold_pct}`);

  // 4. PUT gate lạ → 400.
  const bad = await api(T, `/api/projects/${PID}/pillar-gates`, {
    method: 'PUT', body: JSON.stringify({ gates: [{ from: 'shop', to: 'shop' }] }),
  });
  (bad.status === 400 ? ok : ng)('unknown gate 400', `status=${bad.status}`);

  // 5. Audit log ghi nhận cấu hình gate.
  const audit = await api(T, `/api/audit?resource_type=pillar_gate_config&resource_id=${PID}&limit=5`);
  (Array.isArray(audit.data) && audit.data.length > 0 ? ok : ng)('audit gate config', `rows=${audit.data?.length ?? '?'}`);

  // 6. Tenant scope: tắt G2 ở tenant → scope=tenant; project mới kế thừa.
  const putT = await api(T, `/api/projects/${PID}/pillar-gates`, {
    method: 'PUT', body: JSON.stringify({ scope: 'tenant', gates: [{ from: 'shop', to: 'manpower', enabled: false }] }),
  });
  (putT.status === 200 ? ok : ng)('PUT tenant scope', `status=${putT.status}`);
  const gT = await api(T, `/api/projects/${PID}/pillar-gates`);
  const g2t = gT.data?.gates?.find((g) => g.id === 'G2');
  (g2t?.state === 'DISABLED' && g2t?.scope === 'tenant' ? ok : ng)('G2 tenant DISABLED', `state=${g2t?.state} scope=${g2t?.scope}`);
  const proj2 = await api(T, '/api/projects', { method: 'POST', body: JSON.stringify({ code: `GATE2-${Date.now()}` }) });
  const PID2 = proj2.data?.id;
  const gN = await api(T, `/api/projects/${PID2}/pillar-gates`);
  const g2n = gN.data?.gates?.find((g) => g.id === 'G2');
  (g2n?.state === 'DISABLED' && g2n?.scope === 'tenant' ? ok : ng)('new project inherits tenant', `state=${g2n?.state} scope=${g2n?.scope}`);
  // Override project thắng tenant: bật lại G2 ở PID2.
  await api(T, `/api/projects/${PID2}/pillar-gates`, {
    method: 'PUT', body: JSON.stringify({ gates: [{ from: 'shop', to: 'manpower', enabled: true }] }),
  });
  const gO = await api(T, `/api/projects/${PID2}/pillar-gates`);
  const g2o = gO.data?.gates?.find((g) => g.id === 'G2');
  (g2o?.scope === 'project' ? ok : ng)('project beats tenant', `scope=${g2o?.scope}`);
  exec(`DELETE FROM pillar_gate_configs WHERE project_id = ${PID2}`);
  exec(`DELETE FROM projects WHERE id = ${PID2}`);
} finally {
  exec(`DELETE FROM pillar_gate_configs WHERE project_id = ${PID} OR project_id = 0`);
  for (const line of tenantSnap.split('\n').filter(Boolean)) {
    const [fp, tp, en, th, ...noteParts] = line.split('|');
    const note = noteParts.join('|').replace(/'/g, "''");
    exec(`INSERT INTO pillar_gate_configs (tenant_id, project_id, from_pillar, to_pillar, enabled, threshold_pct, note, updated_by) VALUES (${TENANT_ID}, 0, '${fp}', '${tp}', ${en === '1'}, ${th}, ${note ? `'${note}'` : 'NULL'}, 1)`);
  }
  exec(`DELETE FROM projects WHERE id = ${PID}`);
  ok('cleanup', `project ${PID} removed`);
}

console.log(fail ? `\n${fail} FAILURE(S)` : '\nALL PASS');
process.exit(fail ? 1 : 0);
