// Cron chạy KHÔNG có ngữ cảnh tenant ⇒ RLS mở hatch `app_tenant_unset()`.
//
// Hệ quả: mọi truy vấn trong cron trả về dữ liệu của **mọi tenant**. Chỗ nguy
// hiểm nhất là `routes/jobs.js` chọn người nhận thông báo bằng
// `SELECT id FROM users WHERE is_ceo … OR role = 'admin'` rồi ghi
// `notifications(tenant_id = tenant của dự án, user_id = user của tenant KHÁC)`
// kèm mã dự án, mã submittal và tên PM trong nội dung. Trước khi sửa, DB đã tích
// luỹ **25 dòng** như vậy, gửi sang cả hai chiều.
//
// ⚠️ Bài kiểm này gọi `runTvgsEscalation()` **trực tiếp**, không gọi qua HTTP.
// Lý do: `POST /api/jobs/escalate-tvgs` đi qua `requireAuth` nên `requireAuth` đặt
// `app.current_tenant` ⇒ RLS vẫn khoá đúng ⇒ lỗi **không tái hiện được** và bài
// kiểm sẽ xanh trong khi cron thật thì vẫn rò. Đã viết sai một lần và phát hiện ra
// vì âm tính vẫn PASS.
//
//   node tests/e2e/cron-tenant-scope.mjs
import { api, loginAs, auth, ok, summary, psql } from './lib.mjs';
import { getDb, closeDb } from '../../backend/src/db/index.js';
import { runTvgsEscalation } from '../../backend/src/routes/jobs.js';

const db = getDb();

const homeTenant = 1;
const otherTenant = Number(psql('SELECT id FROM tenants WHERE id <> 1 ORDER BY id LIMIT 1'));
const otherUser = psql(`SELECT id FROM users WHERE tenant_id = ${otherTenant} AND role = 'admin' LIMIT 1`);

ok(Boolean(otherTenant) && Boolean(otherUser),
  `có tenant thứ hai để thử rò — tenant=${otherTenant} admin=#${otherUser || 'không có'}`);

const subId = Number(psql(`
  INSERT INTO material_submittals
    (project_id, status, submittal_code, supervisor_deadline, submitted_date, created_at)
  SELECT id, 'SUBMITTED', 'TST-CRON-' || (EXTRACT(EPOCH FROM now())::bigint % 100000),
         CURRENT_DATE - INTERVAL '9 days', CURRENT_DATE - INTERVAL '9 days', now()
  FROM projects WHERE id = 1 AND pm_user_id IS NULL
  RETURNING id`));

try {
  ok(Boolean(subId), `tạo submittal quá hạn trên dự án chưa có PM (để chạy nhánh gửi admin) — #${subId}`);

  if (subId) {
    await runTvgsEscalation();

    const mine = psql(`
      SELECT count(*) FROM notifications n
      JOIN users u ON u.id = n.user_id
      WHERE n.resource_id = ${subId} AND n.resource_type = 'material_submittal'`);
    ok(Number(mine) >= 1, `cron chạy và sinh thông báo cho submittal này (${mine} dòng)`);

    // Khẳng định cốt lõi: mọi thông báo của submittal phải tới user CÙNG tenant.
    const leaked = psql(`
      SELECT count(*) FROM notifications n
      JOIN users u ON u.id = n.user_id
      WHERE n.resource_id = ${subId} AND n.resource_type = 'material_submittal'
        AND u.tenant_id <> n.tenant_id`);
    ok(leaked === '0',
      `không thông báo nào của submittal này tới user tenant khác (thấy ${leaked})`);

    // Và không được im lặng: phải có ít nhất một admin/CEO cùng tenant nhận.
    const sameTenant = psql(`
      SELECT count(*) FROM notifications n
      JOIN users u ON u.id = n.user_id
      WHERE n.resource_id = ${subId} AND n.resource_type = 'material_submittal'
        AND u.tenant_id = n.tenant_id`);
    ok(Number(sameTenant) >= 1, `và vẫn có người cùng tenant nhận (${sameTenant} dòng)`);
  }
} finally {
  if (subId) {
    // Phải `await`: `runAsync` trả promise, bỏ await thì `closeDb()` đóng kết nối
    // trước khi câu xoá chạy → dòng thử nằm lại trong DB. Đã mắc đúng lỗi này.
    await db.prepare("DELETE FROM notifications WHERE resource_id = ? AND resource_type = 'material_submittal'").runAsync(subId);
    await db.prepare('DELETE FROM material_submittals WHERE id = ?').runAsync(subId);
  }
  await closeDb();
  const left = psql("SELECT count(*) FROM material_submittals WHERE submittal_code LIKE 'TST-CRON-%'");
  ok(left === '0', `đã dọn sạch (còn ${left})`);
  const stillLeaked = psql(`
    SELECT count(*) FROM notifications n JOIN users u ON u.id = n.user_id
    WHERE u.tenant_id <> n.tenant_id`);
  ok(stillLeaked === '0', `toàn DB không còn dòng rò chéo tenant (còn ${stillLeaked})`);

  // Đường HTTP thì phải **giới hạn theo tenant của người bấm**. `POST /escalate-tvgs`
  // trước đây gọi hàm không tham số nên admin tenant 1 bấm một cái là tenant khác nhận
  // thông báo, và phản hồi trả về mã của tenant khác. Nay
  // `runTvgsEscalation(scopeTenantId)` và route truyền `req.user.tenant_id`.
  const H = auth(await loginAs('admin@hbg.com'));
  const scoped = await api('/api/jobs/escalate-tvgs', { method: 'POST', headers: H, body: '{}' });
  ok(scoped.status === 200, `POST /api/jobs/escalate-tvgs trả HTTP ${scoped.status}`);
  ok(/^tenant \d+$/.test(String(scoped.data?.scope || '')),
    `phản hồi ghi rõ phạm vi theo tenant (thấy "${scoped.data?.scope}")`);
  const crossItems = (scoped.data?.items || []).filter((i) => Number(i.project_tenant_id) !== 1);
  ok(crossItems.length === 0, `không xử lý submittal của tenant khác (thấy ${crossItems.length})`);

  const status = await api('/api/jobs/escalate-tvgs/status', { headers: H });
  ok(status.data?.last_result === null || status.data?.last_result?.items === undefined,
    'GET /status không trả danh sách mã của mọi tenant cho một admin đơn lẻ');
}

summary();
