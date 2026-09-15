// Small pure helpers: SLA deadline, offline conflict resolution, role name.
// Status transitions → ./transitions.js. Permissions → ./permissions.js.
import { getPermissions } from './permissions.js';

// ===== Material Submittal SLA =====
export function computeSlaDeadline(submittedDate, slaDays = 7) {
  if (!submittedDate) return null;
  const d = new Date(submittedDate);
  d.setDate(d.getDate() + slaDays);
  return d.toISOString().slice(0, 10);
}

// ===== Last-write-wins conflict resolution (offline sync) =====
export function resolveConflict(clientTs, serverTs) {
  const c = new Date(clientTs).getTime();
  const s = new Date(serverTs).getTime();
  if (c > s) return { winner: 'CLIENT', clientNewer: true, serverNewer: false };
  if (s > c) return { winner: 'SERVER', clientNewer: false, serverNewer: true };
  return { winner: 'EQUAL', clientNewer: false, serverNewer: false };
}

// ===== Role name (CEO comes from the is_ceo flag, not a role value) =====
export function getUserRole(user) {
  if (!user) return null;
  if (user.is_ceo) return 'CEO';
  return user.role?.toUpperCase() || null;
}

// Module-level check against the canonical matrix (no project scope here;
// use canAccess() from permissions.js when a projectId is available).
export function hasPermission(user, module, action = 'read') {
  const role = getUserRole(user);
  if (!role) return false;
  const scope = getPermissions(role)?.[module]?.[action];
  return scope === 'all' || scope === 'own' || scope === 'assigned';
}
