// Permission Matrix — canonical role model (see PERMISSION_MATRIX below).
// Roles: ADMIN, CEO (is_ceo flag), PM, PMO, SITE, PROCUREMENT, ACCOUNTING.
// Matrix: role × module × action × scope (all | own | assigned | false).
// Modules: schedule, shop, material, payment, issue, master_data, kpi, directive, approval, audit, file_upload
// Actions: read, write, approve
// Scope: all | own (project mình quản lý) | assigned (nơi được gán)
import { getDb } from '../db/index.js';

export const PERMISSION_MATRIX = {
  // PM: Toàn bộ module, project mình quản lý
  //      Ghi: Schedule, Issue, Daily progress trong project mình
  //      Duyệt: Shop drawing, Material submittal (project mình)
  PM: {
    schedule: { read: 'own', write: 'own' },
    shop: { read: 'own', write: 'own', approve: 'own' },
    material: { read: 'own', write: 'own' },
    payment: { read: 'own', write: false },
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
  },
  // PMO: Toàn bộ module, mọi project
  //      Ghi: KPI target, Master data
  //      Duyệt: Không duyệt nghiệp vụ, chỉ xem portfolio
  PMO: {
    schedule: { read: 'all', write: false },
    shop: { read: 'all', write: false, approve: false },
    material: { read: 'all', write: false },
    payment: { read: 'all', write: false },
    issue: { read: 'all', write: false },
    master_data: { read: 'all', write: 'all' },
    kpi: { read: 'all', write: 'all' },
    directive: { read: 'all', write: 'all' },
    approval: { read: 'all', write: false },
    audit: { read: 'all', write: false },
    file_upload: { read: 'all', write: 'all' },
    daily_report: { read: 'all', write: false },
    contract: { read: 'all', write: false },
    invoice: { read: 'all', write: false },
  },
  // Site: Project/zone được gán
  //       Ghi: Daily progress, Material, Issue, Photo (chỉ nơi được gán)
  //       Duyệt: Không
  SITE: {
    schedule: { read: 'assigned', write: 'assigned' }, // site cập nhật % tiến độ (PATCH item), không sửa bulk
    shop: { read: 'assigned', write: false, approve: false },
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
  },
  // Procurement: Material, Supplier, Subcontractor, mọi project
  //              Ghi: Material submittal, Supplier, Subcontractor
  //              Duyệt: Không
  PROCUREMENT: {
    schedule: { read: 'all', write: false },
    shop: { read: 'all', write: false, approve: false },
    material: { read: 'all', write: 'all' },
    payment: { read: 'all', write: false },
    issue: { read: 'all', write: false },
    master_data: { read: 'all', write: 'all' },
    kpi: { read: 'all', write: false },
    directive: { read: 'all', write: false },
    approval: { read: false, write: false },
    audit: { read: 'all', write: false },
    file_upload: { read: 'all', write: 'all' },
    daily_report: { read: 'all', write: false },
    contract: { read: 'all', write: false },
    invoice: { read: 'all', write: false },
  },
  // Accounting: Contract, Invoice, Payment, mọi project
  //             Ghi: Contract, Invoice, Payment request
  //             Duyệt: Không
  ACCOUNTING: {
    schedule: { read: 'all', write: false },
    shop: { read: 'all', write: false, approve: false },
    material: { read: 'all', write: false },
    payment: { read: 'all', write: 'all' },
    issue: { read: 'all', write: false },
    master_data: { read: 'all', write: false },
    kpi: { read: 'all', write: false },
    directive: { read: 'all', write: false },
    approval: { read: 'all', write: false },
    audit: { read: 'all', write: false },
    file_upload: { read: 'all', write: 'all' },
    daily_report: { read: 'all', write: false },
    contract: { read: 'all', write: 'all' },
    invoice: { read: 'all', write: 'all' },
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
  },
};

// Admin/CEO bypass: full access mọi module mọi action
export const FULL_ACCESS_ROLES = ['ADMIN', 'CEO'];

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
// Roles 'ADMIN'/'CEO' (resolved by the caller from role + is_ceo) bypass.
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
