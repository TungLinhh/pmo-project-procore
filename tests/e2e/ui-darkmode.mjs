// UI dark-mode guard: badges + table row states must be theme vars, never
// hardcoded light hex (the white-glow overdue rows + invisible REVISION bug).
// 1. every workflow-* code the app can render has a .badge rule.
// 2. no hardcoded hex in table row-state / bar-track rules (hq.css).
// 3. --c-surface-3 exists in :root too (hover fallback for both themes).
// Run: node tests/e2e/ui-darkmode.mjs
import { readFileSync } from 'node:fs';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const css = (f) => readFileSync(new URL(`../../frontend/src/styles/${f}`, import.meta.url), 'utf8');
const global = css('global.css'), hq = css('hq.css');

// 1. badge coverage — union of ShopList.stateOf + Approval/Payment/ControlCenter dynamics + transitions.js statuses
const codes = ['DRAFT', 'PENDING', 'SUBMITTED', 'REVIEW', 'REVISION', 'APPROVED', 'REJECTED', 'DONE', 'IN_PROGRESS', 'PAID', 'OVERDUE', 'CLOSED'];
const missing = codes.filter(c => !new RegExp(`\\.badge\\.workflow-${c}\\s*\\{`).test(global));
ok(missing.length === 0, `badge rule for every workflow code${missing.length ? ' — missing: ' + missing.join(',') : ` (${codes.length})`}`);

// 2. no hardcoded hex in row-state / track rules
const hardRules = [];
for (const m of hq.matchAll(/table tr\.(critical|exception)[^{]*\{[^}]*\}|(?:\.bar)\s*\{[^}]*\}/g)) {
  const hexes = m[0].match(/#[0-9a-fA-F]{3,8}\b/g);
  if (hexes) hardRules.push(`${m[0].slice(0, 28)}… → ${hexes.join(',')}`);
}
ok(hardRules.length === 0, `row-state/bar rules use vars only${hardRules.length ? ' — ' + hardRules.join('; ') : ''}`);

// 3. surface-3 in both themes
const rootBlock = (global.match(/:root\s*\{[^}]*\}/) || [''])[0];
ok(/--c-surface-3\s*:/.test(rootBlock), '--c-surface-3 defined in :root (light)');
ok(/body\.theme-dark\s*\{[^}]*--c-surface-3\s*:/s.test(global), '--c-surface-3 defined in theme-dark');

// 4. dark input override covers plain text inputs (search boxes), not just typed ones
const darkInputBlock = (global.match(/body\.theme-dark input\[type="number"\][^{]*\{[^}]*\}/s) || [''])[0];
ok(/input\[type="text"\]/.test(darkInputBlock) && /input:not\(\[type\]\)/.test(darkInputBlock),
  'dark input override covers text + typeless inputs');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
