// STEP0-01: canonical upload status table is the single vocabulary.
// Run: node tests/e2e/step0-01-upload-status.mjs
import { UPLOAD_STATUS, isUploadStatus, isTerminalUploadStatus, statusFromCounts } from '../../backend/src/lib/upload-status.js';
import { readFileSync } from 'node:fs';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };

for (const s of ['STAGED', 'CONFIGURED', 'SUCCESS', 'PARTIAL', 'FAILED', 'SKIPPED_LOCKED', 'SKIPPED_REFERENCE', 'SKIPPED_FORMAT', 'SKIPPED_DUPLICATE', 'SKIPPED_AMBIGUOUS'])
  ok(UPLOAD_STATUS[s] === s, `UPLOAD_STATUS.${s} === '${s}'`);
ok(isUploadStatus('SUCCESS') && !isUploadStatus('PROCESSING') && !isUploadStatus('success'), 'membership check (legacy PROCESSING + lowercase rejected)');
ok(isTerminalUploadStatus('SUCCESS') && isTerminalUploadStatus('SKIPPED_LOCKED'), 'terminal set covers outcomes + skips');
ok(!isTerminalUploadStatus('STAGED') && !isTerminalUploadStatus('CONFIGURED'), 'STAGED/CONFIGURED are non-terminal');
ok(statusFromCounts(5, 0) === 'SUCCESS', 'counts(5,0) → SUCCESS');
ok(statusFromCounts(3, 2) === 'PARTIAL', 'counts(3,2) → PARTIAL');
ok(statusFromCounts(0, 4) === 'FAILED', 'counts(0,4) → FAILED');
ok(statusFromCounts(0, 0) === 'SUCCESS', 'counts(0,0) → SUCCESS (legacy semantics)');

// every writer must import this module instead of string literals
for (const f of ['backend/src/routes/upload.js', 'backend/src/routes/wizard.js']) {
  const src = readFileSync(f, 'utf8');
  ok(src.includes('upload-status'), `${f} uses the canonical table`);
  ok(!/'(SUCCESS|PARTIAL|FAILED|CONFIGURED|PROCESSING)'/.test(src), `${f} has no status string literals`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
