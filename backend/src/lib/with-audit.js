// Audit-friendly transaction wrapper
// Gộp business action + audit log trong 1 transaction.
//   const result = await withAudit(req, { action, resourceType, resourceId, ... },
//     async (client) => { /* business using `client` */ return updatedRow; });
//
// Nếu audit log fail → business cũng rollback (và ngược lại)
// Nếu không truyền businessFn → chỉ ghi audit (cho read-only events)

import { tx } from './tx.js';
import { currentUser } from './auth.js';
import { getDb } from '../db/index.js';

export async function withAudit(req, auditMeta, businessFn) {  // Nếu businessFn = null/undefined: chỉ ghi audit, không transaction
  if (typeof businessFn !== 'function') {
    // Audit-only path: DbWrapper has no .auditLog() method — insert directly
    // instead of silently dropping (the old `db.auditLog?.()` was always undefined).
    const db = getDb();
    const u = currentUser(req);
    if (!u) throw new Error('Unauthorized: no session user');
    await db.prepare(
      `INSERT INTO audit_log (tenant_id, user_id, user_name, action, resource_type, resource_id, context, before, after, field_changes, actor_role, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).runAsync(
      u.tenant_id,
      u.id,
      u.name,
      auditMeta.action || 'UNKNOWN',
      auditMeta.resourceType || null,
      auditMeta.resourceId ?? null,
      auditMeta.context ? JSON.stringify(auditMeta.context) : null,
      auditMeta.before ? JSON.stringify(auditMeta.before) : null,
      auditMeta.after ? JSON.stringify(auditMeta.after) : null,
      auditMeta.fieldChanges ? JSON.stringify(auditMeta.fieldChanges) : null,
      u.role,
      auditMeta.note || null,
    );
    return null;
  }

  return await tx(async (client) => {
    // Business action với client
    const raw = await businessFn(client);
    // Deferred audit (e.g. sync CLIENT apply): business returns
    // { value, before, after } and those fill the audit row. Otherwise
    // before/after/fieldChanges come from auditMeta as usual.
    const deferred = auditMeta.defer === true && raw && typeof raw === 'object' && 'value' in raw;
    const result = deferred ? raw.value : raw;
    const before = deferred ? raw.before : auditMeta.before;
    const after = deferred ? raw.after : auditMeta.after;
    const resourceId = deferred && raw.resource_id != null
      ? raw.resource_id
      : resolveResourceId(auditMeta.resourceId, result);
    // Audit log cùng transaction
    const u = currentUser(req);
    if (!u) throw new Error('Unauthorized: no session user');
    await client.query(
      `INSERT INTO audit_log (tenant_id, user_id, user_name, action, resource_type, resource_id, context, before, after, field_changes, actor_role, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        u.tenant_id,
        u.id,
        u.name,
        auditMeta.action || 'UNKNOWN',
        auditMeta.resourceType || null,
        resourceId,
        auditMeta.context ? JSON.stringify(auditMeta.context) : null,
        before ? JSON.stringify(before) : null,
        after ? JSON.stringify(after) : null,
        auditMeta.fieldChanges ? JSON.stringify(auditMeta.fieldChanges) : null,
        u.role,
        auditMeta.note || null,
      ]
    );
    return result;
  });
}

// Suy ra `audit_log.resource_id`.
//
// Vì sao cần: 28 call site (đếm 2026-09-28) truyền `resourceId: 0` vì lúc gọi
// `withAudit` thì dòng chưa tồn tại — id chỉ có **sau** INSERT, mà dòng audit lại ghi
// trong cùng transaction. Hậu quả đo được: mọi dòng `CREATE` trong `audit_log` có
// `resource_id = 0`, tức **không truy được** sự kiện nào tạo ra dòng nào, và
// `WHERE resource_id = 0` gộp nhầm sự kiện của mọi dự án/tenant (đó là lý do
// `concurrency.mjs` đếm được 5 dòng `PREVIEW` của người khác).
//
// Thứ tự ưu tiên:
//   1. `defer` + `resource_id` trong kết quả callback (xử lý ở trên) — rõ ràng nhất.
//   2. `auditMeta.resourceId` nếu là **số nguyên dương** — lời gọi tường minh thắng.
//   3. `id` của dòng mà callback trả về (các call site tạo mới đều `return ins.rows[0]`).
//   4. `null` — thành thật hơn `0`: `0` là id giả và trùng nhau giữa mọi sự kiện.
function resolveResourceId(explicit, result) {
  if (Number.isInteger(explicit) && explicit > 0) return explicit;
  if (result && typeof result === 'object' && Number.isInteger(result.id) && result.id > 0) {
    return result.id;
  }
  return null;
}

// Canonical name for "business + audit in one transaction" (see lib/tx.js).
// withAudit is kept as an alias — all existing callers stay untouched.
export const txAudit = withAudit;
