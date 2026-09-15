// Canonical upload/file lifecycle statuses — SINGLE SOURCE OF TRUTH.
// Every writer (legacy upload, wizard configure/preview/commit, batch intake,
// classifier skips, family parsers) must use these constants, never string
// literals, so the review queue, dashboard, and tests share one vocabulary.
//
// Lifecycle:
//   STAGED      file received + staged in file_uploads, not yet configured
//   CONFIGURED  project/zone/doc_type assigned, parsed preview cached
//   SUCCESS     committed with zero row failures
//   PARTIAL     committed with at least one row failure (see report_json items)
//   FAILED      commit attempted, nothing written (or intake failed outright)
//   SKIPPED_*   never attempted — with a reason (see skip_reason column):
//     SKIPPED_LOCKED    password-protected / unreadable workbook
//     SKIPPED_REFERENCE zero-cell navigator / drawing-only / splash file
//     SKIPPED_FORMAT    non-xlsx, legacy .xls, corrupt archive entry
//     SKIPPED_DUPLICATE same tenant+sha256 already ingested
//     SKIPPED_AMBIGUOUS classifier could not decide (needs review confirm)
export const UPLOAD_STATUS = Object.freeze({
  STAGED: 'STAGED',
  CONFIGURED: 'CONFIGURED',
  SUCCESS: 'SUCCESS',
  PARTIAL: 'PARTIAL',
  FAILED: 'FAILED',
  SKIPPED_LOCKED: 'SKIPPED_LOCKED',
  SKIPPED_REFERENCE: 'SKIPPED_REFERENCE',
  SKIPPED_FORMAT: 'SKIPPED_FORMAT',
  SKIPPED_DUPLICATE: 'SKIPPED_DUPLICATE',
  SKIPPED_AMBIGUOUS: 'SKIPPED_AMBIGUOUS',
});

const TERMINAL = new Set([
  UPLOAD_STATUS.SUCCESS,
  UPLOAD_STATUS.PARTIAL,
  UPLOAD_STATUS.FAILED,
  UPLOAD_STATUS.SKIPPED_LOCKED,
  UPLOAD_STATUS.SKIPPED_REFERENCE,
  UPLOAD_STATUS.SKIPPED_FORMAT,
  UPLOAD_STATUS.SKIPPED_DUPLICATE,
  UPLOAD_STATUS.SKIPPED_AMBIGUOUS,
]);

export function isUploadStatus(s) {
  return Object.values(UPLOAD_STATUS).includes(s);
}

export function isTerminalUploadStatus(s) {
  return TERMINAL.has(s);
}

// Shared commit-result → status mapping (ok/error counts only —
// row-level detail stays in report_json.items per the failures contract).
// (0,0) → SUCCESS preserves legacy semantics: nothing to write, nothing failed.
export function statusFromCounts(okCount, errorCount) {
  const ok = Number(okCount) || 0;
  const err = Number(errorCount) || 0;
  if (err === 0) return UPLOAD_STATUS.SUCCESS;
  if (ok > 0) return UPLOAD_STATUS.PARTIAL;
  return UPLOAD_STATUS.FAILED;
}
