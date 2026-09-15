// P0-03: wizard endpoints require auth; authed demo login still passes auth layer.
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/p0-03-wizard-auth.mjs
import { execSync, spawn } from 'node:child_process';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const BASE = 'http://localhost:3102';
const env = { ...process.env, DATABASE_URL: process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo', PORT: '3102' };

const srv = spawn('node', ['backend/src/index.js'], { env, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 3500));
const dead = srv.exitCode !== null && srv.exitCode !== undefined;
ok(!dead, 'server booted');

try {
  const anon = [
    ['GET', '/api/upload/doc-types', null],
    ['POST', '/api/upload/1/configure', {}],
    ['POST', '/api/upload/1/preview', {}],
    ['POST', '/api/upload/1/commit', {}],
    ['POST', '/api/projects', { code: 'ANON-PROBE' }],
    ['POST', '/api/projects/1/zones', { code: 'ANON-ZONE' }],
  ];
  for (const [m, p, b] of anon) {
    const r = await fetch(BASE + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
    ok(r.status === 401, `anon ${m} ${p} → 401 (got ${r.status})`);
  }
  // No anon side effects
  const probe = await fetch(BASE + '/api/projects', { headers: { 'Content-Type': 'application/json' } });
  ok(probe.status === 401, 'anon project list blocked too (router already authed)');

  // Authed: demo login passes the auth layer (expect non-401: real validation codes)
  const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) });
  ok(login.status === 200, `demo login works (got ${login.status})`);
  const { token } = await login.json();
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const checks = [
    ['GET', '/api/upload/doc-types', null],
    ['POST', '/api/upload/999999/configure', {}],
    ['POST', '/api/upload/999999/preview', {}],
    ['POST', '/api/upload/999999/commit', {}],
  ];
  for (const [m, p, b] of checks) {
    const r = await fetch(BASE + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined });
    ok(r.status !== 401, `authed ${m} ${p} passes auth (got ${r.status})`);
  }
  // Authed project create with unique code → 201 (proves legit flow still open), then zones 409 dup proves zone path authed
  const code = `WIZ-AUTH-${Date.now()}`;
  const cr = await fetch(BASE + '/api/projects', { method: 'POST', headers: H, body: JSON.stringify({ code }) });
  ok(cr.status === 201, `authed POST /api/projects → 201 (got ${cr.status})`);
  const created = cr.status === 201 ? await cr.json() : null;
  if (created?.id) {
    const zr = await fetch(BASE + `/api/projects/${created.id}/zones`, { method: 'POST', headers: H, body: JSON.stringify({ code: 'Z1' }) });
    ok([201, 409].includes(zr.status), `authed POST /zones passes auth (got ${zr.status})`);
  } else ok(false, 'skip zone check: project create failed');
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
