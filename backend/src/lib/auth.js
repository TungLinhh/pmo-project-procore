// Auth: JWT access tokens + opaque rotating refresh tokens (Phase 2).
// - Access: stateless HS256 JWT, TTL ACCESS_TTL_SEC (default 24h). Payload carries
//   role/is_ceo/tenant for display, but requireAuth ALWAYS reloads the user row,
//   so role/tenant changes and logout-all (token_version) take effect immediately.
// - Refresh: opaque random, sha256-hashed at rest, single-use rotation, 30d TTL.
// - Revocation: per-token (auth_revoked_jti denylist) + per-user (token_version bump).
import jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'node:crypto';
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

export async function createRefreshToken(userId) {
  const db = getDb();
  const raw = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  await db.prepare(
    'INSERT INTO auth_refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)'
  ).runAsync(userId, sha256(raw), expiresAt.toISOString().slice(0, 19).replace('T', ' '));
  return raw;
}

// Single-use rotation: consumes `raw`, returns { user, refresh } or null.
export async function rotateRefresh(raw) {
  if (!raw) return null;
  const db = getDb();
  const row = await db.prepare(
    `SELECT rt.id AS rt_id, rt.revoked_at AS rt_revoked, rt.expires_at AS rt_exp,
            u.id AS user_id, u.email, u.name, u.role, u.is_ceo, u.tenant_id, u.token_version
     FROM auth_refresh_tokens rt JOIN users u ON u.id = rt.user_id WHERE rt.token_hash = ?`
  ).getAsync(sha256(raw));
  // NOTE: never SELECT rt.*, u.* here — duplicate `id` collapses to users.id
  // and the revoke below would hit the wrong refresh row.
  if (!row || row.rt_revoked || new Date(row.rt_exp).getTime() <= Date.now()) return null;
  await db.prepare('UPDATE auth_refresh_tokens SET revoked_at = now() WHERE id = ?').runAsync(row.rt_id);
  const refresh = await createRefreshToken(row.user_id);
  return {
    user: { id: row.user_id, email: row.email, name: row.name, role: row.role, is_ceo: !!row.is_ceo, tenant_id: row.tenant_id, token_version: row.token_version ?? 0 },
    refresh,
  };
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
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').getAsync(payload.sub).catch(() => null);
  if (!user) return null;
  if ((user.token_version ?? 0) !== (payload.v ?? 0)) return null;
  return user;
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
    req.user = user;
    attachSession(req, user);
    next();
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
