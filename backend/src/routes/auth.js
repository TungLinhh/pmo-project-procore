// Auth routes — login (JWT + refresh), TOTP MFA step, refresh rotation, logout, logout-all, me
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import {
  requireAuth, issueAccess, createRefreshToken, rotateRefresh,
  revokeRefresh, revokeAccess, revokeAllSessions, destroySession,
} from '../lib/auth.js';
import { verifyTotp, devPasswordAllowed, DEV_PASSWORD } from '../lib/mfa.js';
import { dec } from '../lib/crypto.js';
import { getDb } from '../db/index.js';
import { loginLimiter, refreshLimiter } from '../lib/rate-limit.js';

const router = Router({ mergeParams: true });

const publicUser = (u) => ({ id: u.id, email: u.email, full_name: u.name, role: u.role, is_ceo: !!u.is_ceo, tenant_id: u.tenant_id, must_change_password: !!u.must_change_password, mfa_enabled: !!u.mfa_enabled, locale: u.locale || 'vi' });

// Email is unique per (tenant_id, email) — NOT globally. Same address in two
// tenants must never log into whichever row LIMIT 1 happens to return.
// Optional `tenant` in body (id or code) disambiguates; without it, >1 match
// is a 409 asking the client to specify (login UI offers a tenant picker).
async function findLoginUser(db, email, tenant) {
  const rows = await db.prepare(
    `SELECT u.*, t.code AS tenant_code, t.name AS tenant_name
     FROM users u JOIN tenants t ON t.id = u.tenant_id
     WHERE u.email = ? ORDER BY u.tenant_id`
  ).allAsync(email);
  if (!rows.length) return { user: null };
  if (rows.length === 1) return { user: rows[0] };
  if (tenant !== undefined && tenant !== null && tenant !== '') {
    const hit = rows.find((u) => String(u.tenant_id) === String(tenant));
    if (hit) return { user: hit };
    const codes = await db.prepare(
      `SELECT id FROM tenants WHERE code = ?`
    ).getAsync(String(tenant)).catch(() => null);
    if (codes) {
      const byTenant = rows.find((u) => Number(u.tenant_id) === Number(codes.id));
      if (byTenant) return { user: byTenant };
    }
  }
  return {
    user: null,
    ambiguous: true,
    tenants: rows.map((u) => ({
      id: u.tenant_id,
      code: u.tenant_code,
      name: u.tenant_name,
    })),
  };
}

async function passwordOk(db, user, password) {
  if (!user.password_hash) return false;
  // SRS: cấm mật khẩu dev dùng chung ở production (mở khóa khẩn cấp bằng
  // ALLOW_DEV_PASSWORD=1 — mọi lần dùng đều ghi log warn).
  if (password === DEV_PASSWORD && !devPasswordAllowed()) {
    console.warn(`[auth] blocked dev-password login for ${user.email} (production)`);
    await db.prepare(
      `INSERT INTO audit_log (tenant_id, user_id, user_name, action, resource_type, context, actor_role, note)
       VALUES (?, ?, ?, 'LOGIN_BLOCKED', 'user', ?, ?, 'Mật khẩu demo bị chặn ở production')`
    ).runAsync(user.tenant_id, user.id, user.name, JSON.stringify({ email: user.email }), user.role)
      // A lost auth audit row is invisible afterwards; surface it instead of swallowing.
      .catch((e) => console.error('[auth] LOGIN_BLOCKED audit failed', e.message));
    return false;
  }
  return bcrypt.compare(password, user.password_hash);
}

async function issueLoginPair(db, user) {
  const token = issueAccess(user);
  const refresh_token = await createRefreshToken(user.id);
  const body = { token, refresh_token, user: publicUser(user) };
  if (user.must_change_password) {
    return { status: 403, body: { ...body, error: 'PASSWORD_CHANGE_REQUIRED', must_change_password: true } };
  }
  return { status: 200, body };
}

