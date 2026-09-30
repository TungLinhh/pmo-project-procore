#!/usr/bin/env node
// Đo tải thật, không suy đoán.
//
// Trước đợt này "chưa đo tải" nằm trong danh sách chưa làm. Đo thì dễ, nhưng
// phải nói rõ đo cái gì và ở mức nào — một con số load test trên máy dev không
// nói lên được gì về máy chủ thật, nên script này báo **cảnh báo** chứ không
// tuyên bố "đạt".
//
//   node scripts/load-probe.mjs                        (mặc định 30 request)
//   REQUESTS=200 CONCURRENCY=20 node scripts/load-probe.mjs
//
// Cổnh báo chính: `/api/health` không chạm cơ sở dữ liệu, nên nó vẫn 200 khi DB
// chết. Vì vậy probe này đo cả hai: health và ready. Chỉ đo health là đo nhầm thứ
// không cần đo.
import { getDb, closeDb } from '../backend/src/db/index.js';

const db = getDb();

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const REQUESTS = Number(process.env.REQUESTS) || 30;
const CONCURRENCY = Number(process.env.CONCURRENCY) || 5;

// Phải là admin: `ceo` bị 403 ở /sync/enqueue, và 403 trả về rất nhanh nên sẽ ra
// số thời gian đẹp mà thực tế chẳng ghi gì — đo sai mà không báo lỗi.
const email = process.env.PROBE_EMAIL || 'admin@hbg.com';
const password = process.env.PROBE_PASSWORD || 'admin123';

const token = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
}).then((r) => r.json()).then((b) => b.token);

if (!token) {
  console.error('  Không đăng nhập được — dừng.');
  process.exit(1);
}

// Các endpoint đọc nhiều nhất: danh sách lớn, phân trang, tổng hợp.
const PATHS = [
  '/api/dashboard/portfolio-kpi',
  '/api/audit?limit=25',
  '/api/projects/1/shop-drawings?limit=25',
  '/api/projects/1/issues?limit=25',
  '/api/projects/1/construction-schedule?limit=200',
  '/api/ready',
];

async function timed(path) {
  const started = process.hrtime.bigint();
  try {
    const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    return { path, status: res.status, ms, ok: res.ok };
  } catch (e) {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    return { path, status: 0, ms, ok: false, error: e.message };
  }
}

// --- Đường ghi ------------------------------------------------------------
//
// Đo đọc thì dễ, nhưng phần chặn người dùng là **ghi**: duyệt, chi tiền, lưu việc
// ngoài tuyến. Đường được chọn là `POST /api/sync/enqueue` — đúng đường mà mỗi lần
// công nhân lưu việc ngoài tuyến đều đi qua, và nó có `withAudit` nên đo được cả
// chi phí ghi nhật ký chứ không chỉ INSERT.
//
// Mỗi lần ghi dùng `client_id` riêng (route khớp trùng theo `client_id` + PENDING,
// nên dùng lại sẽ bị dedupe và đo nhầm thành "ghi" trong khi thực tế chỉ là đọc).
// Cuối cùng xoá đúng những dòng đó theo tiền tố `client_id`.
const WRITE_BATCH = Number(process.env.WRITE_BATCH) || 30;
const CLIENT_PREFIX = 'loadprobe-';

