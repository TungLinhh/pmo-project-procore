// P3-1: one shared pg Pool for db.prepare()/exec/upsert/tx + graceful shutdown.
// 1. db.getPool() and tx.getPool() are the SAME object.
// 2. tx() + db.prepare() run concurrently through it.
// 3. server exits 0 on SIGTERM (pool drained, no hang).
// Run: node tests/e2e/p3-pool.mjs
import { execSync, spawn } from 'node:child_process';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };

const probe = execSync(`node --input-type=module -e "
import { getPool as p1 } from './backend/src/db/index.js';
import { getPool as p2, tx } from './backend/src/lib/tx.js';
import { getDb } from './backend/src/db/index.js';
console.log(JSON.stringify({
  same: p1() === p2(),
  txOk: (await tx(async (c) => (await c.query('SELECT 1 AS one')).rows[0].one)) === 1,
  prepOk: (await getDb().prepare('SELECT 2 AS two').getAsync()).two === 2,
  clients: p1().totalCount,
}));
await (await import('./backend/src/db/index.js')).closeDb();
"`, { encoding: 'utf8', cwd: '/home/vutun/pmo_project', timeout: 30000 });
const r = JSON.parse(probe.trim().split('\n').pop());
ok(r.same === true, 'db.getPool() === tx.getPool() (single pool)');
ok(r.txOk && r.prepOk, 'tx() + prepare() both work through it');
ok(r.clients <= 3, `no connection leak at rest (${r.clients} client(s))`);

// graceful shutdown: boot server, SIGTERM, expect exit 0 quickly
const { default: net } = await import('node:net');
const srv = spawn('node', ['backend/src/index.js'], {
  env: { ...process.env, PORT: '3231' }, stdio: 'ignore', cwd: '/home/vutun/pmo_project',
});
await new Promise((res) => setTimeout(res, 3000));
// wedge a half-open connection (headers never completed) — shutdown must
// still terminate instead of hanging inside server.close() forever.
const wedged = net.connect(3231, '127.0.0.1', () => wedged.write('GET /api/health HTTP/1.1\r\nHost: x\r\n'));
await new Promise((res) => setTimeout(res, 500));
const t0 = Date.now();
const code = await new Promise((res) => { srv.on('exit', res); srv.kill('SIGTERM'); setTimeout(() => res('TIMEOUT'), 15000); });
wedged.destroy();
ok(code === 0, `SIGTERM with wedged connection → exit 0 in ${Date.now() - t0}ms (got ${code})`);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
