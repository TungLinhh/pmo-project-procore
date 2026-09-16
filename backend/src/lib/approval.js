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
// Nested departments (Wave D2): walk bottom-up — project dept → ancestors →
// tenant default. First configured chain wins.
export async function resolveChain(db, tenantId, projectId, resourceType) {
  if (!CHAINABLE_RESOURCES.includes(resourceType)) return null;
  let departmentId = null;
  if (projectId) {
    const p = await db.prepare('SELECT department_id FROM projects WHERE id = ?').getAsync(projectId);
    departmentId = p?.department_id ?? null;
  }
  const chain = departmentId
    ? await Promise.all((await departmentAncestors(db, tenantId, departmentId)).map((id) =>
        db.prepare(
          'SELECT levels FROM approval_chains WHERE tenant_id = ? AND department_id = ? AND resource_type = ?'
        ).getAsync(tenantId, id, resourceType)
      )).then((rows) => rows.find((r) => r)?.levels)
    : null;
  if (chain) return chain;
  const def = await db.prepare(
    'SELECT levels FROM approval_chains WHERE tenant_id = ? AND department_id IS NULL AND resource_type = ?'
  ).getAsync(tenantId, resourceType);
  return def?.levels ?? null;
}

// Ancestor line bottom-up: [self, parent, grandparent, ...]. Cycle-guarded
// (a corrupt cycle terminates instead of looping forever).
export async function departmentAncestors(db, tenantId, departmentId) {
  const line = [];
  const seen = new Set();
  let cur = departmentId;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    line.push(cur);
    const row = await db.prepare('SELECT parent_id FROM departments WHERE id = ? AND tenant_id = ?').getAsync(cur, tenantId);
    cur = row?.parent_id ?? null;
  }
  return line;
}

// Validate a departments.parent_id assignment: same tenant, not self, acyclic.
export async function validateDeptParent(db, tenantId, deptId, parentId) {
  if (parentId == null) return { ok: true };
  if (parentId === deptId) return { ok: false, error: 'parent_id cannot be itself' };
  const parent = await db.prepare('SELECT id FROM departments WHERE id = ? AND tenant_id = ?').getAsync(parentId, tenantId);
  if (!parent) return { ok: false, error: 'Parent department not found in this tenant' };
  const line = await departmentAncestors(db, tenantId, parentId);
  if (line.includes(deptId)) return { ok: false, error: `parent would create a cycle: ${deptId} → ${line.join(' → ')}` };
  return { ok: true };
}

// Does this user satisfy the role required by a chain level?
// ADMIN/CEO bypass (same rule as the permission matrix).
export function satisfiesLevel(user, requiredRole) {
  const role = getUserRole(user);
  if (FULL_ACCESS_ROLES.includes(role)) return true;
  return role === String(requiredRole).toUpperCase();
}
