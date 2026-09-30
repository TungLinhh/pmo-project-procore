// Thông báo có bị gửi chéo khách hàng không?
//
// `user_ids` / `notify_to_user_ids` đi thẳng từ body của client, còn `tenantId` lấy
// từ `req.user.tenant_id`. Trước khi sửa, `services/notify.js` **không** kiểm
// người nhận có cùng tenant hay không — dù comment ngay trên hàm đã ghi
// *"tenantId is REQUIRED (no silent cross-tenant writes)"*. Hậu quả: admin tenant A
// gửi được thông báo của mình cho user tenant B, và dòng `notifications` sinh ra
// mang `tenant_id` của A với `user_id` của B — không ai đọc được, dữ liệu bị bỏ
// rơi.
//
// Cùng lớp với `routes/jobs.js` (mục 11.15 trong `docs/CODEBASE_BUG_AUDIT.md` — 25
// dòng đã lọt trong DB trước khi sửa).
//
//   node tests/e2e/notify-tenant-scope.mjs
import { api, loginAs, auth, ok, summary, psql } from './lib.mjs';

const hbg = auth(await loginAs('admin@hbg.com'));
const otherTenant = Number(psql('SELECT id FROM tenants WHERE id <> 1 ORDER BY id LIMIT 1'));
const otherUser = Number(psql(`SELECT id FROM users WHERE tenant_id = ${otherTenant} ORDER BY id LIMIT 1`));
const ownUser = Number(psql(`SELECT id FROM users WHERE tenant_id = 1 AND role = 'admin' ORDER BY id LIMIT 1`));

ok(Boolean(otherTenant && otherUser && ownUser),
  `có user của cả hai tenant để thử (tenant ${otherTenant} user#${otherUser}, tenant 1 user#${ownUser})`);

try {
  // 1. Gửi cho user CÙNG tenant → phải nhận.
  if (!(otherTenant && otherUser && ownUser)) throw new Error('thiếu user để thử');
  const ok1 = await api('/api/notifications', {
    method: 'POST', headers: hbg,
    body: JSON.stringify({ user_ids: [ownUser], title: 'TST-NOTIFY-OK', body: 'thử cùng tenant' }),
  });
  ok(ok1.status === 200 && ok1.data?.count === 1,
    `gửi cho user cùng tenant thành công (HTTP ${ok1.status}, count=${ok1.data?.count})`);

  // 2. Gửi cho user tenant KHÁC → phải bị loại, và `count` phải phản ánh điều đó.
  const bad = await api('/api/notifications', {
    method: 'POST', headers: hbg,
    body: JSON.stringify({ user_ids: [ownUser, otherUser], title: 'TST-NOTIFY-X', body: 'thử chéo tenant' }),
  });
  ok(bad.status === 200, `POST /api/notifications trả HTTP ${bad.status}`);
  ok(bad.data?.count === 1,
    `chỉ 1/2 người nhận được thông báo (count=${bad.data?.count}, mong đợi 1)`);
  ok(Array.isArray(bad.data?.rejected) && bad.data.rejected.some((r) => Number(r.userId) === otherUser),
    `danh sách rejected nêu đúng id của tenant khác (${JSON.stringify(bad.data?.rejected)})`);

  // 3. Và bằng chứng quyết định: trong DB không được có dòng nào nối tenant khác.
  const crossed = psql(`
    SELECT count(*) FROM notifications n
    JOIN users u ON u.id = n.user_id
    WHERE u.tenant_id <> n.tenant_id`);
  ok(crossed === '0', `DB không có dòng thông báo nào nối tenant của người nhận khác tenant (thấy ${crossed})`);

  const mine = psql(`SELECT count(*) FROM notifications WHERE title = 'TST-NOTIFY-X' AND user_id = ${otherUser}`);
  ok(mine === '0', `user tenant khác không nhận được dòng thông báo của tenant mình (thấy ${mine})`);
} finally {
  psql("DELETE FROM notifications WHERE title LIKE 'TST-NOTIFY-%'");
  const left = psql("SELECT count(*) FROM notifications WHERE title LIKE 'TST-NOTIFY-%'");
  ok(left === '0', `đã dọn thông báo thử (còn ${left})`);
}

summary();
