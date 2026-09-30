// Gọi `checkProjectAccess` bên trong transaction sẽ lấy connection THỨ HAI từ
// pool trong lúc transaction đang giữ một. Với `PG_POOL_MAX=10`, đủ 10 request
// `POST /api/sync/resolve` chạy song song thì cả 10 đều giữ transaction **và** đều
// chờ connection thứ hai ⇒ không request nào giải phóng được ⇒ treo tới hết
// `connectionTimeoutMillis` rồi lỗi.
//
// Đo trước khi sửa: **13 699 ms** và `timeout exceeded when trying to connect`.
// Sau khi sửa: **97 ms**, 12/12 trả 200. Chạm được từ tablet hiện trường trên mạng
// yếu — và lỗi này không bộ kiểm nào bắt vì chúng đều chạy tuần tự.
//
//   node tests/e2e/sync-pool.mjs
import { loginAs, auth, ok, summary, psql } from './lib.mjs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const H = auth(await loginAs('admin@hbg.com'));
// Vượt PG_POOL_MAX (10) để chắc chắn có request phải chờ connection thứ hai.
const N = Number(process.env.N || 12);

// `project_id` không nằm trên hàng queue — nó lấy từ **bản ghi máy chủ** qua
// `server_record_id` (`lib/sync-apply.js:69`). Trỏ vào một dòng thật thuộc dự án 1,
// nếu không nhánh `checkProjectAccess` không bao giờ chạy và bài kiểm xanh vì lý do sai.
const target = Number(psql('SELECT id FROM construction_schedule_items WHERE project_id = 1 ORDER BY id LIMIT 1'));
ok(Boolean(target), `có hạng mục thật của dự án 1 để trỏ server_record_id (#${target || 'không có'})`);

const stamp = Date.now().toString().slice(-6);
const ids = [];
for (let i = 0; i < N; i += 1) {
  const id = psql(`INSERT INTO offline_sync_queue
      (user_id, device_id, client_id, resource_type, resource_json, client_timestamp, status, server_record_id)
    VALUES (1, 'tstpool-${stamp}', 'tstpool-${stamp}-${i}',
            'construction_schedule_item', '{"progress_pct":0.5}', now(), 'PENDING', ${target})
    RETURNING id`);
  if (id) ids.push(Number(id));
}
ok(ids.length === N, `tạo ${N} mục sync PENDING (thấy ${ids.length})`);

try {
  if (ids.length) {
    const t0 = Date.now();
    const results = await Promise.all(ids.map((id) => fetch(`${BASE}/api/sync/resolve`, {
      method: 'POST', headers: H, body: JSON.stringify({ queue_id: id, winner: 'CLIENT' }),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))
      .catch((e) => ({ status: 0, body: { error: String(e).slice(0, 60) } }))));
    const ms = Date.now() - t0;

    const codes = {};
    for (const r of results) codes[r.status] = (codes[r.status] || 0) + 1;
    console.log(`  ${N} request trong ${ms}ms · mã trả: ${JSON.stringify(codes)}`);

    const bad = results.filter((r) => r.status === 0 || r.status >= 500);
    ok(bad.length === 0,
      `không request nào lỗi kết nối hoặc 5xx${bad.length ? ` (${bad.length} lỗi, ví dụ "${bad[0].body?.error}")` : ''}`);
    ok(ms < 5000,
      `hoàn tất dưới 5 giây (${ms}ms) — chết pool thì phải chờ hết connectionTimeoutMillis (10s)`);
  }
} finally {
  for (const id of ids) psql(`DELETE FROM offline_sync_queue WHERE id = ${id}`);
  const left = psql("SELECT count(*) FROM offline_sync_queue WHERE device_id LIKE 'tstpool-%'");
  ok(left === '0', `đã dọn (còn ${left})`);
}

summary();
