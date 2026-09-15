// Tenant request context — carries req.user.tenant_id across async work so the
// pool layer (db/index.js) can SET app.current_tenant (RLS GUC) on every
// checked-out connection, and tx() can SET LOCAL inside transactions.
//
// Established in requireAuth (lib/auth.js) right after the user row is loaded:
// every downstream handler in that request inherits the tenant. Requests without
// auth (login, health, refresh) run with NO tenant → RLS bootstrap hatch allows
// (migrations/seeds/auth lookups must never be filtered).
import { AsyncLocalStorage } from 'node:async_hooks';

export const TENANT_GUC = 'app.current_tenant';

const als = new AsyncLocalStorage();

export function runWithTenant(tenantId, fn) {
  return als.run({ tenantId: tenantId == null ? null : Number(tenantId) }, fn);
}

export function currentTenantId() {
  const store = als.getStore();
  const id = store?.tenantId;
  return Number.isInteger(id) ? id : null;
}

// SET app.current_tenant on a raw pg client (per-checkout, outside tx).
// Call resetTenantGuc(client) before releasing back to the pool.
export async function applyTenantGuc(client) {
  const tid = currentTenantId();
  if (tid == null) return false;
  await client.query(`SET ${TENANT_GUC} = '${tid}'`);
  return true;
}

export async function resetTenantGuc(client) {
  try { await client.query(`RESET ${TENANT_GUC}`); } catch { /* release anyway */ }
}
