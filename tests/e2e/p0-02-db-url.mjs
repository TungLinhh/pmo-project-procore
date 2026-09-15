// P0-02: backend resolves Postgres from DB_* parts when DATABASE_URL is unset
// (docker-compose provides DB_HOST/DB_PORT/... only), DATABASE_URL still wins.
// Run: node tests/e2e/p0-02-db-url.mjs
import { execSync } from 'node:child_process';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };

const run = (env) => execSync(
  `node --input-type=module -e "import('./backend/src/db/index.js').then(m => console.log(m.buildDatabaseUrl()))"`,
  { encoding: 'utf8', env: { ...process.env, ...env } }
).trim();

// 1. DATABASE_URL override wins
const custom = 'postgresql://u:p@myhost:5439/mydb';
ok(run({ DATABASE_URL: custom }) === custom, 'DATABASE_URL override wins');

// 2. DB_* parts build the URL (compose case) — no DATABASE_URL in env
const built = run({
  DATABASE_URL: '',
  DB_USER: 'pmo_user', DB_PASSWORD: 'pmo_dev_pwd',
  DB_HOST: 'postgres', DB_PORT: '5432', DB_NAME: 'pmo',
});
ok(built === 'postgresql://pmo_user:pmo_dev_pwd@postgres:5432/pmo', `DB_* compose URL built (got ${built})`);

// 3. Defaults match README local dev when nothing set
const def = run({ DATABASE_URL: '', DB_USER: '', DB_PASSWORD: '', DB_HOST: '', DB_PORT: '', DB_NAME: '' });
ok(def === 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo', `defaults match README (got ${def})`);

// 4. Live check: backend boots with DB_* only and answers /api/health.
// Kill by EXACT pid ($!) — never pgrep (that murdered the :3000 demo server
// once by matching the wrong process). Verify the port goes quiet afterwards.
const live = execSync(
  `sh -c 'DATABASE_URL= DB_HOST=127.0.0.1 DB_PORT=5433 DB_USER=pmo_user DB_PASSWORD=pmo_dev_pwd DB_NAME=pmo PORT=3101 node backend/src/index.js > /tmp/p0-02-srv.log 2>&1 & SRV=$!; sleep 4; curl -s http://localhost:3101/api/health; echo; kill $SRV 2>/dev/null; for i in 1 2 3 4 5 6 7 8; do kill -0 $SRV 2>/dev/null || break; sleep 1; done; kill -0 $SRV 2>/dev/null && echo SURVIVOR || echo REAPED'`,
  { encoding: 'utf8', timeout: 40000 }
);
ok(live.includes('"status"') && live.includes('"ok"'), 'backend boots on DB_* only and serves /api/health');
ok(live.includes('REAPED') && !live.includes('SURVIVOR'), 'test server reaped by exact pid (no orphan, no friendly fire)');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
