// Login must never guess a tenant when the same email exists in two tenants.
import { apiBase } from '../tools/env.mjs';

const BASE = apiBase();
let pass = 0;
let fail = 0;
const ok = (cond, detail) => {
  if (cond) { pass++; console.log(`PASS — ${detail}`); }
  else { fail++; console.log(`FAIL — ${detail}`); }
};

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const r = await fetch(BASE + path, { ...opts, headers });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data };
}

const stamp = Date.now();
const email = `shared-${stamp}@example.test`;
const codeA = `SHARED-A-${stamp}`;
const codeB = `SHARED-B-${stamp}`;
const tenantIds = [];
const userIds = [];
let db;

try {
  const dbModule = await import('../../backend/src/db/index.js');
  db = dbModule.getDb();
  for (const code of [codeA, codeB]) {
    const tenant = await db.prepare(
      `INSERT INTO tenants (code, name) VALUES (?, ?) RETURNING id`
    ).getAsync(code, `Tenant ${code}`);
    tenantIds.push(Number(tenant.id));
    const user = await db.prepare(
      `INSERT INTO users (tenant_id, email, name, role, password_hash)
       SELECT ?, ?, 'Shared Login', 'admin', password_hash
       FROM users WHERE email = 'admin@hbg.com' AND tenant_id = 1
       RETURNING id`
    ).getAsync(tenantIds.at(-1), email);
    userIds.push(Number(user.id));
  }
  ok(userIds.every((id) => id > 0), 'same email exists in two tenants');

  const ambiguous = await api('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ email, password: 'admin123' }),
  });
  ok(
    ambiguous.status === 409 && ambiguous.data?.error === 'TENANT_REQUIRED' && ambiguous.data?.tenants?.length === 2,
    `ambiguous login asks for tenant (${ambiguous.status}/${ambiguous.data?.error})`,
  );

  const ssoAmbiguous = await api('/api/auth/sso/start', {
    method: 'POST', body: JSON.stringify({ email }),
  });
  ok(
    ssoAmbiguous.status === 409 && ssoAmbiguous.data?.error === 'TENANT_REQUIRED',
    `ambiguous SSO asks for tenant (${ssoAmbiguous.status}/${ssoAmbiguous.data?.error})`,
  );

  const selected = await api('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ email, password: 'admin123', tenant: codeB }),
  });
  ok(
    selected.status === 200 && selected.data?.token && Number(selected.data?.user?.tenant_id) === tenantIds[1],
    `tenant code selects the exact account (${selected.status}/tenant=${selected.data?.user?.tenant_id})`,
  );

  if (selected.data?.refresh_token) {
    await api('/api/auth/logout', {
      method: 'POST', headers: { Authorization: `Bearer ${selected.data.token}` },
      body: JSON.stringify({ refresh_token: selected.data.refresh_token }),
    });
  }
} catch (e) {
  fail++;
  console.log(`FAIL — auth tenant test threw: ${e.message}`);
} finally {
  if (db) {
    for (const id of userIds) {
      await db.prepare('DELETE FROM auth_refresh_tokens WHERE user_id = ?').runAsync(id).catch(() => {});
      await db.prepare('DELETE FROM audit_log WHERE user_id = ?').runAsync(id).catch(() => {});
      await db.prepare('DELETE FROM users WHERE id = ?').runAsync(id).catch(() => {});
    }
    for (const id of tenantIds) await db.prepare('DELETE FROM tenants WHERE id = ?').runAsync(id).catch(() => {});
    const { closeDb } = await import('../../backend/src/db/index.js');
    await closeDb().catch(() => {});
  }
}

console.log(fail ? `\n${fail} FAILURE(S)` : '\nALL PASS');
process.exit(fail ? 1 : 0);
