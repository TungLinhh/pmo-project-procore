// Aggregate ("tổng thể") workbooks are rollups of the per-zone files, not a
// row source. Eight of them sit in reference_sheets/ and none has a confirmed
// row grain. One of them — "Tiến độ thi công tổng thể các khu vực.xlsx" — was
// imported before this guard existed and wrote 74 rows that duplicate the
// per-zone TĐ workbooks, which is the direct cause of the DB/source drift in
// docs/DATA_DECISIONS_REQUIRED.md.
//
// This module is the single place that decides "is this workbook a rollup?".
// The ingest commit path refuses to write rows for a rollup and records why,
// so the same double counting cannot come back through the UI or a
// reconciliation run. Deciding the grain (or dropping these files for good) is
// a PMO/CEO decision and is tracked in docs/DATA_DECISIONS_REQUIRED.md.

const AGGREGATE_NAME = /t[oổ]ng\s*th[eể]|s[ơo]\s*[đd][oô]c|c[aá]c\s+khu\s*v[uự]c|^\s*HBG[-_A-Z0-9]*-(WM|MSHOP)[-_]|[-.]\d+\.xlsx$/i;

// A parsed payload is a rollup when it declares no usable row grain. The
// parsers already skip drawing/summary sheets, so zero rows is the signal.
export function classifyWorkbook({ originalFilename = '', parsedRows = 0, sheetNames = [] } = {}) {
  const base = String(originalFilename).split('/').pop() || '';
  const byName = AGGREGATE_NAME.test(base);
  const declaredRollupSheet = sheetNames.some((name) => /t[oổ]ng\s*th[eể]|s[ơo]\s*[đd][oô]c\s*t[aâ]y|rollup|summary\s*c[uô]ng/i.test(String(name)));
  const noGrain = Number(parsedRows || 0) === 0;
  if (byName || (noGrain && declaredRollupSheet)) {
    return {
      aggregate: true,
      reason: byName
        ? `Tên file là workbook tổng hợp (${base}); chưa có grain dòng được PMO/CEO xác nhận`
        : 'Workbook không tạo được dòng nào (sheet tổng hợp); chưa có grain dòng được xác nhận',
    };
  }
  return { aggregate: false, reason: null };
}

// Guard for the commit path. Returns null when the workbook may be written.
export function aggregateRefusal({ originalFilename, parsedRows, sheetNames }) {
  const verdict = classifyWorkbook({ originalFilename, parsedRows, sheetNames });
  if (!verdict.aggregate) return null;
  return {
    skipped: 'aggregate',
    reason: verdict.reason,
    // A rollup that DID parse rows is the dangerous case: it would overwrite or
    // duplicate the per-zone rows. Refuse loudly instead of writing.
    wrote_rows: Number(parsedRows || 0) > 0,
  };
}