async function writeOnce(i) {
  const clientId = `${CLIENT_PREFIX}${Date.now()}-${i}-${Math.random().toString(16).slice(2, 8)}`;
  const started = process.hrtime.bigint();
  const res = await fetch(`${BASE}/api/sync/enqueue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      client_id: clientId,
      resource_type: 'construction_schedule_item',
      server_record_id: null,
      resource_json: { progress_pct: 0.5, note: 'load probe' },
    }),
  }).catch((e) => ({ ok: false, status: 0, statusText: e.message }));
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  return { clientId, ms, ok: res.ok === true, status: res.status };
}

const results = [];
let cursor = 0;
async function worker() {
  while (cursor < REQUESTS) {
    cursor += 1;
    results.push(await timed(PATHS[cursor % PATHS.length]));
  }
}

const wallStarted = Date.now();
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, REQUESTS) }, worker));
const wallMs = Date.now() - wallStarted;

const sorted = results.map((r) => r.ms).sort((a, b) => a - b);
const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
const failed = results.filter((r) => !r.ok);

console.log(`  ${REQUESTS} request, ${CONCURRENCY} song song, ${wallMs}ms tổng`);
console.log(`  p50=${pct(0.5).toFixed(0)}ms  p95=${pct(0.95).toFixed(0)}ms  max=${sorted[sorted.length - 1].toFixed(0)}ms`);
console.log(`  lỗi: ${failed.length}/${results.length}`);

// Theo từng endpoint: trung bình để thấy chỗ nào nặng.
const byPath = new Map();
for (const r of results) {
  if (!byPath.has(r.path)) byPath.set(r.path, []);
  byPath.get(r.path).push(r);
}
for (const [path, list] of byPath) {
  const avg = list.reduce((a, b) => a + b.ms, 0) / list.length;
  const bad = list.filter((r) => !r.ok).length;
  console.log(`  ${path.padEnd(46)} n=${String(list.length).padStart(3)}  tb=${avg.toFixed(0)}ms${bad ? `  LỖI ${bad}` : ''}`);
}

// `/api/ready` là endpoint có truy vấn DB thật. Nó hỏng trong khi health vẫn 200
// chính là hở biết đã gặp (PostgreSQL chết 12 giờ, không ai biết).
const ready = results.filter((r) => r.path === '/api/ready');
console.log(`\n  /api/ready: ${ready.filter((r) => r.ok).length}/${ready.length} ok — đây là chỉ số phải canh.`);
if (failed.length) console.log('  Có lỗi — xem danh sách trên.');

// --- Đo đường ghi ---------------------------------------------------------
const writeResults = [];
let wcursor = 0;
async function writeWorker() {
  while (wcursor < WRITE_BATCH) {
    wcursor += 1;
    writeResults.push(await writeOnce(wcursor));
  }
}
const writeStarted = Date.now();
await Promise.all(Array.from({ length: Math.min(5, WRITE_BATCH) }, writeWorker));
const writeWall = Date.now() - writeStarted;

const wSorted = writeResults.map((r) => r.ms).sort((a, b) => a - b);
const wFail = writeResults.filter((r) => !r.ok);
console.log(`\n  GHI: ${WRITE_BATCH} lần POST /api/sync/enqueue, ${writeWall}ms tổng`);
console.log(`  p50=${wSorted[Math.floor(wSorted.length * 0.5)]?.toFixed(0)}ms  `
  + `p95=${wSorted[Math.floor(wSorted.length * 0.95)]?.toFixed(0)}ms  `
  + `max=${wSorted[wSorted.length - 1]?.toFixed(0)}ms  lỗi: ${wFail.length}/${writeResults.length}`);
if (wFail.length) console.log(`  ví dụ lỗi: ${JSON.stringify(wFail[0]).slice(0, 120)}`);

// Dọn: chỉ xoá những dòng mà chính lần này tạo, theo tiền tố client_id.
const removed = await db.prepare(
  `DELETE FROM offline_sync_queue WHERE client_id LIKE $1 RETURNING id`,
).allAsync(`${CLIENT_PREFIX}%`);
console.log(`  đã dọn ${removed.length} dòng offline_sync_queue (tiền tố "${CLIENT_PREFIX}")`);
const leftover = await db.prepare(
  'SELECT count(*)::int AS n FROM offline_sync_queue WHERE client_id LIKE $1',
).getAsync(`${CLIENT_PREFIX}%`);
if (leftover.n !== 0) {
  console.error(`  RÒ ${leftover.n} dòng — probe phải tự dọn sạch`);
  process.exitCode = 1;
}

await closeDb();
process.exit(process.exitCode || (failed.length || wFail.length ? 1 : 0));
