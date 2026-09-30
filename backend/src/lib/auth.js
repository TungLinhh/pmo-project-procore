// Auth: JWT access tokens + opaque rotating refresh tokens (Phase 2).
// - Access: stateless HS256 JWT, TTL ACCESS_TTL_SEC (default 24h). Payload carries
//   role/is_ceo/tenant for display, but requireAuth ALWAYS reloads the user row,
//   so role/tenant changes and logout-all (token_version) take effect immediately.
// - Refresh: opaque random, sha256-hashed at rest, single-use rotation, 30d TTL.
// - Revocation: per-token (auth_revoked_jti denylist) + per-user (token_version bump).
import jwt from 'jsonwebtoken';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { getDb } from '../db/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-me';
if (!process.env.JWT_SECRET) {
  console.warn('[auth] JWT_SECRET not set — using dev default. Set a strong secret in production.');
}
const ACCESS_TTL_SEC = Number(process.env.ACCESS_TTL_SEC) || 86400;
const REFRESH_TTL_MS = (Number(process.env.REFRESH_TTL_DAYS) || 30) * 86400000;

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

export function issueAccess(user) {
  const jti = randomBytes(16).toString('hex');
  return jwt.sign(
    {
      sub: user.id, role: user.role, is_ceo: !!user.is_ceo,
      tenant_id: user.tenant_id, name: user.name, v: user.token_version ?? 0, jti,
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TTL_SEC },
  );
}

export async function createRefreshToken(userId, familyId = null) {
  const db = getDb();
  const raw = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  // A rotated token inherits its chain's family so a later replay can revoke
  // the whole chain. A login starts a new family.
  const family = familyId || randomUUID();
  await db.prepare(
    'INSERT INTO auth_refresh_tokens (user_id, token_hash, family_id, expires_at) VALUES (?, ?, ?, ?)'
  ).runAsync(userId, sha256(raw), family, expiresAt.toISOString().slice(0, 19).replace('T', ' '));
  return raw;
}

// How long after a rotation a replay of the same token is still treated as a
// benign race (two tabs refreshing together) rather than a stolen token.
const REFRESH_REUSE_GRACE_MS = Math.max(0, Number(process.env.REFRESH_REUSE_GRACE_MS) || 10_000);

// Single-use rotation: consumes `raw`, returns { user, refresh } or null.
export async function rotateRefresh(raw) {
  if (!raw) return null;
  const db = getDb();
  // Claim the refresh row atomically. Two concurrent requests can both pass a
  // prior SELECT, but only one can win this conditional UPDATE.
  const claim = await db.prepare(
    `UPDATE auth_refresh_tokens
     SET revoked_at = now()
     WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > now()
     RETURNING id, user_id, family_id`
  ).getAsync(sha256(raw));
  if (!claim) {
    await detectRefreshReuse(raw);
    return null;
  }
  const user = await db.prepare(
    'SELECT id, email, name, role, is_ceo, tenant_id, token_version FROM users WHERE id = ?'
  ).getAsync(claim.user_id);
  if (!user) return null;
  const refresh = await createRefreshToken(user.id, claim.family_id);
  return {
    user: { id: user.id, email: user.email, name: user.name, role: user.role, is_ceo: !!user.is_ceo, tenant_id: user.tenant_id, token_version: user.token_version ?? 0 },
    refresh,
  };
}

