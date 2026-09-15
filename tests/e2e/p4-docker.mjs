// P4-2: deploy surface is correct (no docker daemon here — static + unit checks).
// 1. entrypoint bash syntax ok; runs init-db before exec; no *** password bug.
// 2. Dockerfile: node-based HEALTHCHECK (no wget), entrypoint copied, frontend built.
// 3. compose: postgres/app/init, uploads volume mounted + declared, init one-shot.
// 4. .dockerignore keeps entrypoint in context, excludes .env + data/uploads.
// 5. buildDatabaseUrl(): DATABASE_URL wins; else DB_* parts (coolify either way).
// Run: node tests/e2e/p4-docker.mjs
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const sh = (cmd) => execSync(cmd, { encoding: 'utf8', cwd: '/home/vutun/pmo_project', timeout: 30000 });
const root = '/home/vutun/pmo_project/';
const read = (f) => readFileSync(root + f, 'utf8');

// 1. entrypoint
try { sh('bash -n docker-entrypoint.sh'); ok(true, 'entrypoint bash syntax ok'); }
catch (e) { ok(false, 'entrypoint bash syntax: ' + e.message.slice(0, 120)); }
const entry = read('docker-entrypoint.sh');
ok(/node backend\/src\/db\/init\.js/.test(entry), 'entrypoint runs init-db before boot');
ok(!/\*\*\*/.test(entry), 'no *** password placeholder in entrypoint');
ok(/exec "\$@"|exec '\$@'/.test(entry), 'entrypoint execs CMD (signal handling via tini)');

// 2. Dockerfile
const df = read('Dockerfile');
ok(/HEALTHCHECK[\s\S]*CMD node -e/.test(df) && !/CMD wget/.test(df), 'HEALTHCHECK uses node (wget not installed)');
ok(/COPY docker-entrypoint\.sh/.test(df), 'entrypoint copied into image');
ok(/npm run build/.test(df), 'frontend built in image');
ok(/frontend\/dist/.test(df), 'frontend dist served from image');

// 3. compose
const compose = read('docker-compose.yml');
for (const svc of ['postgres:', 'init:', 'app:']) ok(compose.includes(svc), `compose service ${svc}`);
ok(/uploads:\/app\/backend\/uploads/.test(compose), 'uploads volume mounted on app');
ok(/^\s+uploads:\s*$/m.test(compose), 'uploads volume declared');
const initBlock = compose.split(/^  app:/m)[0].split(/^  init:/m)[1] || '';
ok(!/^\s+restart:/m.test(initBlock), 'init service has no restart (one-shot)');

// 4. dockerignore
const ign = read('.dockerignore');
ok(!/^docker-entrypoint\.sh$/m.test(ign), 'entrypoint kept in build context');
ok(/^\.env$/m.test(ign), '.env excluded from image');
ok(/backend\/uploads\//.test(ign), 'local uploads excluded from image');
ok(existsSync(root + '.env.example') && !existsSync(root + '.env'), '.env.example present, no .env secrets file');

// 5. connection-string wiring (real execution)
const url = (env) => sh(`node --input-type=module -e "import { buildDatabaseUrl } from './backend/src/db/index.js'; console.log(buildDatabaseUrl());"`).trim();
const _e = { ...process.env };
process.env.DATABASE_URL = 'postgresql://u:p@h:1/d';
ok(url().includes('postgresql://u:p@h:1/d'), 'DATABASE_URL wins when set');
delete process.env.DATABASE_URL;
Object.assign(process.env, { DB_HOST: 'myhost', DB_PORT: '1111', DB_NAME: 'mydb', DB_USER: 'me', DB_PASSWORD: 'pw' });
try {
  const built = execSync(`node --input-type=module -e "import { buildDatabaseUrl } from './backend/src/db/index.js'; console.log(buildDatabaseUrl());"`,
    { encoding: 'utf8', cwd: '/home/vutun/pmo_project', env: { ...process.env }, timeout: 15000 }).trim();
  ok(built === 'postgresql://me:pw@myhost:1111/mydb', `DB_* parts build URL (${built})`);
} finally { Object.assign(process.env, _e); }

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
