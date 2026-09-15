// P1-05: bell/center/progress deep-links land on the real detail route + detail loads.
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/p1-05-issue-links.mjs
import { spawn, execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3205';

// static: all senders target the registered detail route
const routeSrc = readFileSync('frontend/src/App.jsx', 'utf8');
ok(routeSrc.includes('path="issues/item"'), 'App registers issues/item route');
for (const [f, bad] of [
  ['frontend/src/components/BellDropdown.jsx', '/hq/issues?item='],
  ['frontend/src/hq/NotificationCenter.jsx', '/hq/issues?item='],
  ['frontend/src/hq/ProgressDetail.jsx', '/hq/issues?item='],
]) {
  const src = readFileSync(f, 'utf8');
  ok(!src.includes(bad), `${f} has no dead /hq/issues?item= link`);
}
for (const f of ['frontend/src/components/BellDropdown.jsx', 'frontend/src/hq/NotificationCenter.jsx', 'frontend/src/hq/ProgressDetail.jsx', 'frontend/src/hq/Issues.jsx']) {
  ok(readFileSync(f, 'utf8').includes('/hq/issues/item?item='), `${f} links /hq/issues/item?item=`);
}

// live: the detail record behind such a link actually loads via API
const PSQL = 'PGPASSWORD=pmo_dev_pwd /home/linuxbrew/.linuxbrew/bin/psql -h 127.0.0.1 -p 5433 -U pmo_user -d pmo -t -A';
const psql = (sql) => execSync(`${PSQL} -c "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();
const title = `p1-05-${Date.now()}`;
const iid = psql(`INSERT INTO issues (tenant_id, project_id, title, body, severity, status) VALUES (1, 1, '${title}', 'x', 'HIGH', 'OPEN') RETURNING id;`).split('\n')[0];

const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3205' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 3500));
try {
  const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) });
  const { token, user } = await login.json();
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  // notification pointing at the issue (what the bell renders)
  await fetch(BASE + '/api/notifications', { method: 'POST', headers: H, body: JSON.stringify({ user_ids: [user.id], title: `n-${title}`, body: 'x', resourceType: 'issue', resource_id: Number(iid) }) });
  const list = await fetch(BASE + '/api/notifications', { headers: H }).then(r => r.json());
  const n = list.find(x => x.title === `n-${title}`);
  ok(n && n.resource_type === 'issue' && String(n.resource_id) === String(iid), 'bell notification carries issue resource pointer');
  // the detail endpoint behind /hq/issues/item?item=<id> serves the record
  const det = await fetch(`${BASE}/api/issues/${iid}`, { headers: H });
  ok(det.status === 200, `GET /api/issues/:id → 200 (got ${det.status})`);
  const dj = await det.json();
  ok(dj.title === title, 'detail record matches link target');
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
  psql(`DELETE FROM notifications WHERE title='n-${title}'; DELETE FROM issues WHERE id=${iid};`);
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