// Reuse detection: a token that was already consumed is either a race (within
// the grace window) or a stolen chain. Anything older revokes the whole family,
// bumps token_version so live access tokens die too, and leaves an audit row.
async function detectRefreshReuse(raw) {
  const db = getDb();
  const row = await db.prepare(
    'SELECT id, user_id, family_id, revoked_at FROM auth_refresh_tokens WHERE token_hash = ?'
  ).getAsync(sha256(raw));
  if (!row || !row.revoked_at) return null;
  const ageMs = Date.now() - new Date(row.revoked_at).getTime();
  if (ageMs < REFRESH_REUSE_GRACE_MS) return null;   // benign race
  const revoked = await db.prepare(
    `UPDATE auth_refresh_tokens SET revoked_at = now()
     WHERE user_id = ? AND family_id = ? AND revoked_at IS NULL`
  ).runAsync(row.user_id, row.family_id);
  const user = await db.prepare('SELECT tenant_id, name, email FROM users WHERE id = ?').getAsync(row.user_id);
  if (user) {
    // token_version invalidates outstanding access tokens for this user.
    await db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').runAsync(row.user_id);
    await db.prepare(
      `INSERT INTO audit_log (tenant_id, user_id, user_name, action, resource_type, resource_id, context, actor_role, note)
       VALUES (?, ?, ?, 'REFRESH_TOKEN_REUSE', 'user', ?, ?::jsonb, 'system', ?)`
    ).runAsync(
      user.tenant_id, row.user_id, user.name, row.user_id,
      JSON.stringify({ family_id: row.family_id, revoked_sessions: revoked.changes ?? 0, age_ms: Math.round(ageMs) }),
      'Refresh token tái sử dụng sau khi đã xoay — đã thu hồi toàn bộ phiên của tài khoản',
    ).catch(() => {});
  }
  return { userId: row.user_id, familyId: row.family_id, revokedSessions: revoked.changes ?? 0 };
}

export async function revokeRefresh(raw) {
  if (!raw) return;
  const db = getDb();
  await db.prepare('UPDATE auth_refresh_tokens SET revoked_at = now() WHERE token_hash = ?').runAsync(sha256(raw));
}

export async function revokeAccess(jti, expSec) {
  if (!jti) return;
  const db = getDb();
  const exp = new Date((expSec || Math.floor(Date.now() / 1000) + ACCESS_TTL_SEC) * 1000);
  // NOTE: explicit RETURNING jti — the db wrapper auto-appends RETURNING id to
  // bare INSERTs, and this table has no id column.
  await db.prepare('INSERT INTO auth_revoked_jti (jti, expires_at) VALUES (?, ?) ON CONFLICT (jti) DO NOTHING RETURNING jti')
    .runAsync(jti, exp.toISOString().slice(0, 19).replace('T', ' '));
  // opportunistic purge of expired denylist entries
  await db.prepare('DELETE FROM auth_revoked_jti WHERE expires_at < now()').runAsync().catch(() => {});
}

// Logout everywhere: bumps version (all access tokens die) + revokes refresh rows.
export async function revokeAllSessions(userId) {
  const db = getDb();
  await db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').runAsync(userId);
  await db.prepare('UPDATE auth_refresh_tokens SET revoked_at = now() WHERE user_id = ? AND revoked_at IS NULL').runAsync(userId);
}

// The session lookup shared by access tokens and stream tickets: fresh row,
// denylist, and token_version (so logout-everywhere still applies).
async function userForToken(payload) {
  const db = getDb();
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').getAsync(payload.sub).catch(() => null);
  if (!user) return null;
  if ((user.token_version ?? 0) !== (payload.v ?? 0)) return null;
  return user;
}

// Verify access token → fresh user row, or null. Never trusts payload roles.
export async function verifyAccess(token) {
  if (!token) return null;
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch { return null; }
  const db = getDb();
  const denied = await db.prepare('SELECT 1 FROM auth_revoked_jti WHERE jti = ?').getAsync(payload.jti).catch(() => null);
  if (denied) return null;
  // A stream ticket is audience-bound. jwt.verify without `audience` ignores the
  // claim, so a ticket would otherwise work as a general bearer token for its
  // whole TTL — check the marker explicitly.
  if (payload.typ === 'stream' || payload.aud === 'stream') return null;
  return userForToken(payload);
}

// ---- Stream tickets -------------------------------------------------------
// EventSource cannot set an Authorization header, so the SSE handshake used to
// carry the long-lived access token in the query string — where it lands in
// nginx/Cloudflare access logs, proxy logs, browser history and Referer
// headers. A ticket is a separate, deliberately weak credential: 45s to open
// one stream, burned on first use, and rejected by every other endpoint
// because of the `stream` audience. Burning goes through auth_revoked_jti so
// single-use holds across instances, not just inside one process.
export const STREAM_TICKET_TTL_SEC = Math.max(15, Number(process.env.STREAM_TICKET_TTL_SEC) || 45);

