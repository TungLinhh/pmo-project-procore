// Permission Matrix — canonical role model (see PERMISSION_MATRIX below).
// Roles: ADMIN, CEO (is_ceo flag), PM, PMO, SITE, TECHNICAL, PROCUREMENT, ACCOUNTING.
// Matrix: role × module × action × scope (all | own | assigned | false).
// Modules: schedule, shop, material, payment, issue, master_data, kpi, directive,
//          approval, audit, file_upload, daily_report, contract, invoice, control,
//          work_item  (16 — danh sách này trước đây thiếu 3 module cuối, đọc dễ tin
//          rằng `daily_report`/`contract`/`invoice` nằm ngoài ma trận)
// Actions: read, write, approve, apply (`control` còn có `apply` cho kịch bản pillar)
// Scope: all | own (project mình quản lý) | assigned (nơi được gán)
//
// PHẠM VI: ma trận phủ 16 module nghiệp vụ. Các hệ thống ngoài danh sách này
// (`bim`, `jobs`, `erp`, `ai`, `admin`, `sso`, `manpower-plan`, `kpi-targets`) KHÔNG
// đi qua `canAccess()` — chúng chỉ chốt bằng `requireRole(...)` ở route. Đo 2026-09-28
// bằng `scripts/list-unmatrixed-writes.mjs`: 117 route ghi không gọi `requirePermission`,
// trong đó 28 mở cho `ceo` mà ma trận chỉ cho CEO ghi ở `directive`/`approval`/`control`.
// Xem `docs/DATA_DECISIONS_REQUIRED.md` mục 16 — cần người ký, tôi không tự quyết.
import { getDb } from '../db/index.js';

export const PERMISSION_MATRIX = {
  // Technical/design: owns pillar 1 on assigned projects, no control layer.
  TECHNICAL: {
    schedule: { read: 'assigned', write: false },
    shop: { read: 'assigned', write: 'assigned', approve: false },
    material: { read: 'assigned', write: false },
    payment: { read: 'assigned', write: false },
    issue: { read: 'assigned', write: 'assigned' },
    master_data: { read: 'assigned', write: false },
    kpi: { read: 'assigned', write: false },
    directive: { read: 'assigned', write: false },
    approval: { read: 'assigned', write: false },
    audit: { read: 'assigned', write: false },
    file_upload: { read: 'assigned', write: 'assigned' },
    daily_report: { read: 'assigned', write: 'assigned' },
    contract: { read: 'assigned', write: false },
    invoice: { read: 'assigned', write: false },
    control: { read: false, write: false, apply: false },
    work_item: { read: 'assigned', write: 'assigned' },
  },
  // PM: Toàn bộ module, project mình quản lý
  //      Ghi: Schedule, Issue, Daily progress trong project mình
  //      Duyệt: Shop drawing, Material submittal (project mình)
  PM: {
    schedule: { read: 'own', write: 'own' },
    shop: { read: 'own', write: 'own', approve: 'own' },
    material: { read: 'own', write: 'own', approve: 'own' },
    payment: { read: 'own', write: 'own', approve: 'own' },
    issue: { read: 'own', write: 'own' },
    master_data: { read: 'own', write: false },
    kpi: { read: 'own', write: false },
    directive: { read: 'own', write: 'own' },
    approval: { read: 'own', write: false },
    audit: { read: 'own', write: false },
    file_upload: { read: 'own', write: 'own' },
    daily_report: { read: 'own', write: 'own' },
    contract: { read: 'own', write: false },
    invoice: { read: 'own', write: false },
    control: { read: 'own', write: 'own', apply: false },
    work_item: { read: 'own', write: 'own' },
  },
  // PMO: quản lý và kiểm soát các project được phân công.
  PMO: {
    schedule: { read: 'assigned', write: false },
    shop: { read: 'assigned', write: false, approve: 'assigned' },
    material: { read: 'assigned', write: false, approve: 'assigned' },
    payment: { read: 'assigned', write: 'assigned', approve: 'assigned' },
    issue: { read: 'assigned', write: false },
    master_data: { read: 'assigned', write: 'assigned' },
    kpi: { read: 'assigned', write: 'assigned' },
    directive: { read: 'assigned', write: 'assigned' },
    approval: { read: 'assigned', write: false },
    audit: { read: 'assigned', write: false },
    file_upload: { read: 'assigned', write: 'assigned' },
    daily_report: { read: 'assigned', write: false },
    contract: { read: 'assigned', write: false },
    invoice: { read: 'assigned', write: false },
    control: { read: 'assigned', write: 'assigned', apply: false },
    work_item: { read: 'assigned', write: 'assigned' },
  },
  // Site: Project/zone được gán
  //       Ghi: Daily progress, Material, Issue, Photo (chỉ nơi được gán)
  //       Duyệt: Không
  SITE: {
    schedule: { read: 'assigned', write: 'assigned' }, // site cập nhật % tiến độ (PATCH item), không sửa bulk
    shop: { read: 'assigned', write: 'assigned', approve: false },
    material: { read: 'assigned', write: 'assigned' },
    payment: { read: false, write: false },
    issue: { read: 'assigned', write: 'assigned' },
    master_data: { read: false, write: false },
    kpi: { read: false, write: false },
    directive: { read: 'assigned', write: false },
    approval: { read: false, write: false },
    audit: { read: 'assigned', write: 'assigned' },
    file_upload: { read: 'assigned', write: 'assigned' },
    daily_report: { read: 'assigned', write: 'assigned' },
    contract: { read: false, write: false },
    invoice: { read: false, write: false },
    control: { read: false, write: false, apply: false },
    work_item: { read: 'assigned', write: 'assigned' },
  },
  // Procurement: vật tư được phân công, không dùng Control Layer.
  PROCUREMENT: {
    schedule: { read: 'assigned', write: false },
    shop: { read: 'assigned', write: false, approve: false },
    material: { read: 'assigned', write: 'assigned' },
    payment: { read: 'assigned', write: false },
    issue: { read: 'assigned', write: false },
    master_data: { read: 'assigned', write: 'assigned' },
    kpi: { read: 'assigned', write: false },
    directive: { read: 'assigned', write: false },
    approval: { read: false, write: false },
    audit: { read: 'assigned', write: false },
    file_upload: { read: 'assigned', write: 'assigned' },
    daily_report: { read: 'assigned', write: false },
    contract: { read: 'assigned', write: false },
    invoice: { read: 'assigned', write: false },
    control: { read: false, write: false, apply: false },
    work_item: { read: 'assigned', write: false },
  },
  // Accounting: hồ sơ thanh toán được phân công, không dùng Control Layer.
  ACCOUNTING: {
    schedule: { read: 'assigned', write: false },
    shop: { read: 'assigned', write: false, approve: false },
    material: { read: 'assigned', write: false },
    payment: { read: 'assigned', write: 'assigned', approve: 'assigned' },
    issue: { read: 'assigned', write: false },
    master_data: { read: 'assigned', write: false },
    kpi: { read: 'assigned', write: false },
    directive: { read: 'assigned', write: false },
    approval: { read: 'assigned', write: false },
    audit: { read: 'assigned', write: false },
    file_upload: { read: 'assigned', write: 'assigned' },
    daily_report: { read: 'assigned', write: false },
    contract: { read: 'assigned', write: 'assigned' },
    invoice: { read: 'assigned', write: 'assigned' },
    control: { read: false, write: false, apply: false },
    work_item: { read: 'assigned', write: false },
  },
  // CEO: Toàn bộ
  //      Ghi: Chỉ Directive
  //      Duyệt: Có thể duyệt cấp cao nếu cần
  CEO: {
    schedule: { read: 'all', write: false },
    shop: { read: 'all', write: false, approve: 'all' },
    material: { read: 'all', write: false },
    payment: { read: 'all', write: false },
    issue: { read: 'all', write: false },
    master_data: { read: 'all', write: false },
    kpi: { read: 'all', write: false },
    directive: { read: 'all', write: 'all' },
    approval: { read: 'all', write: 'all' },
    audit: { read: 'all', write: false },
    file_upload: { read: 'all', write: false },
    daily_report: { read: 'all', write: false },
    contract: { read: 'all', write: false },
    invoice: { read: 'all', write: false },
    control: { read: 'all', write: 'all', apply: 'all' },
    work_item: { read: 'all', write: false },
  },
};

