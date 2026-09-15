// P2-02: test suite is portable — no personal-machine paths, env-driven everywhere.
// Run: node tests/e2e/p2-02-test-portability.mjs
import { readFileSync, existsSync } from 'node:fs';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };

ok(existsSync('tests/tools/env.mjs'), 'tests/tools/env.mjs helper exists');
const helper = readFileSync('tests/tools/env.mjs', 'utf8');
for (const v of ['PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE', 'BASE_URL', 'PSQL_BIN'])
  ok(helper.includes(v), `helper reads ${v}`);

const portables = [
  'tests/e2e/schema.mjs',
  'tests/e2e/payment-sla.mjs',
  'tests/e2e/shop-approval.mjs',
  'tests/e2e/api.mjs',
  'tests/tools/schema-audit.mjs',
];
for (const f of portables) {
  const src = readFileSync(f, 'utf8');
  ok(!src.includes('/home/') && !src.includes('/Users/') && !src.includes('C:\\'), `${f} has no personal absolute paths`);
  ok(src.includes('tools/env.mjs') || src.includes('./env.mjs'), `${f} uses the env helper`);
}
// localhost defaults are allowed only as fallbacks behind env vars
for (const f of ['tests/e2e/api.mjs', 'tests/e2e/payment-sla.mjs', 'tests/e2e/shop-approval.mjs']) {
  const src = readFileSync(f, 'utf8');
  ok(!src.includes("BASE = 'http://localhost"), `${f} has no hardcoded BASE`);
}

// browser.mjs is wired: real assertions, exit codes, env base
const b = readFileSync('tests/e2e/browser.mjs', 'utf8');
ok(!b.includes('trycloudflare'), 'browser.mjs has no stale tunnel URL');
ok(b.includes('apiBase') || b.includes('BASE_URL'), 'browser.mjs uses BASE_URL env');
ok(b.includes('process.exit(failures'), 'browser.mjs exits non-zero on failure');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
ok((pkg.scripts['test:all'] || '').includes('test:browser'), 'test:all runs the browser suite');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
