// Sửa + ẩn (xoá mềm) + kích hoạt lại danh mục chủ.
//
//   node tests/e2e/master-data-crud.mjs
//
// Bài kiểm tự tạo bản ghi riêng (mã `TST-CRUD-*`) và tự xoá cứng bằng `psql` ở cuối
// — không có API xoá cứng (xoá mềm là chủ ý), nên dọn dẹp phải đi thẳng DB.
//
// Bốn bẫy đã mắc khi làm bài này, giữ lại để người sau không mắc lại:
//  1. `withAudit` đưa vào client `pg` **thô** — chỉ hiểu `$N`. Dùng `?` ở đây
//     khiến Postgres nhận `?` làm toán tử và báo `syntax error at or near "AND"`.
//  2. `status` là **enum** `master_status`, không phải text. Gửi sai giá trị thì
//     Postgres ném `22P02`; nếu `catch` trả 500 thì người dùng thấy "Lỗi máy chủ"
//     mà không biết giá trị hợp lệ là gì.
//  3. Route generic `PATCH /:resource/:id` phải đứng **sau** `PATCH /departments/:id`.
//     Đảo thứ tự thì bộ phận rơi vào route generic và mất kiểm tra chống vòng lặp
//     `parent_id`.
//  4. Xoá mềm giữ bản ghi, nên "dọn bằng DELETE" là dọn hỏng — phải xoá cứng.
import { api, loginAs, auth, J, ok, summary, psql } from './lib.mjs';

const T = await loginAs('admin@hbg.com');
const H = auth(T);
const CODE = `TST-CRUD-${Date.now().toString(36).toUpperCase()}`;

const created = await api('/api/master-data/vendors', { method: 'POST', ...J(T, {
  code: CODE, name: 'NCC thử CRUD', category: 'Thiết bị', status: 'ACTIVE', contact: '090 000 00 99',
}) });
ok(created.status === 201 && created.data?.id, `tạo NCC (mã ${CODE}) — status=${created.status}`);
const id = created.data?.id;

const patch = (body) => api(`/api/master-data/vendors/${id}`, { method: 'PATCH', headers: H, body: JSON.stringify(body) });
const del = () => api(`/api/master-data/vendors/${id}`, { method: 'DELETE', headers: H });
const restore = () => api(`/api/master-data/vendors/${id}/restore`, { method: 'POST', headers: H });

// ---- sửa ------------------------------------------------------------------
if (id) {
  const r = await patch({ name: 'NCC đã sửa tên', category: 'Vật tư' });
  ok(r.status === 200 && r.data?.name === 'NCC đã sửa tên' && r.data?.category === 'Vật tư',
    `sửa được tên + phân loại — "${r.data?.name}" / ${r.data?.category}`);

  // `code` là khoá nghiệp vụ: sửa nó âm thầm làm dữ liệu lịch sử không khớp nữa.
  const blockedCode = await patch({ code: 'KHAC' });
  ok(blockedCode.status === 400 && /code/.test(blockedCode.data?.error || ''),
    `chặn sửa mã (khoá nghiệp vụ) — ${blockedCode.status} "${blockedCode.data?.error}"`);

  // Khoá ngoại đã qua kiểm tra ở route chuyên biệt; form chung không có.
  const blockedFk = await api('/api/master-data/teams/1', { method: 'PATCH', headers: H, body: JSON.stringify({ lead_worker_id: 3 }) });
  ok(blockedFk.status === 400 && /lead_worker_id/.test(blockedFk.data?.error || ''),
    `chặn sửa khoá ngoại qua form chung — ${blockedFk.status}`);

  // Route riêng của bộ phận phải còn chạy được, tức route generic không chặn trước.
  const oldName = psql("SELECT name_vi FROM departments WHERE id = 1");
  const dept = await api('/api/master-data/departments/1', { method: 'PATCH', headers: H, body: JSON.stringify({ name_vi: 'TST-CRUD' }) });
  ok(dept.status === 200 && dept.data?.name_vi === 'TST-CRUD', `route riêng của bộ phận vẫn chạy — ${dept.status}`);
  if (dept.status === 200 && oldName) {
    await api('/api/master-data/departments/1', { method: 'PATCH', headers: H, body: JSON.stringify({ name_vi: oldName }) });
  }
  // parent_id vẫn phải qua được kiểm tra chống vòng lặp.
  const cycle = await api('/api/master-data/departments/1', { method: 'PATCH', headers: H, body: JSON.stringify({ parent_id: 1 }) });
  ok(cycle.status === 422, `parent_id tự tham chiếu vẫn bị chặn — ${cycle.status}`);

  ok((await patch({})).status === 400, 'sửa mà không gửi cột nào → 400');
  ok((await patch({ name: 'x', bogus: 1 })).status === 400, 'gửi cột không tồn tại → 400');
  ok((await api('/api/master-data/vendors/99999999', { method: 'PATCH', headers: H, body: JSON.stringify({ name: 'x' }) })).status === 404,
    'sửa bản ghi không tồn tại → 404');

  const badStatus = await patch({ status: 'PENDING' });
  ok(badStatus.status === 400 && Array.isArray(badStatus.data?.allowed_status) && badStatus.data.allowed_status.includes('ACTIVE'),
    `status sai → 400 kèm giá trị hợp lệ — ${JSON.stringify(badStatus.data?.allowed_status)}`);
  ok((await patch({ status: 'INACTIVE' })).status === 200, 'status hợp lệ → 200');
}

// ---- ẩn (xoá mềm) ---------------------------------------------------------
if (id) {
  const d1 = await del();
  ok(d1.status === 200 && d1.data?.status === 'INACTIVE', 'ẩn lần 1 → status=INACTIVE');
  ok(psql(`SELECT count(*) FROM vendors WHERE id = ${id}`) === '1',
    'bản ghi vẫn còn trong DB sau khi ẩn — xoá mềm, không phải xoá cứng');

  const d2 = await del();
  ok(d2.status === 200 && d2.data?.already_inactive === true, 'ẩn lần 2 là idempotent, không lỗi');

  const r1 = await restore();
  ok(r1.status === 200 && r1.data?.status === 'ACTIVE', 'kích hoạt lại được — status=ACTIVE');
}

// ---- bảng không có cột status → nói rõ thay vì im lặng bỏ qua -------------
const noStatus = await api('/api/master-data/business_processes/1', { method: 'DELETE', headers: H });
ok(noStatus.status === 409 && /trạng thái|status/i.test(noStatus.data?.error || ''),
  `bảng không có cột trạng thái → 409 nói rõ — "${noStatus.data?.error}"`);

ok((await api('/api/master-data/khong-ton-tai/1', { method: 'DELETE', headers: H })).status === 404, 'danh mục không tồn tại → 404');

// ---- dọn: xoá cứng, vì xoá mềm giữ bản ghi -------------------------------
if (id) {
  psql(`DELETE FROM vendors WHERE code = '${CODE}'`);
  psql(`DELETE FROM audit_log WHERE note LIKE '%vendors#${id}%' OR note LIKE '%${CODE}%'`);
  ok(psql(`SELECT count(*) FROM vendors WHERE code = '${CODE}'`) === '0', 'đã dọn sạch bản ghi thử');
}

summary();