router.post('/login', loginLimiter, async (req, res) => {
  const db = getDb();
  const { email, password, tenant } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email + password required' });
  const found = await findLoginUser(db, email, tenant);
  if (found.ambiguous) {
    return res.status(409).json({ error: 'TENANT_REQUIRED', message: 'Email thuộc nhiều tenant — hãy chọn tenant', tenants: found.tenants });
  }
  const user = found.user;
  if (!user) return res.status(401).json({ error: 'Sai email hoặc mật khẩu' });
  // Phase 2: real password check (demo users share hashed 'admin123', set by init.js).
  const okPass = await passwordOk(db, user, password);
  if (!okPass) {
    // Failed attempt is auditable (same tx not needed — login has no session yet).
    await db.prepare(
      `INSERT INTO audit_log (tenant_id, user_id, user_name, action, resource_type, context, actor_role, note)
       VALUES (?, ?, ?, 'LOGIN_FAILED', 'user', ?, ?, 'Sai mật khẩu')`
    ).runAsync(user.tenant_id, user.id, user.name, JSON.stringify({ email }), user.role)
      .catch((e) => console.error('[auth] security audit failed', e.message));
    return res.status(401).json({ error: 'Sai email hoặc mật khẩu' });
  }
  // MFA bật: không cấp token ở bước này — client gọi tiếp /mfa/verify.
  if (user.mfa_enabled) {
    return res.status(401).json({ error: 'MFA_REQUIRED', mfa_required: true, email: user.email });
  }
  const { status, body } = await issueLoginPair(db, user);
  // Forced rotation (Wave 2 A2): temp password from admin reset. Tokens ARE
  // issued (so the change-password call authenticates) but the client must
  // branch to it — every other endpoint stays usable, matching "login works".
  res.status(status).json(body);
});

// Bước 2 MFA: {email, password, code} → tokens đầy đủ (rate-limit như login).
router.post('/mfa/verify', loginLimiter, async (req, res) => {
  const db = getDb();
  const { email, password, code, tenant } = req.body || {};
  if (!email || !password || !code) return res.status(400).json({ error: 'email + password + code required' });
  const found = await findLoginUser(db, email, tenant);
  if (found.ambiguous) {
    return res.status(409).json({ error: 'TENANT_REQUIRED', message: 'Email thuộc nhiều tenant — hãy chọn tenant', tenants: found.tenants });
  }
  const user = found.user;
  if (!user || !(await passwordOk(db, user, password))) {
    return res.status(401).json({ error: 'Sai email hoặc mật khẩu' });
  }
  if (!user.mfa_enabled || !user.mfa_secret) {
    return res.status(400).json({ error: 'MFA chưa bật cho tài khoản này' });
  }
  if (!verifyTotp(dec(user.mfa_secret), code)) {
    await db.prepare(
      `INSERT INTO audit_log (tenant_id, user_id, user_name, action, resource_type, context, actor_role, note)
       VALUES (?, ?, ?, 'MFA_FAILED', 'user', ?, ?, 'Sai mã MFA')`
    ).runAsync(user.tenant_id, user.id, user.name, JSON.stringify({ email }), user.role)
      .catch((e) => console.error('[auth] security audit failed', e.message));
    return res.status(401).json({ error: 'Sai mã xác thực' });
  }
  const { status, body } = await issueLoginPair(db, user);
  res.status(status).json(body);
});

// Single-use refresh rotation. Old refresh dies even if the response is lost
// (client must persist the newest pair) — standard rotation semantics.
router.post('/refresh', refreshLimiter, async (req, res) => {
  const { refresh_token } = req.body || {};
  const rotated = await rotateRefresh(refresh_token);
  if (!rotated) return res.status(401).json({ error: 'Refresh token invalid or expired' });
  res.json({ token: issueAccess(rotated.user), refresh_token: rotated.refresh, user: publicUser(rotated.user) });
});

router.post('/logout', requireAuth, async (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer\s+/, '');
  await destroySession(token);
  const { refresh_token } = req.body || {};
  if (refresh_token) await revokeRefresh(refresh_token);
  res.json({ ok: true });
});

// Logout everywhere: kills ALL access + refresh tokens of the caller.
router.post('/logout-all', requireAuth, async (req, res) => {
  await revokeAllSessions(req.user.id);
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: publicUser(req.user) });
});

export default router;
