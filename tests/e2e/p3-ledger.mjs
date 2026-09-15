// P3-2: migration ledger — each drizzle/*.sql applies once, checksum-verified.
// 1. scratch DB: init records every file in schema_migrations.
// 2. re-run: exit 0, ledger unchanged (idempotent).
// 3. tampered ledger checksum → init exits non-zero (drift detected).
// 4. pre-ledger adoption: schema exists + empty ledger → adopt without re-run.
// Run: node tests/e2e/p3-ledger.mjs
import { execSync } from 'node:child_process';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const PG = {
  host: process.env.PGHOST || '127.0.0.1',
  port: process.env.PGPORT || '5433',
  user: process.env.PGUSER || 'pmo_user',
  password: process.env.PGPASSWORD || 'pmo_dev_pwd',
};
const DBNAME = 'pmo_ledgertest';
const FRESH_URL = `postgresql://${PG.user}:${PG.password}@${PG.host}:${PG.port}/${DBNAME}`;
const PSQL = `PGPASSWORD=${PG.password} psql -h ${PG.host} -p ${PG.port} -U ${PG.user}`;
const psqlDb = (db, sql) => execSync(`${PSQL} -d ${db} -t -A -c "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();
const SUPERPSQL = `psql -h /tmp -p ${PG.port} -U vutun`;
const superpsql = (sql) => execSync(`${SUPERPSQL} -d postgres -c "${sql}"`, { encoding: 'utf8' });
const runInit = (extra = {}) =>
  execSync('node backend/src/db/init.js', { encoding: 'utf8', env: { ...process.env, DATABASE_URL: FRESH_URL, ...extra }, timeout: 180000 });

superpsql(`DROP DATABASE IF EXISTS ${DBNAME};`);
superpsql(`CREATE DATABASE ${DBNAME} OWNER ${PG.user};`);

// 1. first run records every file
try {
  runInit();
  ok(true, 'init run #1 exit 0 on empty DB');
} catch (e) { ok(false, `init run #1: ${String((e.stdout || '') + (e.stderr || '')).slice(-300)}`); }
const fileCount = Number(execSync('ls backend/drizzle/*.sql | wc -l', { encoding: 'utf8' }).trim());
const ledgerCount = Number(psqlDb(DBNAME, 'SELECT COUNT(*) FROM schema_migrations;'));
ok(ledgerCount === fileCount && ledgerCount > 0, `ledger holds every file (${ledgerCount}/${fileCount})`);

if (!failures) {
  // 2. re-run is a no-op
  try {
    const out = runInit();
    ok(/0 applied/.test(out), 'init run #2 applies 0 (idempotent)');
  } catch (e) { ok(false, `init run #2: ${e.message.slice(0, 200)}`); }
  ok(psqlDb(DBNAME, 'SELECT COUNT(*) FROM schema_migrations;') === String(fileCount), 'ledger unchanged after re-run');

  // 3. tampered checksum → refuse to boot
  const victim = psqlDb(DBNAME, 'SELECT filename FROM schema_migrations ORDER BY filename LIMIT 1;');
  psqlDb(DBNAME, `UPDATE schema_migrations SET checksum = 'tampered' WHERE filename = '${victim}';`);
  let drifted = false;
  try { runInit(); } catch { drifted = true; }
  ok(drifted, `drift detected for ${victim} (non-zero exit)`);

  // 4. pre-ledger adoption: schema present + ledger wiped → adopt, no re-run
  psqlDb(DBNAME, 'DELETE FROM schema_migrations;');
  try {
    const out = runInit();
    ok(/Adopted/.test(out), 'pre-ledger schema adopted without re-running');
  } catch (e) { ok(false, `adoption run: ${e.message.slice(0, 200)}`); }
  ok(psqlDb(DBNAME, 'SELECT COUNT(*) FROM schema_migrations;') === String(fileCount), 'ledger refilled by adoption');
}

superpsql(`DROP DATABASE IF EXISTS ${DBNAME};`);
ok(true, 'scratch database dropped');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
