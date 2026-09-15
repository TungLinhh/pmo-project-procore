// P0-01: directives table survives init.js restarts; migrations are fatal on error.
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/p0-01-directives-init.mjs
// Uses the psql binary (no extra npm deps) + node:child_process only.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const URL = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const PSQL = 'PGPASSWORD=pmo_dev_pwd /home/linuxbrew/.linuxbrew/bin/psql -h 127.0.0.1 -p 5433 -U pmo_user -d pmo -t -A';
const psql = (sql) => execSync(`${PSQL} -c "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };

const before = Number(psql('SELECT count(*) FROM directives;'));
console.log(`directives before init: ${before}`);

const canary = `canary-p0-01-${Date.now()}`;
execSync(`${PSQL} -c "INSERT INTO directives (tenant_id, project_id, issue_id, from_user_id, from_user_name, body) VALUES (1, 1, NULL, 1, 'p0-01', '${canary}');"`, { encoding: 'utf8' });

const runInit = () => execSync('node backend/src/db/init.js', { encoding: 'utf8', env: { ...process.env, DATABASE_URL: URL } });
try { runInit(); ok(true, 'init.js run #1 exit 0'); }
catch (e) { ok(false, `init.js run #1 exit 0: ${(e.stdout || '') + (e.message || '')}`.slice(0, 300)); }
try { runInit(); ok(true, 'init.js run #2 exit 0 (idempotent)'); }
catch (e) { ok(false, `init.js run #2 exit 0: ${(e.stdout || '') + (e.message || '')}`.slice(0, 300)); }

const after = Number(psql('SELECT count(*) FROM directives;'));
ok(after >= before + 1, `no rows wiped (before=${before} after=${after})`);
ok(psql(`SELECT count(*) FROM directives WHERE body = '${canary}';`) === '1', 'canary row survived restart');

const cols = psql(`SELECT string_agg(column_name, ',' ORDER BY column_name) FROM information_schema.columns WHERE table_name = 'directives';`);
for (const c of ['project_id', 'from_user_id', 'from_user_name', 'notify_to_user_ids', 'issue_id', 'body'])
  ok(cols.split(',').includes(c), `directives has column ${c}`);

const entry = readFileSync('docker-entrypoint.sh', 'utf8');
ok(!entry.includes('non-fatal') && !/\|\|\s*echo/.test(entry), 'entrypoint treats init failure as fatal');
const initSrc = readFileSync('backend/src/db/init.js', 'utf8');
ok(initSrc.includes('process.exit(1)'), 'init.js exits non-zero on migration failure');
const m9998 = readFileSync('backend/drizzle/9998_align_schema_with_routes.sql', 'utf8');
ok(!/DROP\s+TABLE\s+IF\s+EXISTS\s+directives/i.test(m9998), '9998 contains no DROP TABLE directives');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
