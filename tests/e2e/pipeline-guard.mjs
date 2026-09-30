// PIPELINE GUARD: full upload→commit→pillar→approve→pay→sync on a SCRATCH DB.
// Covers the linkage CI otherwise misses (wizard API → ingestors → pillars).
// Synthetic workbooks only (shapes copied from step1-01/02 + daily-wizard) —
// no /mnt/c paths, no dev-DB mutation. Drops the scratch DB afterwards.
// Run: node tests/e2e/pipeline-guard.mjs
import { waitForServer } from './lib.mjs';
import { execSync, spawn } from 'node:child_process';
import { writeFileSync, readFileSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { userInfo } from 'node:os';
const XLSX = (await import('xlsx')).default;

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const PG = { host: process.env.PGHOST || '127.0.0.1', port: process.env.PGPORT || '5433', user: process.env.PGUSER || 'pmo_user', password: process.env.PGPASSWORD || 'pmo_dev_pwd' };
const ADMIN_PG = {
  host: process.env.PGHOST_ADMIN || (process.env.PGUSER_ADMIN ? PG.host : '/tmp'),
  port: process.env.PGPORT_ADMIN || PG.port,
  user: process.env.PGUSER_ADMIN || process.env.USER || userInfo().username,
};
const DBNAME = process.env.PIPELINE_DBNAME || 'pmo_pipeline';
const FRESH_URL = `postgresql://${PG.user}:${PG.password}@${PG.host}:${PG.port}/${DBNAME}`;
const PORT = Number(process.env.PIPELINE_PORT || 3244);
const BASE = process.env.BASE_URL || `http://127.0.0.1:${PORT}`;
const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const sh = (cmd, env = {}) => execSync(cmd, { encoding: 'utf8', cwd: ROOT, env: { ...process.env, ...env }, timeout: 180000 });

// --- scratch DB ---
execSync(`${process.env.PSQL_BIN || 'psql'} -h ${ADMIN_PG.host} -p ${ADMIN_PG.port} -U ${ADMIN_PG.user} -d postgres -c "DROP DATABASE IF EXISTS ${DBNAME};"`, { encoding: 'utf8' });
execSync(`psql -h ${ADMIN_PG.host} -p ${ADMIN_PG.port} -U ${ADMIN_PG.user} -d postgres -c "CREATE DATABASE ${DBNAME} OWNER ${PG.user};"`, { encoding: 'utf8' });
sh('node backend/src/db/init.js', { DATABASE_URL: FRESH_URL });
ok(true, 'scratch DB init ok');

// Cấp quyền cho **app role** trên database sạt.
//
// Vì sao cần: request pool chạy bằng role riêng (`APP_DB_USER`, mặc định `pmo_app` —
// least privilege, xem `deploy/production/00-backup-role.sh` cho mẫu cấp quyền của
// `pmo_backup`). Grant **gắn theo database**, nên role có quyền trên `pmo` chưa chắc
// có trên `pmo_pipeline` mới tạo. Không cấp thì mọi request của server sạt trả
// `500 permission denied for table …` — đo 2026-09-28: `GET /api/dashboard` trả
// `500 permission denied for table health_thresholds` trên DB sạch, trong khi gate
// (chạy trên DB dev) không bao giờ thấy.
//
// Nhân vật chạy ở đây là **admin** (migrate/seed) — đúng vai trò mà lệnh cấp quyền
// chạy ngoài đời, không phải app role.
{
  const appUser = process.env.APP_DB_USER || 'pmo_app';
  const grant = [
    `GRANT CONNECT ON DATABASE ${DBNAME} TO ${appUser};`,
    `GRANT USAGE ON SCHEMA public TO ${appUser};`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${appUser};`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${appUser};`,
  ].join(' ');
  execSync(`psql -h ${ADMIN_PG.host} -p ${ADMIN_PG.port} -U ${ADMIN_PG.user} -d ${DBNAME} -c "${grant}"`, { encoding: 'utf8' });
  ok(true, `app role ${appUser} được cấp quyền trên ${DBNAME}`);
}

const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: FRESH_URL, PORT: String(PORT), LOGIN_RATE_MAX: '1000' }, stdio: 'ignore', cwd: ROOT });
await waitForServer(BASE);

