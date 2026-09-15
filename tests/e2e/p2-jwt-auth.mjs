// P2-10: JWT sessions — access JWT shape, tamper rejection, refresh rotation
// (single-use), logout kill, logout-all kill, short-TTL expiry. Real PG + server.
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/p2-jwt-auth.mjs
import { spawn } from 'node:child_process';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3107';
// short access TTL to prove expiry without waiting 24h
const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3107', ACCESS_TTL_SEC: '3' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 3500));

try {
  const login = (email, password) => fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }).then(async r => ({ s: r.status, j: await r.json().catch(() => ({})) }));
  const me = (t) => fetch(BASE + '/api/auth/me', { headers: { Authorization: `Bearer ${t}` } }).then(r => r.status);

  const l = await login('admin@hbg.com', 'admin123');
  ok(l.s === 200 && l.j.token?.split('.').length === 3 && !!l.j.refresh_token, 'login returns JWT + refresh');
  const access = l.j.token;
  let refresh = l.j.refresh_token;

  ok((await me(access)) === 200, 'access works');
  ok((await me(access + 'tampered')) === 401, 'tampered token → 401');

  // refresh rotation: old refresh dies, new pair works
  const r1 = await fetch(BASE + '/api/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: refresh }) }).then(async r => ({ s: r.status, j: await r.json().catch(() => ({})) }));
  ok(r1.s === 200 && !!r1.j.token && r1.j.refresh_token !== refresh, 'rotation issues new pair');
  const reuse = await fetch(BASE + '/api/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: refresh }) }).then(r => r.status);
  ok(reuse === 401, 'old refresh single-use dead');
  refresh = r1.j.refresh_token;

  // expiry: access dies after 3s TTL, refresh survives
  await new Promise(r => setTimeout(r, 3500));
  ok((await me(access)) === 401, 'expired access → 401');
  const r2 = await fetch(BASE + '/api/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: refresh }) }).then(async r => ({ s: r.status, j: await r.json().catch(() => ({})) }));
  ok(r2.s === 200 && (await me(r2.j.token)) === 200, 'refresh after expiry works');

  // logout kills that access token
  const fresh = r2.j.token;
  const lo = await fetch(BASE + '/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${fresh}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: r2.j.refresh_token }) }).then(r => r.status);
  ok(lo === 200 && (await me(fresh)) === 401, 'logout kills access');

  // logout-all kills everything including other sessions
  const a = await login('pm@hbg.com', 'admin123');
  const b = await login('pm@hbg.com', 'admin123');
  const alla = await fetch(BASE + '/api/auth/logout-all', { method: 'POST', headers: { Authorization: `Bearer ${a.j.token}` } }).then(r => r.status);
  const aDead = await me(a.j.token);
  const bDead = await me(b.j.token);
  const bRef = await fetch(BASE + '/api/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: b.j.refresh_token }) }).then(r => r.status);
  ok(alla === 200 && aDead === 401 && bDead === 401 && bRef === 401, 'logout-all kills all sessions + refresh');
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
