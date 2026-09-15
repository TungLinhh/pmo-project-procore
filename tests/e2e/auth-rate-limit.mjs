// Login rate limiting (v0.6.1): 10/min/IP → 429, legit login unaffected.
// Spawns its own server (isolated in-memory counters). LOGIN_FAILED rows land
// in audit_log (harmless, same as real brute-force traces).
// Run: node tests/e2e/auth-rate-limit.mjs
import { spawn } from 'node:child_process';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const BASE = 'http://localhost:3113';
const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, PORT: '3113' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 3500));

try {
  const attempt = (password) => fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@hbg.com', password }),
  }).then(async r => ({ s: r.status, j: await r.json().catch(() => null) }));

  // 10 bad attempts → 401 each (limit is 10/min).
  let last = null;
  for (let i = 0; i < 10; i++) last = await attempt('wrong-pw');
  ok(last.s === 401, `10 bad logins → 401 (got ${last.s})`);
  // 11th → 429 with Vietnamese message.
  const over = await attempt('wrong-pw');
  ok(over.s === 429 && /Quá nhiều/.test(over.j?.error || ''), `11th → 429 vi message (got ${over.s})`);

  // Failed attempts are audited.
  const { getDb } = await import('../../backend/src/db/index.js');
  const db = getDb();
  const n = await db.prepare(
    `SELECT COUNT(*)::int AS n FROM audit_log WHERE action = 'LOGIN_FAILED' AND created_at > now() - interval '2 minutes'`
  ).getAsync();
  ok(n.n >= 10, `LOGIN_FAILED audited (got ${n.n})`);
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
