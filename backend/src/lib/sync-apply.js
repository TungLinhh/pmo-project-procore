// CLIENT-wins appliers for offline sync (P4-3).
// Allowlist ONLY: anything else → 422 (never silently apply, never mark done).
// Each applier declares its table + writable fields + validators.
// Project access is checked from the server record (queue rows carry no project).
export const SYNC_APPLIERS = {
  construction_schedule_item: {
    table: 'construction_schedule_items',
    fields: {
      progress_pct: (v) => (typeof v === 'number' && v >= 0 && v <= 1 ? null : 'progress_pct must be a number 0..1'),
    },
  },
  daily_report: {
    table: 'daily_reports',
    fields: {
      notes: (v) => (typeof v === 'string' && v.length <= 2000 ? null : 'notes must be a string ≤ 2000 chars'),
    },
  },
  shop_drawing: {
    table: 'shop_drawings',
    fields: {
      notes: (v) => (typeof v === 'string' && v.length <= 2000 ? null : 'notes must be a string ≤ 2000 chars'),
    },
  },
};

// Apply item.resource_json onto item.server_record_id inside the caller's tx.
// Returns { before, after } for the audit log. Throws { status, message }.
export async function applyClientPayload(client, checkAccess, item) {
  const spec = SYNC_APPLIERS[item.resource_type];
  if (!spec) {
    throw { status: 422, message: `resource_type '${item.resource_type}' is not appliable (allowlist: ${Object.keys(SYNC_APPLIERS).join(', ')})` };
  }
  if (!item.server_record_id) {
    throw { status: 422, message: 'CLIENT winner needs server_record_id (nothing to apply onto)' };
  }
  const payload = item.resource_json && typeof item.resource_json === 'object' ? item.resource_json : {};
  const patch = {};
  for (const [field, validate] of Object.entries(spec.fields)) {
    if (!(field in payload)) continue;
    const err = validate(payload[field]);
    if (err) throw { status: 422, message: err };
    patch[field] = payload[field];
  }
  if (!Object.keys(patch).length) {
    throw { status: 400, message: `resource_json has no appliable fields (allowed: ${Object.keys(spec.fields).join(', ')})` };
  }
  const cur = await client.query(`SELECT * FROM ${spec.table} WHERE id = $1`, [item.server_record_id]);
  const before = cur.rows[0];
  if (!before) throw { status: 404, message: 'Server record not found' };
  await checkAccess(before);
  const cols = Object.keys(patch);
  const r = await client.query(
    `UPDATE ${spec.table} SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`,
    [item.server_record_id, ...cols.map((c) => patch[c])]
  );
  return { before, after: r.rows[0] };
}
