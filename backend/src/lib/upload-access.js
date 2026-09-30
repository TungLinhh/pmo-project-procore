import { checkProjectAccess } from './project-access.js';

const isGlobalRole = (user) => user?.role === 'admin' || !!user?.is_ceo || user?.role === 'pmo';

// A committed upload is visible only through its project. A staged upload has
// no project yet, so only its uploader or a governance role **cùng tenant** may
// see it.
//
// Vì sao so `tenant_id` ở đây dù RLS đã chặn: `file_uploads` có policy
// `app_tenant_unset() OR tenant_id = app_current_tenant()`, nên trong đường request
// thì SELECT đã bị chặn trước khi tới hàm này — đo được bằng
// `tests/e2e/upload-tenant-scope.mjs` (tenant 1 đọc upload STAGED của tenant 2
// → 404). Nhưng RLS là **một** lớp, và nó mở hatch ở đúng những chỗ nguy hiểm
// nhất: cron và việc nền không có `app.current_tenant` (xem `docs/AGENTS.md` và
// mục 11.15 trong `docs/CODEBASE_BUG_AUDIT.md` — ở đó `routes/jobs.js` đã lột
// 25 dòng thông báo chéo tenant vì câu truy vấn không tự khoá tenant).
// `APP_DATABASE_URL` trỏ nhầm sang role `BYPASSRLS` thì hàm này là chốt chặn cuối.
export async function canAccessUpload(user, upload) {
  if (!user || !upload) return false;
  // Chặn sớm nhất, trước cả nhánh có project: nếu dòng đã lọt tới đây mà khác
  // tenant thì không có lý do gì để tin phần còn lại.
  if (upload.tenant_id != null && Number(upload.tenant_id) !== Number(user.tenant_id)) return false;
  if (upload.project_id) return checkProjectAccess(user, Number(upload.project_id));
  if (isGlobalRole(user)) return true;
  return upload.created_by != null && Number(upload.created_by) === Number(user.id);
}

export async function requireUploadAccess(user, upload) {
  return !!(upload && await canAccessUpload(user, upload));
}

export const uploadGlobalRole = isGlobalRole;