const qp = (db, sql) => execSync(`PGPASSWORD=${PG.password} ${process.env.PSQL_BIN || 'psql'} -h ${PG.host} -p ${PG.port} -U ${PG.user} -d ${db} -t -A -c "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim().split('\n')[0];
try {
  const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) }).then(r => r.json());
  ok(!!login.token, 'login on scratch DB');
  const T = login.token;
  const H = { Authorization: `Bearer ${T}` };
  const J = { ...H, 'Content-Type': 'application/json' };
  const post = (p, b) => fetch(BASE + p, { method: 'POST', headers: J, body: JSON.stringify(b) }).then(async r => {
    const text = await r.text();
    try { return { s: r.status, j: JSON.parse(text) }; }
    catch { return { s: r.status, j: { _raw: text.slice(0, 160), _path: p } }; }
  });
  const get = (p) => fetch(BASE + p, { headers: H }).then(r => r.json());

  const proj = await post('/api/projects', { code: `PIPE-${Date.now()}` });
  ok(!!proj.j?.id, `throwaway project (id=${proj.j?.id})`);
  const PID = proj.j.id;

  async function ingest(buffer, filename, docType, zone) {
    const fd = new FormData();
    fd.append('file', new Blob([buffer]), filename);
    const up = await fetch(BASE + '/api/upload', { method: 'POST', headers: H, body: fd }).then(r => r.json());
    if (!up.upload_id) return { error: up.error || 'stage failed' };
    const body = { project_id: PID, doc_type: docType };
    if (zone) body.new_zone = { code: zone };
    const cfg = await post(`/api/upload/${up.upload_id}/configure`, body);
    if (cfg.s !== 200) return { error: cfg.j?.error || 'configure failed' };
    return post(`/api/upload/${up.upload_id}/commit`, {});
  }

  // 1. schedule (CSP shape)
  const schedAoa = [
    ['TỔNG TIẾN ĐỘ THI CÔNG/GENERAL SCHEDULE'],
    [null, null, null, 'Stt/No', 'Công việc thi công/Work', '% Hoàn thành', 'Tình trạng', 'Ngày bắt đầu', null, 'Ngày kết thúc', null, 'Số ngày'],
    [null, null, null, null, null, null, null, 'KH', 'TT', 'KH', 'TT'],
    [null, null, null, null, 'PGZ'],
    [null, null, null, 1, 'Lắp đặt ống', 1, 'YES', new Date(2024, 0, 1), new Date(2024, 0, 1), new Date(2024, 0, 10), new Date(2024, 0, 10), 10],
    [null, null, null, 2, 'Kéo dây', 0.5, 'NO', new Date(2024, 0, 5), null, new Date(2024, 0, 20), null, 16],
  ];
  const schedWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(schedWb, XLSX.utils.aoa_to_sheet(schedAoa), 'MEP-PIPE-CSP-PGZ');
  const schedBuf = XLSX.write(schedWb, { type: 'buffer', bookType: 'xlsx' });
  const schedRes = await ingest(schedBuf, 'pipe-schedule.xlsx', 'construction_schedule', 'PGZ');
  ok(schedRes.s === 200 && (schedRes.j?.status === 'SUCCESS' || schedRes.j?.ok >= 2), `schedule commit (got ${schedRes.s}/${schedRes.j?.status || schedRes.j?.error})`);
  const sched = await get(`/api/projects/${PID}/construction-schedule`);
  ok(Array.isArray(sched) && sched.length === 2, `2 schedule items readable (got ${sched?.length})`);
  ok(sched.some(s => s.status === 'DONE') && sched.some(s => s.status === 'IN_PROGRESS'), 'derived statuses DONE + IN_PROGRESS');

  // 2. shop (BTE shape)
  const shopAoa = [
    ['SHOPDRAWING SUBMISSION FOR APPROVAL'],
    [null, null, null, null, 'STT', 'Mã Hiệu', 'Tên bản vẽ', '% HT', null, 'Lần 1', null, null, null, 'Lần 2', 'Ngày phê duyệt', 'Ghi chú'],
    [null, null, null, null, null, null, null, null, null, 'Dự kiến', 'Thực tế', 'Phản hồi', null, 'Dự kiến', null, null],
    [null, null, null, null, null, null, null, null, null, null, null, 'BQL', 'Ngày', null, null, null],
    [1, null, null, null, null, 'PIPE-SHD-001', 'Sơ đồ nguyên lý', 0.9, null, new Date(2024, 0, 10), new Date(2024, 0, 12), 'R', new Date(2024, 0, 20), new Date(2024, 1, 1), new Date(2024, 2, 1), 'note'],
    [2, null, null, null, null, 'PIPE-SHD-002', 'Mặt bằng', 1, null, new Date(2024, 0, 10), null, null, null, null, null, null],
  ];
  const shopWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(shopWb, XLSX.utils.aoa_to_sheet(shopAoa), 'SHOP PGZ');
  const shopBuf = XLSX.write(shopWb, { type: 'buffer', bookType: 'xlsx' });
  const shopRes = await ingest(shopBuf, 'pipe-shop.xlsx', 'shop_drawing', 'PGZ');
  ok(shopRes.s === 200, `shop commit (got ${shopRes.s}/${shopRes.j?.status || shopRes.j?.error})`);
  const shops = await get(`/api/projects/${PID}/shop-drawings`);
  ok(Array.isArray(shops) && shops.length === 2, `2 shop drawings readable (got ${shops?.length})`);

  // 3. daily (C20 shape)
  const blank = (n) => { const r = Array(n).fill(null); r[32] = '.'; return r; };
  const grid = Array.from({ length: 85 }, () => blank(33));
  grid[1][24] = 'Tester';
  grid[27][0] = 1; grid[27][1] = 'Parent work'; grid[27][2] = 'note';
  grid[28][7] = 1; grid[28][8] = 'Sub A'; grid[28][10] = 2.5;
  grid[28][11] = '2021-05-23'; grid[28][12] = '2021-05-24'; grid[28][13] = 0; grid[28][14] = 0.5;
  grid[42][7] = 2; grid[42][8] = 'Mat A';
  grid[42][11] = '2021-05-23'; grid[42][12] = '2021-05-24'; grid[42][13] = 0; grid[42][14] = 0.3;
  grid[63][10] = 'Team A'; grid[63][19] = 10; grid[63][25] = 2; grid[63][31] = 1;
  grid[64][0] = 1; grid[64][2] = 5;
  const dailyWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(dailyWb, XLSX.utils.aoa_to_sheet(grid), '23.5.2021');
  const dailyBuf = XLSX.write(dailyWb, { type: 'buffer', bookType: 'xlsx' });
  const dailyRes = await ingest(dailyBuf, 'pipe-daily.xlsx', 'daily_report');
  ok(dailyRes.s === 200 && dailyRes.j?.status === 'SUCCESS', `daily commit (got ${dailyRes.s}/${dailyRes.j?.status || dailyRes.j?.error})`);
  const drs = await get(`/api/projects/${PID}/daily-reports`);
  ok(Array.isArray(drs) && drs.length === 1, `daily report readable (got ${drs?.length})`);

  // 4. pillars reflect committed rows
  const dash = await get('/api/dashboard');
  ok(Number(dash.projects_active) === 2, `dashboard counts scratch projects (got ${dash?.projects_active})`);
  const otd = await get(`/api/projects/${PID}/otd`);
  ok(typeof otd.otd_pct === 'number', `OTD computed (got ${otd?.otd_pct})`);

  // 5. payment chain on scratch data
  const ct = await post(`/api/projects/${PID}/contracts`, { contract_no: 'PIPE-CT-1', total_value: 1000000 });
  const inv = await post(`/api/contracts/${ct.j?.id}/invoices`, { invoice_no: 'PIPE-INV-1', amount: 100000 });
  const pr = await post(`/api/invoices/${inv.j?.id}/payment-requests`, { request_no: 'PIPE-PR-1', amount: 90000 });
  const ap = await fetch(BASE + `/api/payment-requests/${pr.j?.id}`, { method: 'PUT', headers: J, body: JSON.stringify({ status: 'APPROVED' }) }).then(async r => ({ s: r.status, j: await r.json() }));
  const pay = await post(`/api/payment-requests/${pr.j?.id}/payments`, { paid_amount: 90000 });
  ok(ct.j?.id && inv.j?.id && pr.j?.id && ap.s === 200 && pay.s === 201, 'contract→invoice→PR→approve→pay chain');
  const prs = await get(`/api/projects/${PID}/payment-requests?limit=50`);
  ok(prs.some(p => p.status === 'PAID') && typeof prs[0]?.amount === 'number', 'PAID visible, amounts numeric');

  // 6. approve a shop drawing + CLIENT sync apply
  const sd = shops.find(s => s.status === 'SUBMITTED') || shops[0];
  if (sd.status !== 'SUBMITTED') await post(`/api/shop-drawings/${sd.id}/transition`, { to_status: 'SUBMITTED' });
  const apsd = await post(`/api/shop-drawings/${sd.id}/transition`, { to_status: 'APPROVED' });
  ok(apsd.s === 200, 'shop approve (legacy single-step, no chain)');
  const itemId = qp(DBNAME, `SELECT id FROM construction_schedule_items WHERE project_id = ${PID} AND status = 'IN_PROGRESS' LIMIT 1;`);
  const qid = qp(DBNAME, `INSERT INTO offline_sync_queue (user_id, resource_type, server_record_id, resource_json, client_timestamp) VALUES (1, 'construction_schedule_item', ${itemId}, '{"progress_pct": 0.9}', now()) RETURNING id;`);
  const res2 = await post('/api/sync/resolve', { queue_id: Number(qid), winner: 'CLIENT' });
  ok(res2.s === 200 && Number(qp(DBNAME, `SELECT progress_pct FROM construction_schedule_items WHERE id = ${itemId};`)) === 0.9, 'CLIENT sync apply on scratch data');
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1500));
}

// --- drop scratch ---
execSync(`${process.env.PSQL_BIN || 'psql'} -h ${ADMIN_PG.host} -p ${ADMIN_PG.port} -U ${ADMIN_PG.user} -d postgres -c "DROP DATABASE IF EXISTS ${DBNAME};"`, { encoding: 'utf8' });
ok(true, 'scratch database dropped');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
