// P2-03: deploy shares one migration path (ordered init.js), no literal secrets,
// no raw migration-file execution, no half-restored CI workflows.
// History: .github/workflows/ci.yml+deploy.yml were deliberately removed
// (bd8b09b) — local-only deploys via compose/entrypoint. This suite guards the
// REMAINING deploy surfaces instead of asserting on deleted files.
// Run: node tests/e2e/p2-03-ci-workflows.mjs
import { readFileSync, existsSync, readdirSync } from 'node:fs';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };

const entry = readFileSync('docker-entrypoint.sh', 'utf8');
const compose = readFileSync('docker-compose.yml', 'utf8');
const dockerfile = readFileSync('Dockerfile', 'utf8');
const envExample = readFileSync('.env.example', 'utf8');

// 1. Single migration path: every deploy surface boots through init.js.
ok(entry.includes('node backend/src/db/init.js'), 'entrypoint applies ordered init.js');
ok(compose.includes('backend/src/db/init.js'), 'compose init service runs init.js');

// 2. No raw migration-file execution (no `psql -f drizzle/...`, no per-file node).
for (const [name, src] of [['entrypoint', entry], ['compose', compose], ['Dockerfile', dockerfile]]) {
  ok(!/psql[^|]*-f\s+\S*drizzle/.test(src), `${name}: no raw psql -f drizzle invocation`);
  ok(!/node\s+\S*drizzle\/\d+/.test(src), `${name}: no direct per-file migration run`);
}

// 3. No literal *** secrets; prod secrets come from env (CHANGE_ME placeholders).
for (const [name, src] of [['entrypoint', entry], ['compose', compose], ['Dockerfile', dockerfile], ['.env.example', envExample]]) {
  ok(!src.includes('***'), `${name}: no literal *** password`);
}
ok(envExample.includes('CHANGE_ME'), '.env.example uses CHANGE_ME placeholders (no real secrets)');

// 4. Workflow removal is complete: no half-restored *.yml may rot unnoticed.
const wfDir = '.github/workflows';
ok(!existsSync(wfDir) || readdirSync(wfDir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml')).length === 0,
  'no half-restored workflow yml (removal in bd8b09b is total)');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
