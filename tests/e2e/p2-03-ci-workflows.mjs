// P2-03: CI/deploy share one migration path (ordered init.js), no literal secrets,
// correct artifact path, portable tests.
// Run: node tests/e2e/p2-03-ci-workflows.mjs
import { readFileSync } from 'node:fs';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };

const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
const deploy = readFileSync('.github/workflows/deploy.yml', 'utf8');

ok(!ci.includes('***') && !deploy.includes('***'), 'no literal *** password anywhere');
ok(!ci.includes('9998_') && !ci.includes('9999_') && !deploy.includes('9998_') && !deploy.includes('9999_'),
  'no raw migration-file invocations (init.js is the single path)');
ok(ci.includes('node src/db/init.js') || ci.includes('node backend/src/db/init.js'), 'ci applies ordered init.js');
ok(deploy.includes('node backend/src/db/init.js'), 'deploy applies ordered init.js');
ok(!ci.match(/working-directory:\s*frontend[\s\S]{0,400}?path:\s*frontend\/dist/), 'artifact path not doubled (dist/, not frontend/dist/)');
ok(ci.includes('path: dist/'), 'frontend artifact uploads dist/');
ok(ci.includes('${{ env.PG_PASSWORD }}'), 'ci PG password from one env var, not literals');
ok(deploy.includes('${{ secrets.PG_PASSWORD }}'), 'deploy PG password from secrets');
ok(!ci.includes('playwright install'), 'schema-audit job needs no Playwright (pure-node script)');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
