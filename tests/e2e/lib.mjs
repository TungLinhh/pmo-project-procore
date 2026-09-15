// Shared E2E helpers — new tests import from here instead of reinventing
// login/fetch/psql. Rules: no absolute paths (use ROOT), no hardcoded ports
// except BASE_URL default, throwaway rows must be cleaned by the test.
//   import { api, loginAs, psql, ok, summary } from '../e2e/lib.mjs';
import { psqlQuery } from '../tools/env.mjs';

export const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
export const BASE = process.env.BASE_URL || 'http://localhost:3000';
export const PG = {
  host: process.env.PGHOST || '127.0.0.1',
  port: process.env.PGPORT || '5433',
  user: process.env.PGUSER || 'pmo_user',
  password: process.env.PGPASSWORD || 'pmo_dev_pwd',
};

let pass = 0, fail = 0;
export const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); cond ? pass++ : fail++; };
export const summary = () => {
  console.log(pass && !fail ? '\nALL PASS' : `\n${fail} FAILURE(S)`);
  process.exit(fail ? 1 : 0);
};

export async function api(path, opts = {}) {
  const r = await fetch(BASE + path, opts);
  let data = null;
  try { data = await r.json(); } catch {}
  return { status: r.status, data };
}

export const loginAs = async (email) => (await api('/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: 'admin123' }),
})).data?.token;

export const auth = (token) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
export const J = (token, body) => ({ headers: auth(token), body: JSON.stringify(body) });

// psql against the target database via env-driven client (PGHOST/PGPORT/
// PGUSER/PGPASSWORD/PGDATABASE/PSQL_BIN). Portable: works on CI runners,
// unlike backend/scripts/pg-ctl.sh which is local-dev only (hardcoded
// Homebrew binary path + dev password). Returns first line of -t -A output
// (strips the 'INSERT 0 1'-style tags psql prints for RETURNING queries).
export const psql = (sql) => psqlQuery(sql).split('\n')[0];
