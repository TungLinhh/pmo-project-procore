// Project list visibility (regression: default-deny + trailing-slash normalization).
// Every authenticated role in the tenant lists HBG projects (200, tenant-scoped);
// cross-tenant pilot admin sees ONLY pilot projects.
// Run: node tests/e2e/project-list-roles.mjs (spawns its own server, needs dev DB)
import { spawn } from 'node:child_process';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3119';
const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3119' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 3500));

try {
  const loginAs = async (email) => fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'admin123' }) }).then(r => r.json()).then(j => j.token);
  for (const email of ['pm@hbg.com', 'pmo@hbg.com', 'site@hbg.com', 'procurement@hbg.com', 'accounting@hbg.com']) {
    const t = await loginAs(email);
    const r = await fetch(BASE + '/api/projects', { headers: { Authorization: `Bearer ${t}` } }).then(async r => ({ s: r.status, j: await r.json().catch(() => null) }));
    ok(r.s === 200 && Array.isArray(r.j) && r.j.length >= 2 && r.j.every((p) => p.tenant_id === 1), `${email} lists HBG projects (got ${r.s}/${r.j?.length})`);
  }
  const pilotT = await loginAs('admin@pilot.test');
  const rp = await fetch(BASE + '/api/projects', { headers: { Authorization: `Bearer ${pilotT}` } }).then(async r => ({ s: r.status, j: await r.json().catch(() => null) }));
  ok(rp.s === 200 && rp.j.length === 1 && rp.j[0].code === 'PILOT-001', `pilot sees only PILOT-001 (got ${JSON.stringify(rp.j?.map((p) => p.code))})`);
  const anon = await fetch(BASE + '/api/projects').then(r => r.status);
  ok(anon === 401, `anon → 401 (got ${anon})`);
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
