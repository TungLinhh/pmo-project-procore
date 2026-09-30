// Project list visibility follows SRS Mục 6: each role sees assigned
// projects; admin/CEO have tenant-wide scope. Cross-tenant rows never leak.
import { spawn } from 'node:child_process';
import { cleanupProjectsOnExit } from './lib-cleanup.mjs';

let failures = 0;
const ok = (condition, message) => {
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${message}`);
  if (!condition) failures += 1;
};
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
process.env.DATABASE_URL = DB;
const BASE = process.env.BASE_URL || 'http://localhost:3119';
const port = new URL(BASE).port || '3000';
const srv = spawn('node', ['backend/src/index.js'], {
  env: { ...process.env, DATABASE_URL: DB, PORT: port, LOGIN_RATE_MAX: '1000' },
  stdio: 'ignore',
});
await new Promise((resolve) => setTimeout(resolve, 3500));


// Dọn dự án thử nghiệm nếu bài dừng giữa chừng — xem `lib-cleanup.mjs`.
cleanupProjectsOnExit(['ROLE-ASSIGNED-%', 'ROLE-HIDDEN-%'], { label: 'project-list-roles' });
let assignedId = null;
let hiddenId = null;
const call = async (token, path, options = {}) => {
  const response = await fetch(BASE + path, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  return { status: response.status, body: await response.json().catch(() => null) };
};

try {
  const login = async (email) => (await call(null, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'admin123' }),
  })).body?.token;
  const emails = ['pm@hbg.com', 'pmo@hbg.com', 'site@hbg.com', 'technical@hbg.com', 'procurement@hbg.com', 'accounting@hbg.com'];
  const admin = await login('admin@hbg.com');
  const tokens = Object.fromEntries(await Promise.all(emails.map(async (email) => [email, await login(email)])));
  ok(admin && Object.values(tokens).every(Boolean), 'demo role logins');

  const stamp = Date.now();
  const assigned = await call(admin, '/api/projects', {
    method: 'POST', body: JSON.stringify({ code: `ROLE-ASSIGNED-${stamp}`, name_vi: 'Role assigned' }),
  });
  const hidden = await call(admin, '/api/projects', {
    method: 'POST', body: JSON.stringify({ code: `ROLE-HIDDEN-${stamp}`, name_vi: 'Role hidden' }),
  });
  assignedId = assigned.body?.id || null;
  hiddenId = hidden.body?.id || null;
  ok([200, 201].includes(assigned.status) && [200, 201].includes(hidden.status), `admin creates assigned + hidden projects (${assigned.status}/${hidden.status})`);

  for (const email of emails) {
    const me = await call(tokens[email], '/api/me');
    const userId = me.body?.id ?? me.body?.user?.id;
    const add = await call(admin, `/api/projects/${assigned.body.id}/members`, {
      method: 'POST', body: JSON.stringify({ user_id: userId }),
    });
    ok([200, 201].includes(add.status), `admin assigns ${email} (${add.status})`);
  }

  for (const [email, token] of Object.entries(tokens)) {
    const response = await call(token, '/api/projects');
    const rows = Array.isArray(response.body) ? response.body : [];
    ok(response.status === 200 && rows.some((project) => project.id === assigned.body.id)
      && !rows.some((project) => project.id === hidden.body.id)
      && rows.every((project) => project.tenant_id === 1),
    `${email} sees assigned project and not hidden project (${response.status}/${rows.length})`);
  }

  const adminList = await call(admin, '/api/projects');
  ok(adminList.body.some((project) => project.id === hidden.body.id), 'admin has tenant-wide project scope');

  const anon = await call(null, '/api/projects');
  ok(anon.status === 401, `anonymous request → 401 (got ${anon.status})`);
} finally {
  const { getDb, closeDb } = await import('../../backend/src/db/index.js');
  const db = getDb();
  for (const projectId of [assignedId, hiddenId]) {
    if (!projectId) continue;
    await db.prepare('DELETE FROM project_members WHERE project_id = ?').runAsync(projectId);
    await db.prepare('DELETE FROM projects WHERE id = ?').runAsync(projectId);
  }
  await closeDb();
  srv.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
