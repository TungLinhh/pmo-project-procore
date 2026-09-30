---
name: pmo-rls-hatch-and-silent-failures
description: RLS hatch dùng GUC thô chặn job nền im lặng, và các bẫy "pass nhưng sai" khác trong pmo_project_procore
metadata:
  type: project
---

Ba lớp lỗi trong `pmo_project_procore` đều **không** làm test chức năng đỏ, vì
đường lỗi trả về giá trị hợp lệ:

1. **Hatch RLS viết bằng GUC thô.** Policy chuẩn phải là
   `app_tenant_unset() OR tenant_id = app_current_tenant()`, trong đó
   `app_tenant_unset()` = `coalesce(current_setting('app.current_tenant', true), '') = ''`.
   Dạng thô `current_setting('app.current_tenant', true) = ''` trả **NULL** (không
   phải TRUE) khi GUC chưa từng được SET trong phiên — đúng case của job nền, vì
   cron không có request nào mang `app.current_tenant`. `attention_digest_runs` và
   `qa_inspections` dùng dạng thô, nên digest quá hạn **không ghi được dòng run nào**
   mà vẫn log `ok` ở tầng ngoài. Đã sửa bằng `9999as`.
   Kiểm: `SELECT tablename FROM pg_policies WHERE qual LIKE '%current_setting%'
   AND qual NOT LIKE '%app_tenant_unset%'` phải trả **rỗng**.
2. **Probe sức khoẻ không bao giờ fail.** `/api/health` trả `{status:'ok'}` hardcode
   nên DB chết vẫn báo khoẻ. Đã tách `/api/ready` query thật (503 / `degraded`) và
   đổi healthcheck của `docker-compose.prod.yml` sang endpoint đó.
3. **Cột `setCols` thiếu là âm thầm giữ giá trị cũ.** `shop_drawings` upsert cố ý
   bỏ `bql_l*_response` khỏi `setCols` (ghi đè sẽ vượt `checkTransition`) — nhưng
   `approval_date` và `bql_l*_date` cũng bị bỏ theo, và đó là quyết định nghiệp vụ
   chứ không phải hệ quả. Đối soát giá trị phân loại cột đó là **advisory**: báo ra
   nhưng không tính vào tỉ lệ lỗi, và đẩy thành mục ký trong
   `docs/DATA_DECISIONS_REQUIRED.md`.

**Why:** cả ba đều cho kết quả "hợp lệ" — dòng 0 thay vì lỗi, `ok` thay vì chết,
giá trị cũ thay vì giá trị mới. Kiểm bằng mắt và bằng assert trên HTTP status
không bắt được; phải đo giá trị thật.

**How to apply:** khi thêm bảng có RLS, copy nguyên văn policy chuẩn, đừng tự viết
điều kiện GUC. Khi viết job nền, để hàm job tự gọi `runWithTenant` thay vì trông
chờ callsite. Khi đối soát dữ liệu, luôn tách ba nhóm: *đã so*, *cố ý không so*,
*khác biệt có chủ ý* — gộp chung sẽ ra một tỉ lệ lỗi không trung thực.
