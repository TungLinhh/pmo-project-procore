// Refresh-token reuse detection (SRS security / OAuth BCP).
//
// Before: a refresh token that was already rotated returned null and the stolen
// chain stayed alive — a stolen token and a benign double-submit looked the
// same. Now a replay older than the grace window revokes the whole family,
// bumps token_version (killing live access tokens) and writes an audit row.
import bcrypt from 'bcryptjs';
import { getDb, closeDb } from '../../backend/src/db/index.js';
import { api, psql, ok, summary } from './lib.mjs';

const stamp = Date.now();
const email = `rt-reuse-${stamp}@hbg.com`;
let userId = null;
let db = null;
let familyId = null;

const rotate = (t) => api('/api/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: t }) });

try {
  // Scratch user. The hash is produced through the app's own db API: a bcrypt
  // hash passed through psql's shell gets mangled by `$` expansion.
  db = getDb();
  const hbg = await db.prepare("SELECT id FROM users WHERE email = 'admin@hbg.com'").getAsync();
  const ins = await db.prepare(
    `INSERT INTO users (tenant_id, email, name, role, password_hash) VALUES (?, ?, 'RT reuse', 'admin', ?) RETURNING id`
  ).runAsync(hbg.id, email, await bcrypt.hash('admin123', 10));
  userId = Number(ins.lastInsertRowid);
  ok(!!userId, `scratch user #${userId}`);

  const login = await api('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'admin123' }) });
  const first = login.data?.refresh_token;
  ok(login.status === 200 && !!first, `login issues a refresh token (${login.status})`);

  const v0 = Number(psql(`SELECT token_version FROM users WHERE id = ${userId}`));

  // 1. Normal rotation works and keeps one family.
  const r1 = await rotate(first);
  ok(r1.status === 200 && r1.data?.refresh_token && r1.data?.refresh_token !== first, 'rotation issues a new token');
  const second = r1.data?.refresh_token;
  const fam = psql(`SELECT family_id FROM auth_refresh_tokens WHERE user_id = ${userId} ORDER BY id DESC LIMIT 1`);
  familyId = fam;
  ok(!!familyId, `family assigned (${familyId})`);
  ok(psql(`SELECT count(DISTINCT family_id) FROM auth_refresh_tokens WHERE user_id = ${userId}`) === '1',
    'rotated token inherits the same family');

  // 2. Replay inside the grace window = benign race, session survives.
  process.env.REFRESH_REUSE_GRACE_MS = '10000';
  const race = await rotate(first);
  ok(race.status === 401, `replay within grace rejected (got ${race.status})`);
  ok(Number(psql(`SELECT token_version FROM users WHERE id = ${userId}`)) === v0,
    'benign race does NOT revoke the family');

  // 3. Replay after the grace window = theft: whole family revoked.
  // Only the FIRST token is aged; the second is still live, so the family
  // revoke has real work to do and the audit records a non-zero count.
  psql(`UPDATE auth_refresh_tokens SET revoked_at = now() - interval '60 seconds'
        WHERE id = (SELECT id FROM auth_refresh_tokens WHERE user_id = ${userId} ORDER BY id ASC LIMIT 1)`);
  const replay = await rotate(first);
  ok(replay.status === 401, `stale replay rejected (got ${replay.status})`);
  const stillLive = psql(`SELECT count(*) FROM auth_refresh_tokens WHERE user_id = ${userId} AND revoked_at IS NULL`);
  ok(stillLive === '0', `whole family revoked (${stillLive} token còn sống)`);
  const v1 = Number(psql(`SELECT token_version FROM users WHERE id = ${userId}`));
  ok(v1 === v0 + 1, `token_version bumped so live access tokens die (${v0} -> ${v1})`);
  ok(psql(`SELECT count(*) FROM audit_log WHERE action = 'REFRESH_TOKEN_REUSE' AND user_id = ${userId}`) === '1',
    'REFRESH_TOKEN_REUSE audit row written');

  // 4. The user's other sessions are collateral — that is the intent.
  const login2 = await api('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'admin123' }) });
  ok(login2.status === 200, 'a fresh login still works after the reuse incident');
  const audit = JSON.parse(psql(`SELECT json_build_object('revoked', context->>'revoked_sessions')::text FROM audit_log WHERE action = 'REFRESH_TOKEN_REUSE' AND user_id = ${userId} ORDER BY id DESC LIMIT 1`));
  ok(Number(audit.revoked) >= 1, `audit records how many sessions were revoked (${audit.revoked})`);
} catch (e) {
  ok(false, e.message);
} finally {
  if (userId) {
    for (const sql of [
      `DELETE FROM audit_log WHERE user_id = ${userId}`,
      `DELETE FROM auth_refresh_tokens WHERE user_id = ${userId}`,
      `DELETE FROM users WHERE id = ${userId}`,
    ]) { try { psql(sql); } catch { /* keep cleaning */ } }
  }
  if (db) await closeDb();
  summary();
}
