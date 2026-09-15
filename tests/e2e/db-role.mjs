// DB role audit (Wave 2 A1): the app pool MUST run as least-privilege pmo_app
// with DML on every app table + USAGE on sequences, and RLS must actually
// filter (regression: a SUPERUSER app role bypasses even FORCE policies).
// Run: node tests/e2e/db-role.mjs (needs dev DB, no server)
import { getDb, closeDb, buildAppDatabaseUrl } from '../../backend/src/db/index.js';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };

try {
  ok(!/pmo_user/.test(buildAppDatabaseUrl().split('@')[0]), `default app user is not owner (${buildAppDatabaseUrl().split('@')[0].split(':')[0].replace('postgresql://', '')})`);
  const db = getDb();
  const me = await db.prepare('SELECT current_user AS u, (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS super, (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass').getAsync();
  ok(me.u === 'pmo_app', `pool user is pmo_app (got ${me.u})`);
  ok(me.super === false, 'app role is NOT superuser');
  ok(me.bypass === false, 'app role has NO BYPASSRLS');
  // NOTE: privilege checks MUST use the row's own (schemaname, tablename) via
  // format() — hardcoding 'public.'||name errors on pg_tables rows from other
  // schemas (regclass cast fails instead of returning false, and quals don't
  // guarantee evaluation order).
  const qname = (alias) => `format('%I.%I', ${alias}.schemaname, ${alias}.tablename)`;
  const missing = await db.prepare(
    `SELECT tablename FROM pg_tables t WHERE schemaname = 'public' AND tablename NOT IN ('schema_migrations')
     AND NOT (has_table_privilege('pmo_app', ${qname('t')}, 'SELECT')
       AND has_table_privilege('pmo_app', ${qname('t')}, 'INSERT')
       AND has_table_privilege('pmo_app', ${qname('t')}, 'UPDATE')
       AND has_table_privilege('pmo_app', ${qname('t')}, 'DELETE'))
     ORDER BY 1`
  ).allAsync();
  ok(missing.length === 0, `DML grants on all tables${missing.length ? ' — MISSING: ' + missing.map((r) => r.tablename).join(',') : ''}`);
  const seqs = await db.prepare(
    `SELECT sequence_name FROM information_schema.sequences s WHERE sequence_schema = 'public'
     AND NOT has_sequence_privilege('pmo_app', format('%I.%I', s.sequence_schema, s.sequence_name), 'USAGE')`
  ).allAsync();
  ok(seqs.length === 0, 'USAGE on all sequences');
  // RLS actually filters for this role (would silently pass as superuser).
  const { getPool } = await import('../../backend/src/db/index.js');
  const c = await getPool().connect();
  try {
    await c.query(`SET app.current_tenant = '2'`);
    const rows = await c.query('SELECT id FROM projects').then((r) => r.rows.map((r) => r.id));
    const pilot = await db.prepare(`SELECT id FROM projects WHERE code = 'PILOT-001'`).getAsync();
    ok(rows.length === 1 && rows[0] === pilot.id, `RLS filters as pmo_app (saw ${JSON.stringify(rows)})`);
  } finally {
    try { await c.query('RESET app.current_tenant'); } catch {}
    c.release();
  }
} finally {
  await closeDb();
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
