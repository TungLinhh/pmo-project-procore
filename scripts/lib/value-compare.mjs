// Value-level reconciliation between a source workbook and what the database
// actually holds.
//
// Row-count reconciliation ("did every row land?") is necessary but not
// sufficient: a row can arrive with the right key and the wrong number, which
// is exactly the failure SRS 9.1 forbids ("0% sai số khối lượng/giá trị"). This
// module compares the *values* of the fields the business signs off on.
//
// Two rules keep the result honest:
//
// 1. Only PASS-THROUGH fields are compared. Several database columns are
//    derived during commit (`status`, material `progress_pct`,
//    `procurement_status`) and some are never persisted at all (shop `notes`).
//    Comparing a derived column against a source value would report a
//    mismatch on every row, which is noise, not signal — so those are listed
//    in NOT_COMPARED with the reason, and the coverage is reported honestly
//    rather than claimed.
//
// 2. Only fields the source row actually carries are compared. A workbook of
//    the same document type can have a different column set, and a missing
//    column means "this file does not provide it", not "the value is wrong".
//
// Representation, not meaning, is what differs between the two sides:
//   - the driver returns `date` columns as 'YYYY-MM-DD' but `timestamptz` as a
//     Date, while the parser always produces 'YYYY-MM-DD';
//   - `numeric` is compared with a tolerance, because exact float equality is
//     the wrong test for VND amounts that reach 10^9;
//   - blank, '' and NULL all mean "not provided" and must compare equal, or
//     every sparse row would be reported as a mismatch.
//
// Pure functions only: no DB, no filesystem. That is what makes them testable.
import { toFloat } from '../../backend/src/lib/excel.js';

// VND amounts in these workbooks reach 10^9, where a float carries ~1e-7 of
// absolute error, so 0.01 is generous for money and invisible for quantities
// and whole-number percentages.
const EPSILON = 0.01;

const isBlank = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

