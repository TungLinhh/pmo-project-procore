// P0-04: sessions expire (JWT); no admin fallback for missing/invalid/expired tokens.
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/p0-04-session.mjs
import { spawn } from 'node:child_process';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';

async function boot(port, extraEnv) {
  const srv = spawn('node', ['backend/src/index.js'], {
    env: { ...process.env, DATABASE_URL: DB, PORT: String(port), ...extraEnv }, stdio: 'ignore',
  });
  await new Promise(r => setTimeout(r, 3500));
  ok(srv.exitCode === null || srv.exitCode === undefined, `server booted on ${port}`);
  return srv;
}

// --- Server A: normal TTL — invalid/garbage tokens must be 401 (no admin fallback)
{
  const srv = await boot(3103, {});
  try {
    const BASE = 'http://localhost:3103';
    const bad = await fetch(BASE + '/api/projects', { headers: { Authorization: 'Bearer garbage-token' } });
    ok(bad.status === 401, `garbage token → 401 (got ${bad.status})`);
    const none = await fetch(BASE + '/api/projects');
    ok(none.status === 401, `missing token → 401 (got ${none.status})`);
    const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) });
    ok(login.status === 200, `demo login works (got ${login.status})`);
    const { token } = await login.json();
    ok(typeof token === 'string' && token.split('.').length === 3, 'token is a JWT');
    const good = await fetch(BASE + '/api/projects', { headers: { Authorization: `Bearer ${token}` } });
    ok(good.status === 200, `valid token → 200 (got ${good.status})`);
  } finally { srv.kill('SIGTERM'); await new Promise(r => setTimeout(r, 1000)); }
}

// --- Server B: short TTL — token works, then expires to 401
{
  const srv = await boot(3104, { ACCESS_TTL_SEC: '1' });
  try {
    const BASE = 'http://localhost:3104';
    const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) });
    const { token } = await login.json();
    const fresh = await fetch(BASE + '/api/projects', { headers: { Authorization: `Bearer ${token}` } });
    ok(fresh.status === 200, `fresh token → 200 (got ${fresh.status})`);
    await new Promise(r => setTimeout(r, 2200));
    const stale = await fetch(BASE + '/api/projects', { headers: { Authorization: `Bearer ${token}` } });
    ok(stale.status === 401, `expired token → 401 (got ${stale.status})`);
  } finally { srv.kill('SIGTERM'); await new Promise(r => setTimeout(r, 1000)); }
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
