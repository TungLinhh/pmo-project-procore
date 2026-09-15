// P1-03: notification read-state contract — read_at + ?unread_only=1 end to end.
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/p1-03-notify-read.mjs
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3203';
const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3203' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 3500));
try {
  const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) });
  const { token, user } = await login.json();
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const uniq = `p1-03-${Date.now()}`;
  await fetch(BASE + '/api/notifications', { method: 'POST', headers: H, body: JSON.stringify({ user_ids: [user.id], title: uniq, body: 'x' }) });

  const all = await fetch(BASE + '/api/notifications', { headers: H }).then(r => r.json());
  const row = all.find(n => n.title === uniq);
  ok(row && row.read_at === null && !('is_read' in row), `new row unread via read_at=null, no is_read field (got read_at=${row?.read_at})`);

  const unread = await fetch(BASE + '/api/notifications?unread_only=1', { headers: H }).then(r => r.json());
  ok(unread.some(n => n.title === uniq), 'unread_only=1 filter finds it');

  const mr = await fetch(BASE + `/api/notifications/${row.id}/read`, { method: 'POST', headers: H });
  ok(mr.status === 200, `markRead → 200 (got ${mr.status})`);

  const unread2 = await fetch(BASE + '/api/notifications?unread_only=1', { headers: H }).then(r => r.json());
  ok(!unread2.some(n => n.title === uniq), 'read item leaves the unread filter');
  const all2 = await fetch(BASE + '/api/notifications', { headers: H }).then(r => r.json());
  ok(all2.find(n => n.title === uniq)?.read_at !== null, 'row keeps read_at timestamp after read');

  // static: frontend speaks the same contract
  for (const f of ['frontend/src/api/index.js', 'frontend/src/components/BellDropdown.jsx', 'frontend/src/hq/NotificationCenter.jsx']) {
    const src = readFileSync(f, 'utf8');
    ok(!src.includes('is_read'), `${f} has no is_read`);
  }
  ok(readFileSync('frontend/src/api/index.js', 'utf8').includes('unread_only=1'), 'api client sends ?unread_only=1');
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
