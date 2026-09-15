// Structured row-level ingest failures (schema-agnostic).
//
// PCR reality: the real report format hasn't arrived yet, so column mappings
// will churn. What must NOT churn is the failure contract: every dropped row
// comes back as { sheet, row, field, message, ref } (+ legacy `error` alias),
// so a future PCR mismatch shows up as an itemized list instead of a bare
// ok/error count ("PARTIAL" with no explanation).
//
//   - sheet: source sheet/tab name (or null)
//   - row: 1-based index within that sheet's row array (or null)
//   - field: offending column when inferable from the DB error, else null
//   - message: raw error text (always present)
//   - ref: human identifier from the row (code/name) when available
//   - keep: extra legacy keys (name/code/ordinal/…) so old readers keep working
//
// Counts ({ ok, errors }) are unchanged — callers (wizard commit, upload
// route) keep reading result.ok / result.errors exactly as before.

export function fieldFromDbError(message) {
  const m = String(message || '');
  let hit = m.match(/null value in column "([^"]+)"/);
  if (hit) return hit[1];
  hit = m.match(/Key \(([^)]+)\)=\(/);
  if (hit) return hit[1];
  hit = m.match(/column "([^"]+)" (?:does not exist|of relation)/);
  if (hit) return hit[1];
  return null;
}

export function recordFailure(report, { sheet = null, row = null, field = null, message, ref = null, keep = {} } = {}) {
  report.errors = (report.errors || 0) + 1;
  const entry = {
    sheet,
    row,
    field: field ?? fieldFromDbError(message),
    message: String(message || 'unknown error'),
    ref,
    ...keep,
  };
  // backward-compat: older readers look for `error`
  entry.error = entry.message;
  report.items = report.items || [];
  report.items.push(entry);
  return entry;
}
