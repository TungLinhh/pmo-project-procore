// Upload chưa có project (`project_id IS NULL`) của tenant này có bị tenant kia
// đọc được không?
//
// `lib/upload-access.js` trả `true` cho mọi `isGlobalRole(user)` khi upload chưa có
// project — mà **không so sánh `tenant_id`**. Về mặt code đó là lỗi rò, nhưng
// `file_uploads` có RLS `app_tenant_unset() OR tenant_id = app_current_tenant()`.
//
// Bài kiểm này đo thật thay vì tin lập luận: tạm nâng tenant 2 lên `enterprise`
// (tenant 1 đã là enterprise) để **cả hai** cùng qua được gate gói tính năng, dựng
// một upload STAGED của tenant 2, rồi thử đọc bằng admin tenant 1 theo đúng đường
// HTTP. Cuối bài luôn khôi phục plan của tenant 2.
//
//   node tests/e2e/upload-tenant-scope.mjs
import { api, loginAs, auth, ok, summary, psql } from './lib.mjs';
import { canAccessUpload } from '../../backend/src/lib/upload-access.js';

const hbg = auth(await loginAs('admin@hbg.com'));
const pilot = auth(await loginAs('admin@pilot.test'));

const otherTenant = Number(psql('SELECT id FROM tenants WHERE id <> 1 ORDER BY id LIMIT 1'));
ok(Boolean(otherTenant), `có tenant thứ hai để thử rò (tenant=${otherTenant})`);

const originalPlan = psql(`SELECT plan FROM tenants WHERE id = ${otherTenant}`);
let uploadId = null;
try {
  // Cả hai tenant phải cùng plan thì mới so được quyền — nếu không, admin tenant 2
  // bị chặn ở `requireFeature` với 403 và bài kiểm "pass" vì lý do sai.
  psql(`UPDATE tenants SET plan = 'enterprise' WHERE id = ${otherTenant}`);
  const planNow = psql(`SELECT plan FROM tenants WHERE id = ${otherTenant}`);
  ok(planNow === 'enterprise',
    `tạm nâng tenant ${otherTenant} lên enterprise để so được quyền (đang là "${planNow}", gốc "${originalPlan}")`);

  // Upload STAGED của tenant 2: đúng trạng thái sau `POST /api/upload` không kèm
  // `project_code` (xem `routes/upload.js`).
  uploadId = Number(psql(`
    INSERT INTO file_uploads
      (tenant_id, project_id, original_filename, file_hash, status, file_size, created_by, created_at)
    SELECT ${otherTenant}, NULL, 'TST-TENANT-STAGED.xlsx',
           'tst-tenant-scope-' || (EXTRACT(EPOCH FROM now())::bigint % 100000),
           'STAGED', 123, NULL, now()
    RETURNING id`));
  ok(Boolean(uploadId), `dựng upload STAGED của tenant ${otherTenant} — #${uploadId}`);

  if (uploadId) {
    // Chủ sở hữu thật phải đọc được — nếu không thì các khẳng định dưới pass vì
    // lý do sai.
    const own = await api(`/api/uploads/${uploadId}`, { headers: pilot });
    ok(own.status === 200, `chủ upload (tenant ${otherTenant}) đọc được của mình (HTTP ${own.status})`);

    // Tenant 1 đọc upload STAGED của tenant 2.
    const cross = await api(`/api/uploads/${uploadId}`, { headers: hbg });
    ok(cross.status === 404,
      `admin tenant 1 KHÔNG đọc được upload STAGED của tenant ${otherTenant} (HTTP ${cross.status})`);

    // Và cả đường tải bytes — chỗ nặng nhất, vì đây là nội dung tệp thật.
    const dl = await api(`/api/uploads/${uploadId}/download`, { headers: hbg });
    ok([404, 403].includes(dl.status),
      `admin tenant 1 KHÔNG tải được bytes của upload tenant ${otherTenant} (HTTP ${dl.status})`);

    // Gọi thẳng hàm kiểm quyền. Phần HTTP ở trên **không** bắt được lỗi ở đây:
    // RLS chặn trước nên dù xoá so sánh `tenant_id` thì HTTP vẫn 404 và bài kiểm
    // vẫn xanh. Chỉ gọi trực tiếp mới thấy — đo được, không lập luận.
    const { canAccessUpload: direct } = { canAccessUpload };
    const fakeRow = { id: uploadId, tenant_id: otherTenant, project_id: null, created_by: null };
    ok((await direct({ id: 1, tenant_id: 1, role: 'admin' }, fakeRow)) === false,
      'canAccessUpload chặn hẳn dòng thuộc tenant khác, kể cả admin/CEO');
    ok((await direct({ id: 1, tenant_id: 1, role: 'admin' }, { ...fakeRow, tenant_id: 1 })) === true,
      'canAccessUpload vẫn cho admin cùng tenant xem upload STAGED (không chặn nhầm)');
    ok((await direct({ id: 1, tenant_id: 1, role: 'pm' }, { ...fakeRow, tenant_id: 1, created_by: 9 })) === false,
      'và vẫn chặn người không cùng tenant khi không phải vai trò quản trị');

    // Danh sách review của tenant 1 không được chứa upload của tenant 2.
    // Phản hồi nay là object `{rows, scanned, skipped_no_access, has_more}` — trước đây
    // là mảng thô, và `LIMIT 200` được cắt **trước** khi lọc quyền nên hàng đợi có thể
    // trông rỗng với người chỉ được xem một project trong tenant nhiều project.
    const list = await api('/api/uploads/review?limit=200', { headers: hbg });
    if (list.status === 200 && Array.isArray(list.data?.rows)) {
      const leaked = list.data.rows.filter((r) => Number(r.id) === uploadId);
      ok(leaked.length === 0,
        `queue review của tenant 1 không chứa upload tenant ${otherTenant} (thấy ${leaked.length})`);
      ok(typeof list.data.skipped_no_access === 'number' && typeof list.data.has_more === 'boolean',
        `phản hồi báo số dòng bị bỏ vì thiếu quyền và còn dòng nữa không `
        + `(skipped=${list.data.skipped_no_access}, has_more=${list.data.has_more})`);
      ok(list.data.rows.length <= 200,
        `số dòng trả về không vượt limit yêu cầu (${list.data.rows.length} ≤ 200)`);
    } else {
      ok(false, `GET /api/uploads/review trả HTTP ${list.status}, rows=${Array.isArray(list.data?.rows)}`);
    }
  }
} finally {
  if (uploadId) psql(`DELETE FROM file_uploads WHERE id = ${uploadId}`);
  // Luôn khôi phục plan, kể cả khi khẳng định ở trên đã FAIL.
  if (originalPlan) psql(`UPDATE tenants SET plan = '${originalPlan}' WHERE id = ${otherTenant}`);
  const planBack = psql(`SELECT plan FROM tenants WHERE id = ${otherTenant}`);
  ok(planBack === originalPlan, `đã khôi phục plan của tenant ${otherTenant} (còn "${planBack}")`);
  const left = psql("SELECT count(*) FROM file_uploads WHERE original_filename LIKE 'TST-TENANT-%'");
  ok(left === '0', `đã dọn upload thử (còn ${left})`);
}

summary();