export function issueStreamTicket(user) {
  return jwt.sign(
    { typ: 'stream', sub: user.id, v: user.token_version ?? 0 },
    JWT_SECRET,
    { expiresIn: STREAM_TICKET_TTL_SEC, audience: 'stream', jwtid: randomUUID() },
  );
}

// Burn the ticket and resolve its user, or null. A replay hits the jti unique
// index (the INSERT returns no row) and is refused.
export async function consumeStreamTicket(ticket) {
  if (!ticket) return null;
  let payload;
  try {
    payload = jwt.verify(ticket, JWT_SECRET, { audience: 'stream' });
  } catch { return null; }
  if (payload.typ !== 'stream' || !payload.jti) return null;
  const db = getDb();
  const exp = new Date((payload.exp || 0) * 1000);
  const burned = await db.prepare(
    'INSERT INTO auth_revoked_jti (jti, expires_at) VALUES (?, ?) ON CONFLICT (jti) DO NOTHING'
  ).runAsync(payload.jti, exp.toISOString().slice(0, 19).replace('T', ' ')).catch(() => null);
  if (!burned || burned.changes !== 1) return null;   // replayed or already burned
  return userForToken(payload);
}

// Backward-compat: set req.session.* (deprecated, use req.user.* instead)
function attachSession(req, user) {
  req.session = req.session || {};
  req.session.user_id = user.id;
  req.session.user_name = user.name;
  req.session.role = user.role;
}

// requireAuth: 401 nếu chưa đăng nhập (async — verifies signature + denylist + fresh row)
export async function requireAuth(req, res, next) {
  try {
    const auth = req.headers?.authorization;
    const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const user = await verifyAccess(token);
    if (!user) return res.status(401).json({ error: 'Unauthorized. Đăng nhập để tiếp tục.' });
    // Forced rotation gate (Wave 2 A2): temp password must be changed before
    // ANYTHING else. Login still issues tokens (so the change call itself
    // authenticates); allowlist is the only open surface. Fresh row every
    // request → the gate lifts the moment the password changes.
    if (user.must_change_password) {
      const p = (req.originalUrl || '').split('?')[0];
      const open = ['/api/me/password', '/api/auth/logout', '/api/auth/logout-all', '/api/me'];
      if (!open.includes(p)) {
        return res.status(403).json({ error: 'PASSWORD_CHANGE_REQUIRED', must_change_password: true });
      }
    }
    req.user = user;
    attachSession(req, user);
    // Establish the tenant context for the rest of this request: every pooled
    // query downstream SETs app.current_tenant (RLS) from here. The lookup above
    // runs WITHOUT tenant on purpose (login-time user reload must not filter).
    const { runWithTenant } = await import('./tenant.js');
    runWithTenant(user.tenant_id, () => next());
  } catch (e) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
}

// requireRole(...roles): 403 nếu không đúng role
// NOTE: 'ceo' is NOT a users.role value — the CEO is role='pmo' + is_ceo=1.
// A bare roles.includes check made every requireRole('ceo',…) unreachable.
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const held = new Set([req.user.role, ...(req.user.is_ceo ? ['ceo'] : [])]);
    if (roles.length && !roles.some(r => held.has(r))) {
      return res.status(403).json({ error: `Forbidden. Cần role: ${roles.join('|')}` });
    }
    next();
  };
}

// Legacy compat (Map sessions removed): createSession issues an access JWT.
// Prefer issueAccess + createRefreshToken directly.
export function createSession(user) {
  return issueAccess(user);
}
export async function destroySession(token) {
  if (!token) return false;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    await revokeAccess(payload.jti, payload.exp);
    return true;
  } catch { return false; }
}

// Helper: lấy user hiện tại (dùng trong route, optional)
// Fail-closed: trả về null khi không có auth — caller phải xử lý 401.
export function currentUser(req) {
  if (req.user) {
    return {
      id: req.user.id,
      name: req.user.name || req.user.full_name || 'System',
      role: req.user.role || 'admin',
      tenant_id: req.user.tenant_id,
      is_ceo: !!req.user.is_ceo,
    };
  }
  return null;
}
