// Fresh-database verification: init.js on a genuinely empty DB.
// Covers: 9999-before-9998 ordering (directives FK → issues), setval keeping
// id 1 for the seeded tenant, dashboard/projects non-empty over HTTP,
// second init.js run idempotent.
// Run: PGHOST/PGPORT/PGUSER/PGPASSWORD env (defaults local dev) —
//   node tests/e2e/freshdb-init.mjs
import { execSync, spawn } from 'node:child_process';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const PG = {
  host: process.env.PGHOST || '127.0.0.1',
  port: process.env.PGPORT || '5433',
  user: process.env.PGUSER || 'pmo_user',
  password: process.env.PGPASSWORD || 'pmo_dev_pwd',
};
const DBNAME = 'pmo_freshtest';
const FRESH_URL = `postgresql://${PG.user}:${PG.password}@${PG.host}:${PG.port}/${DBNAME}`;
const PSQL = `PGPASSWORD=${PG.password} psql -h ${PG.host} -p ${PG.port} -U ${PG.user}`;
const psqlDb = (db, sql) => execSync(`${PSQL} -d ${db} -t -A -c "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();
// DB create/drop needs a superuser: local socket peer auth as the OS user.
// App traffic always uses pmo_user over TCP (same as CI/prod wiring).
const SUPERPSQL = `psql -h /tmp -p ${PG.port} -U vutun`;
const superpsql = (sql) => execSync(`${SUPERPSQL} -d postgres -c "${sql}"`, { encoding: 'utf8' });

// 0. genuinely empty database (superuser creates it, pmo_user owns it)
superpsql(`DROP DATABASE IF EXISTS ${DBNAME};`);
superpsql(`CREATE DATABASE ${DBNAME} OWNER ${PG.user};`);
ok(psqlDb(DBNAME, 'SELECT count(*) FROM information_schema.tables WHERE table_schema = \'public\';') === '0', 'fresh DB starts with zero tables');

// 1. first init.js run must exit 0 (9998 FK needs 9999 applied first)
try {
  execSync('node backend/src/db/init.js', { encoding: 'utf8', env: { ...process.env, DATABASE_URL: FRESH_URL }, timeout: 120000 });
  ok(true, 'init.js run #1 exit 0 on empty DB');
} catch (e) {
  ok(false, `init.js run #1 exit 0: ${(e.stdout || '') + (e.stderr || '') + e.message}`.slice(0, 400));
}

// 2. seeded tenant is id 1 (setval must not skip it), admin + projects + zones exist
if (!failures) {
  ok(psqlDb(DBNAME, "SELECT id FROM tenants WHERE code = 'hbg';") === '1', 'seeded tenant has id = 1');
  ok(psqlDb(DBNAME, "SELECT count(*) FROM users WHERE email = 'admin@hbg.com';") === '1', 'admin user seeded');
  ok(psqlDb(DBNAME, 'SELECT count(*) FROM projects;') === '1', 'one demo project seeded (BTE only)');
  ok(Number(psqlDb(DBNAME, "SELECT count(*) FROM zones WHERE project_id = (SELECT id FROM projects WHERE code = 'BTE-WP4-HBC');")) >= 19, 'BTE zones seeded');
  ok(psqlDb(DBNAME, 'SELECT count(*) FROM issues;') === '0', 'issues table exists (empty)');
}

// 3. boot backend on the fresh DB, verify real HTTP responses are non-empty
const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: FRESH_URL, PORT: '3220' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 3500));
try {
  const BASE = 'http://localhost:3220';
  const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) });
  ok(login.status === 200, `login works on fresh DB (got ${login.status})`);
  const { token } = await login.json();
  const H = { Authorization: `Bearer ${token}` };
  const projects = await fetch(BASE + '/api/projects', { headers: H }).then(r => r.json());
  ok(Array.isArray(projects) && projects.length === 1, `GET /api/projects returns 1 seeded project (got ${projects.length})`);
  const dash = await fetch(BASE + '/api/dashboard', { headers: H }).then(r => r.json());
  ok(dash && Number(dash.projects_active) === 1, `GET /api/dashboard shows 1 active project (got ${dash?.projects_active})`);

  // 4. sequences still healthy: new insert gets next id without collisions
  const created = await fetch(BASE + '/api/projects', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ code: `FRESH-${Date.now()}` }) }).then(r => r.json());
  ok(created.id > 1, `post-init insert gets fresh id (got ${created.id})`);
  await fetch(BASE + `/api/projects/${created.id}/zones`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'Z1' }) });
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}

// 5. second init.js run: idempotent, tenant still 1, sequences not reset
try {
  execSync('node backend/src/db/init.js', { encoding: 'utf8', env: { ...process.env, DATABASE_URL: FRESH_URL }, timeout: 120000 });
  ok(true, 'init.js run #2 exit 0 (idempotent)');
} catch (e) {
  ok(false, `init.js run #2 exit 0: ${e.message}`.slice(0, 200));
}
ok(psqlDb(DBNAME, "SELECT id FROM tenants WHERE code = 'hbg';") === '1', 'tenant still id = 1 after re-init');

// cleanup: drop the scratch database (dev DB untouched)
superpsql(`DROP DATABASE IF EXISTS ${DBNAME};`);
ok(true, 'scratch database dropped');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
