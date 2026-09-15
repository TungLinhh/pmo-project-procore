// Audit helper — Single-call log with full JSON snapshot.
//
// Usage:
//   await db.audit({
//     userId, userName, userRole,
//     action: 'STATUS_CHANGE',                  // CREATE | UPDATE | STATUS_CHANGE | APPROVE | REJECT | DIRECTIVE | ARCHIVE | ...
//     resourceType: 'shop_drawing',             // table name
//     resourceId: 123,
//     context: { project_id: 1, project_code: 'BTE', zone_id: 3, zone_code: 'BOH', issue_id: null },
//     before: { status: 'REVIEW', ... },        // full row BEFORE (null for CREATE)
//     after:  { status: 'APPROVED', ... },      // full row AFTER (null for DELETE)
//     fieldChanges: [{ field: 'status', from: 'REVIEW', to: 'APPROVED' }],  // optional
//     note: 'Phê duyệt bởi CEO',                // optional
//   });
//
// Tất cả INSERT audit_log nên dùng helper này để có:
//   - Full JSON snapshot (before, after)
//   - Context (project/zone/issue for filtering)
//   - Field changes (for quick diff visual)
//   - Actor info (user_id, user_name, role)
//
// Old INSERT audit_log vẫn hoạt động (backward compat) nhưng không có context+changes.

import { getDb } from './index.js';

export async function auditLog(opts) {
  const {
    userId = null,
    userName = null,
    userRole = null,
    action,
    resourceType = null,
    resourceId = null,
    context = null,
    before = null,
    after = null,
    fieldChanges = null,
    note = null,
  } = opts;

  if (!action) throw new Error('auditLog: action is required');

  const db = getDb();
  // Auto-stringify JSON columns for PG
  const ctx = context ? JSON.stringify(context) : null;
  const bef = before ? JSON.stringify(before) : null;
  const aft = after ? JSON.stringify(after) : null;
  const fc = fieldChanges ? JSON.stringify(fieldChanges) : null;

  await db.prepare(`
    INSERT INTO audit_log (
      tenant_id, user_id, user_name, actor_role, action,
      resource_type, resource_id,
      before, after, context, field_changes, note
    ) VALUES (
      1, ?, ?, ?, ?,
      ?, ?,
      ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?
    )
  `).runAsync(
    userId, userName, userRole, action,
    resourceType, resourceId,
    bef, aft, ctx, fc, note
  );
}

// Helper: build field_changes by diffing before vs after (shallow).
// Returns array of { field, from, to } for fields that differ.
export function diffFields(before, after) {
  if (!before || !after) return null;
  const changes = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    if (k === 'updated_at' || k === 'created_at' || k === 'id') continue;
    const a = before[k];
    const b = after[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      changes.push({ field: k, from: a, to: b });
    }
  }
  return changes.length ? changes : null;
}
