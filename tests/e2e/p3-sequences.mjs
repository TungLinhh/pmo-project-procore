// P3-3: inserts are a single round-trip (no per-INSERT setval), boot resync
// heals drift from external explicit-id imports.
// 1. 20 concurrent inserts → 20 unique ids, no duplicate-key.
// 2. explicit-id import (id=9999) + re-init → next auto id is 10000.
// 3. tables without `id` insert fine with no RETURNING workaround.
// Run: node tests/e2e/p3-sequences.mjs
import { execSync } from 'node:child_process';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const PG = {
  host: process.env.PGHOST || '127.0.0.1',
  port: process.env.PGPORT || '5433',
  user: process.env.PGUSER || 'pmo_user',
  password: process.env.PGPASSWORD || 'pmo_dev_pwd',
};
const DBNAME = 'pmo_seqtest';
const FRESH_URL = `postgresql://${PG.user}:${PG.password}@${PG.host}:${PG.port}/${DBNAME}`;
const PSQL = `PGPASSWORD=${PG.password} psql -h ${PG.host} -p ${PG.port} -U ${PG.user}`;
const psqlDb = (db, sql) => execSync(`${PSQL} -d ${db} -t -A -c "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();
const SUPERPSQL = `psql -h /tmp -p ${PG.port} -U vutun`;
const superpsql = (sql) => execSync(`${SUPERPSQL} -d postgres -c "${sql}"`, { encoding: 'utf8' });
const nodeEval = (js) => execSync(`node --input-type=module -e "${js.replace(/"/g, '\\"')}"`,
  { encoding: 'utf8', cwd: '/home/vutun/pmo_project', env: { ...process.env, DATABASE_URL: FRESH_URL }, timeout: 60000 });

superpsql(`DROP DATABASE IF EXISTS ${DBNAME};`);
superpsql(`CREATE DATABASE ${DBNAME} OWNER ${PG.user};`);
execSync('node backend/src/db/init.js', { encoding: 'utf8', cwd: '/home/vutun/pmo_project', env: { ...process.env, DATABASE_URL: FRESH_URL }, timeout: 180000 });

// 1. concurrent inserts, no setval guard
const out = nodeEval(`
  import { getDb, closeDb } from './backend/src/db/index.js';
  const db = getDb();
  const bte = await db.prepare("SELECT id FROM projects WHERE code = 'BTE-WP4-HBC'").getAsync();
  const ids = await Promise.all(Array.from({ length: 20 }, (_, i) =>
    db.prepare('INSERT INTO zones (project_id, code) VALUES (?, ?)').runAsync(bte.id, 'SEQ-' + i + '-' + Date.now())
      .then(r => r.lastInsertRowid)));
  console.log(JSON.stringify({ unique: new Set(ids).size, defined: ids.every(Number.isInteger) }));
  await closeDb();
`);
const r1 = JSON.parse(out.trim().split('\n').pop());
ok(r1.unique === 20 && r1.defined, `20 concurrent inserts → 20 unique ids (got ${r1.unique})`);

// 2. external explicit-id import, then re-init heals the sequence
const bteId = psqlDb(DBNAME, "SELECT id FROM projects WHERE code = 'BTE-WP4-HBC';");
psqlDb(DBNAME, `INSERT INTO zones (id, project_id, code) VALUES (9999, ${bteId}, 'LEGACY-IMPORT');`);
execSync('node backend/src/db/init.js', { encoding: 'utf8', cwd: '/home/vutun/pmo_project', env: { ...process.env, DATABASE_URL: FRESH_URL }, timeout: 180000 });
const out2 = nodeEval(`
  import { getDb, closeDb } from './backend/src/db/index.js';
  const r = await getDb().prepare('INSERT INTO zones (project_id, code) VALUES (?, ?)').runAsync(${bteId}, 'AFTER-RESYNC');
  console.log(JSON.stringify({ id: r.lastInsertRowid }));
  await closeDb();
`);
ok(JSON.parse(out2.trim().split('\n').pop()).id === 10000, 'next id after resync is 10000');

// 3. id-less table needs no workaround
const out3 = nodeEval(`
  import { getDb, closeDb } from './backend/src/db/index.js';
  const r = await getDb().prepare("INSERT INTO schema_migrations (filename, checksum) VALUES ('probe.sql', 'x')").runAsync();
  console.log(JSON.stringify({ changes: r.changes }));
  await closeDb();
`);
ok(JSON.parse(out3.trim().split('\n').pop()).changes === 1, 'INSERT into id-less table works (auto-probe, no RETURNING hack)');

superpsql(`DROP DATABASE IF EXISTS ${DBNAME};`);
ok(true, 'scratch database dropped');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
