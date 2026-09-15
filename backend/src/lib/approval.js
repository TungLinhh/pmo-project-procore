// Approval chains — flexible per-department levels (Wave 2).
// Resolve: (department, resource_type) → tenant default → null (legacy).
// Max 5 levels: shop_drawings stores responses in bql_l1..l5 columns.
import { FULL_ACCESS_ROLES, PERMISSION_MATRIX } from './permissions.js';
import { getUserRole } from './validation.js';

export const MAX_CHAIN_LEVELS = 5;
export const CHAINABLE_RESOURCES = ['shop_drawing', 'material_submittal'];
const KNOWN_ROLES = new Set([...Object.keys(PERMISSION_MATRIX), ...FULL_ACCESS_ROLES]);

export function validateLevels(levels) {
  if (!Array.isArray(levels) || levels.length < 1 || levels.length > MAX_CHAIN_LEVELS) {
    return { ok: false, error: `levels must be an array of 1-${MAX_CHAIN_LEVELS}` };
  }
  for (const [i, lv] of levels.entries()) {
    if (lv?.level !== i + 1) return { ok: false, error: `levels[${i}].level must be ${i + 1}` };
    if (typeof lv?.role !== 'string' || !KNOWN_ROLES.has(lv.role.trim().toUpperCase())) {
      return { ok: false, error: `levels[${i}].role must be one of: ${[...KNOWN_ROLES].join(', ')}` };
    }
  }
  return { ok: true };
}

// Effective chain for a (project, resource). Returns levels array or null
// (null = no chain configured → legacy single-step transition stays allowed).
export async function resolveChain(db, tenantId, projectId, resourceType) {
  if (!CHAINABLE_RESOURCES.includes(resourceType)) return null;
  let departmentId = null;
  if (projectId) {
    const p = await db.prepare('SELECT department_id FROM projects WHERE id = ?').getAsync(projectId);
    departmentId = p?.department_id ?? null;
  }
  if (departmentId) {
    const row = await db.prepare(
      'SELECT levels FROM approval_chains WHERE tenant_id = ? AND department_id = ? AND resource_type = ?'
    ).getAsync(tenantId, departmentId, resourceType);
    if (row) return row.levels;
  }
  const def = await db.prepare(
    'SELECT levels FROM approval_chains WHERE tenant_id = ? AND department_id IS NULL AND resource_type = ?'
  ).getAsync(tenantId, resourceType);
  return def?.levels ?? null;
}

// Does this user satisfy the role required by a chain level?
// ADMIN/CEO bypass (same rule as the permission matrix).
export function satisfiesLevel(user, requiredRole) {
  const role = getUserRole(user);
  if (FULL_ACCESS_ROLES.includes(role)) return true;
  return role === String(requiredRole).toUpperCase();
}
