// P3-4: txAudit = business + audit_log in ONE transaction (proves atomicity).
// 1. happy path: zone row + audit row both committed.
// 2. business throws → no audit row (rolled back).
// 3. audit INSERT fails (action > varchar(50)) → business row rolled back.
// Run: node tests/e2e/p3-txaudit.mjs
import { execSync } from 'node:child_process';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const PG = {
  host: process.env.PGHOST || '127.0.0.1',
  port: process.env.PGPORT || '5433',
  user: process.env.PGUSER || 'pmo_user',
  password: process.env.PGPASSWORD || 'pmo_dev_pwd',
};
const DBNAME = 'pmo_txatest';
const FRESH_URL = `postgresql://${PG.user}:${PG.password}@${PG.host}:${PG.port}/${DBNAME}`;
const PSQL = `PGPASSWORD=${PG.password} psql -h ${PG.host} -p ${PG.port} -U ${PG.user}`;
const psqlDb = (db, sql) => execSync(`${PSQL} -d ${db} -t -A -c "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();
const SUPERPSQL = `psql -h /tmp -p ${PG.port} -U vutun`;
const superpsql = (sql) => execSync(`${SUPERPSQL} -d postgres -c "${sql}"`, { encoding: 'utf8' });
const nodeEval = (js) => execSync(`node --input-type=module -e "${js.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`')}"`,
  { encoding: 'utf8', cwd: '/home/vutun/pmo_project', env: { ...process.env, DATABASE_URL: FRESH_URL }, timeout: 60000 });

superpsql(`DROP DATABASE IF EXISTS ${DBNAME};`);
superpsql(`CREATE DATABASE ${DBNAME} OWNER ${PG.user};`);
execSync('node backend/src/db/init.js', { encoding: 'utf8', cwd: '/home/vutun/pmo_project', env: { ...process.env, DATABASE_URL: FRESH_URL }, timeout: 180000 });

const PRE = `
  import { txAudit } from './backend/src/lib/with-audit.js';
  import { getDb, closeDb } from './backend/src/db/index.js';
  const db = getDb();
  const req = { user: { id: 1, name: 'TxProbe', role: 'admin', tenant_id: 1 } };
  const bte = await db.prepare("SELECT id FROM projects WHERE code = 'BTE-WP4-HBC'").getAsync();
`;

// 1. happy path
nodeEval(PRE + `
  const z = await txAudit(req, { action: 'CREATE', resourceType: 'zone', resourceId: 0, note: 'tx-probe-ok' },
    async (c) => (await c.query("INSERT INTO zones (project_id, code) VALUES ($1, 'TX-OK') RETURNING *", [bte.id])).rows[0]);
  console.log(JSON.stringify({ zoneId: z.id }));
  await closeDb();
`);
ok(psqlDb(DBNAME, "SELECT COUNT(*) FROM zones WHERE code = 'TX-OK';") === '1', 'business row committed');
ok(psqlDb(DBNAME, "SELECT COUNT(*) FROM audit_log WHERE note = 'tx-probe-ok';") === '1', 'audit row committed with it');

// 2. business throws → audit rolled back
nodeEval(PRE + `
  try {
    await txAudit(req, { action: 'CREATE', resourceType: 'zone', resourceId: 0, note: 'tx-probe-bizfail' },
      async () => { throw new Error('boom'); });
  } catch {}
  await closeDb();
`);
ok(psqlDb(DBNAME, "SELECT COUNT(*) FROM audit_log WHERE note = 'tx-probe-bizfail';") === '0', 'no audit row when business fails');

// 3. audit fails (action overflows varchar(50)) → business rolled back
nodeEval(PRE + `
  try {
    await txAudit(req, { action: '${'X'.repeat(100)}', resourceType: 'zone', resourceId: 0, note: 'tx-probe-auditfail' },
      async (c) => (await c.query("INSERT INTO zones (project_id, code) VALUES ($1, 'TX-AUDITFAIL') RETURNING *", [bte.id])).rows[0]);
  } catch {}
  await closeDb();
`);
ok(psqlDb(DBNAME, "SELECT COUNT(*) FROM zones WHERE code = 'TX-AUDITFAIL';") === '0', 'business row rolled back when audit fails');

// 4. defer:true — business returns { value, before, after } and those fill
// the audit row (the sync CLIENT apply path). Atomicity still holds.
nodeEval(PRE + `
  const out = await txAudit(req, { action: 'SYNC_APPLY', resourceType: 'zone', resourceId: 0, defer: true, note: 'tx-probe-defer' },
    async (c) => {
      const before = await c.query("SELECT COUNT(*) AS n FROM zones WHERE project_id = $1", [bte.id]);
      const z = (await c.query("INSERT INTO zones (project_id, code) VALUES ($1, 'TX-DEFER') RETURNING *", [bte.id])).rows[0];
      return { value: z, before: before.rows[0], after: z };
    });
  console.log(JSON.stringify({ zoneId: out.id }));
  await closeDb();
`);
ok(psqlDb(DBNAME, "SELECT before IS NOT NULL AND after IS NOT NULL FROM audit_log WHERE note = 'tx-probe-defer';") === 't', 'deferred before/after land in audit row');

superpsql(`DROP DATABASE IF EXISTS ${DBNAME};`);
ok(true, 'scratch database dropped');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
