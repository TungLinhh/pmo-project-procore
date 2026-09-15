// P0-05: notifyMany arity fixed; directive + manual notification create real rows.
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/p0-05-notify.mjs
import { spawn } from 'node:child_process';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3105';
const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3105' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 3500));

try {
  const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) });
  const { token, user } = await login.json();
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  // 1. Manual notify creates one row per user with lowercase severity + in_app channel
  const uniq = `p0-05-${Date.now()}`;
  const cr = await fetch(BASE + '/api/notifications', { method: 'POST', headers: H, body: JSON.stringify({ user_ids: [user.id], title: uniq, body: 'hello', severity: 'INFO' }) });
  const cj = await cr.json();
  ok(cr.status === 200 && cj.count === 1, `POST /notifications → 200 count=1 (got ${cr.status})`);
  const list = await fetch(BASE + '/api/notifications?unread_only=1', { headers: H }).then(r => r.json());
  const mine = list.find(n => n.title === uniq);
  ok(!!mine, 'notification row exists and unread filter finds it');
  ok(mine && mine.severity === 'info', `severity normalized lowercase (got ${mine?.severity})`);
  ok(mine && mine.channel === 'in_app', `channel in_app (got ${mine?.channel})`);

  // 2. Directive with notify_to_user_ids creates directive + notification (BellDropdown shape)
  const dBody = `directive-p0-05-${Date.now()}`;
  const dr = await fetch(BASE + '/api/directives', { method: 'POST', headers: H, body: JSON.stringify({ project_id: 1, body: dBody, notify_to_user_ids: [user.id] }) });
  ok(dr.status === 200, `POST /directives → 200 (got ${dr.status})`);
  await new Promise(r => setTimeout(r, 800)); // notifyMany is async-after-response
  const list2 = await fetch(BASE + '/api/notifications?unread_only=1', { headers: H }).then(r => r.json());
  const dn = list2.find(n => n.resource_type === 'directive' && n.project_id === 1);
  ok(!!dn, 'directive notification row exists with resource_type=directive + project_id=1');
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