export function normNumber(v) {
  if (isBlank(v)) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  const s = String(v).trim();
  // Ambiguous grouping: "1.234,5" is 1234.5 in Vietnamese notation, but the
  // ingest's toFloat() only swaps the FIRST comma and would read it as 1.234 —
  // a 1000x error that would then be reported as a value mismatch against the
  // database. Refuse to guess: a number that needs a locale decision is not a
  // number this checker may assert on.
  if (/^\d{1,3}([.,]\d{3})+([.,]\d+)?$/.test(s)) return null;
  const n = toFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export function normDate(v) {
  if (isBlank(v)) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const s = String(v).trim();
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const dmy = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(s);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  return null;
}

export function normText(v) {
  if (isBlank(v)) return null;
  return String(v).replace(/\s+/g, ' ').trim();
}

const DATE = 'date';
const NUM = 'num';
const TXT = 'text';
// A field flagged `advisory` is reported but does NOT count as a mismatch: the
// ingest deliberately does not overwrite it on re-ingest, so a difference is
// the design working, not an error. The shop upsert omits these from setCols
// because writing EXCLUDED.bql_l*_response over an approved level would bypass
// checkTransition and the approval chain gate; approval dates and responses are
// the app's record of a business event, not the sheet's. Whether a NEW file may
// update them is a PMO decision — see docs/DATA_DECISIONS_REQUIRED.md — so the
// difference is surfaced, not hidden.

// src is either the parsed row's own key, or a function for the fields whose
// source lives somewhere else in the parsed shape (material batches).
const f = (db, kind, src = db, advisory = false) => ({ db, kind, src, advisory });
// A row with no batches at all means the source provides no batch data, which
// is different from "the batch is empty". Returning undefined (not null) is
// what lets the caller skip the field instead of asserting an empty value.
const batch = (i, end) => (row) => (Array.isArray(row.batches) ? (row.batches[i]?.[end] ?? null) : undefined);

export const FIELDS = {
  construction: [
    f('name_vi', TXT), f('progress_pct', NUM), f('source_status', TXT),
    f('plan_duration_days', NUM),
    f('plan_start_date', DATE), f('actual_start_date', DATE),
    f('plan_end_date', DATE), f('actual_end_date', DATE),
  ],
  shop: [
    f('name_vi', TXT), f('progress_pct', NUM),
    f('planned_submit_date', DATE), f('actual_submit_date', DATE),
    f('approval_date', DATE, 'approval_date', true),
    f('bql_l1_date', DATE, 'bql_l1_date', true), f('bql_l2_date', DATE, 'bql_l2_date', true),
    f('bql_l3_date', DATE, 'bql_l3_date', true), f('bql_l4_date', DATE, 'bql_l4_date', true),
    f('bql_l5_date', DATE, 'bql_l5_date', true),
    f('bql_l1_response', TXT, 'bql_l1_response', true),
    f('bql_l2_response', TXT, 'bql_l2_response', true),
    f('bql_l3_response', TXT, 'bql_l3_response', true),
    f('bql_l4_response', TXT, 'bql_l4_response', true),
    f('bql_l5_response', TXT, 'bql_l5_response', true),
  ],
  material: [
    f('name_vi', TXT, 'description'),
    f('request_date_1', DATE, batch(0, 'request_date')), f('delivery_date_1', DATE, batch(0, 'actual')),
    f('request_date_2', DATE, batch(1, 'request_date')), f('delivery_date_2', DATE, batch(1, 'actual')),
    f('request_date_3', DATE, batch(2, 'request_date')), f('delivery_date_3', DATE, batch(2, 'actual')),
    f('request_date_4', DATE, batch(3, 'request_date')), f('delivery_date_4', DATE, batch(3, 'actual')),
  ],
  payment_line: [
    f('label', TXT), f('ref_no', TXT), f('ref_date', DATE), f('amount', NUM), f('note', TXT),
  ],
  payment_contract: [
    f('project_name', TXT), f('client_name', TXT), f('note', TXT),
    f('contract_value', NUM), f('settled_value', NUM), f('paid_value', NUM),
    f('remaining_value', NUM), f('invoiced_value', NUM), f('due_now_value', NUM),
    f('forecast_1', NUM), f('forecast_2', NUM), f('invoice_debt', NUM),
  ],
};

// Reported next to the numbers so nobody reads 100% coverage into a figure that
// quietly skips derived columns. Advisory columns are compared but excluded
// from the mismatch count, and listed here so the distinction stays visible.
export const NOT_COMPARED = {
  construction: ['status (deriveStatus từ progress + actual_end)', 'name_en (nguồn không có)'],
  shop: [
    'status (enum suy ra)',
    'rs1/rs2 dates (nguồn không có)',
    'notes (không được ghi xuống DB)',
    'approval_date + bql_l*_date/response (ADVISORY: upsert cố ý không ghi đè khi re-ingest để không vượt checkTransition)',
  ],
  material: ['progress_pct (suy ra từ số lô đã giao)', 'procurement_status (deriveProcurementStatus)'],
  payment_line: [],
  payment_contract: [],
};

function normalize(kind, value) {
  if (kind === DATE) return normDate(value);
  if (kind === NUM) return normNumber(value);
  return normText(value);
}

function readSource(spec, sourceRow) {
  if (!Object.prototype.hasOwnProperty.call(sourceRow, spec.src) && typeof spec.src !== 'function') return undefined;
  const raw = typeof spec.src === 'function' ? spec.src(sourceRow) : sourceRow[spec.src];
  return raw === undefined ? undefined : raw;
}

function valuesEqual(kind, a, b) {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  if (kind === NUM) return Math.abs(a - b) <= EPSILON;
  return a === b;
}

// Compare one parsed source row against one database row.
// Returns { compared, diffs, advisory }; `compared === 0` means the source row
// provides none of this type's fields, which is not a mismatch. `diffs` are
// asserted; `advisory` are differences the ingest is designed to keep.
export function compareRow(type, sourceRow, dbRow) {
  const spec = FIELDS[type];
  if (!spec) throw new Error(`unknown reconciliation type: ${type}`);
  const diffs = [];
  const advisory = [];
  let compared = 0;
  for (const field of spec) {
    const raw = readSource(field, sourceRow || {});
    if (raw === undefined) continue;                 // this file has no such column
    if (!field.advisory) compared++;                  // advisory fields stay out of the denominator
    const source = normalize(field.kind, raw);
    const stored = normalize(field.kind, dbRow?.[field.db]);
    if (valuesEqual(field.kind, source, stored)) continue;
    (field.advisory ? advisory : diffs).push({ field: field.db, source, db: stored });
  }
  return { compared, diffs, advisory };
}
