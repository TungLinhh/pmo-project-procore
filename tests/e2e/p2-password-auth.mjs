// P2-9: real password check — bcrypt hashes, no plaintext, no hardcode.
// Demo logins keep working with admin123 (hashed); wrong passwords 401.
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/p2-password-auth.mjs
import { spawn } from 'node:child_process';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3107';
const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3107' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 3500));

try {
  const attempt = (email, password) => fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }).then(async r => ({ s: r.status, j: await r.json().catch(() => ({})) }));

  const good = await attempt('admin@hbg.com', 'admin123');
  ok(good.s === 200 && !!good.j.token, 'admin123 login works');
  const site = await attempt('site@hbg.com', 'admin123');
  ok(site.s === 200 && !!site.j.token, 'site login works with shared dev password');

  const wrong = await attempt('admin@hbg.com', 'wrongpass');
  ok(wrong.s === 401, `wrong password → 401 (got ${wrong.s})`);
  const myth = await attempt('ceo@hbg.com', 'ceo123');
  ok(myth.s === 401, 'per-user myth passwords never worked and still 401');
  const unknown = await attempt('nobody@hbg.com', 'admin123');
  ok(unknown.s === 401, 'unknown user → 401');

  // no plaintext, real bcrypt hashes
  const { getDb } = await import('../../backend/src/db/index.js');
  const db = getDb();
  const rows = await db.prepare('SELECT email, password_hash FROM users').allAsync();
  ok(rows.length > 0 && rows.every(u => u.password_hash && u.password_hash.startsWith('$2') && !u.password_hash.includes('admin123')), `all users have bcrypt hashes (${rows.length} users)`);
  const src = (await import('node:fs')).readFileSync('backend/src/routes/auth.js', 'utf8');
  ok(!src.includes("password !== 'admin123'"), 'hardcoded comparison removed');
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