// Admin bypasses the matrix. CEO keeps the SRS approval/control scope and
// must not gain ordinary data-entry privileges through a middleware shortcut.
export const FULL_ACCESS_ROLES = ['ADMIN'];

export function getPermissions(role) {
  if (FULL_ACCESS_ROLES.includes(role?.toUpperCase())) {
    // Return 'all' for all modules/actions
    const all = {};
    for (const m of Object.keys(PERMISSION_MATRIX.PM)) {
      all[m] = { read: 'all', write: 'all', approve: 'all' };
    }
    return all;
  }
  return PERMISSION_MATRIX[role?.toUpperCase()] || {};
}

// Check if user can perform action on module in a specific project scope.
// Admin bypasses the matrix. CEO and PMO use explicit SRS scopes.
// projectId: optional — null means list-level (scope not checkable, module gate only).
//   'own'      = project.pm_user_id matches, or member (membership is operational source)
//   'assigned' = project_members row
export async function canAccess(role, module, action, projectId = null, userId = null) {
  const r = role?.toUpperCase();
  if (FULL_ACCESS_ROLES.includes(r)) return true;
  const perms = PERMISSION_MATRIX[r];
  if (!perms) return false;
  const mod = perms[module];
  if (!mod) return false;
  const scope = mod[action];
  if (scope === false || scope === undefined) return false;
  if (scope === 'all') return true;
  if (!projectId) return true; // list-level: module gate only
  const db = getDb();
  if (scope === 'own') {
    const p = await db.prepare('SELECT pm_user_id FROM projects WHERE id = ?').getAsync(projectId).catch(() => null);
    if (p && p.pm_user_id != null && Number(p.pm_user_id) === Number(userId)) return true;
  }
  const m = await db.prepare('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?').getAsync(projectId, userId).catch(() => null);
  return !!m;
}
