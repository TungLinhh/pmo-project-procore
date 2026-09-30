// SSO OIDC (public, mount /api/auth/sso — permissionMiddleware mien /api/auth/*).
// Flow: POST /start {email} -> {auth_url} -> browser sang IdP ->
// frontend /sso/callback lay {code,state} -> POST /callback -> tokens
// (hoac 401 MFA_REQUIRED + sso_pending khi user bat TOTP).
import { Router } from 'express';
import { issueAccess, createRefreshToken } from '../lib/auth.js';
import { getDb } from '../db/index.js';
import { loginLimiter } from '../lib/rate-limit.js';
import {
  buildAuthUrl, verifyState, exchangeCode, issueSsoPending, verifySsoPending,
} from '../lib/sso.js';
import { dec } from '../lib/crypto.js';
import { verifyTotp } from '../lib/mfa.js';

const router = Router({ mergeParams: true });

const publicUser = (u) => ({ id: u.id, email: u.email, full_name: u.name, role: u.role, is_ceo: !!u.is_ceo, tenant_id: u.tenant_id, must_change_password: !!u.must_change_password, mfa_enabled: !!u.mfa_enabled, locale: u.locale || 'vi' });

async function issueLoginPair(db, user) {
  const token = issueAccess(user);
  const refresh_token = await createRefreshToken(user.id);
  const body = { token, refresh_token, user: publicUser(user) };
  if (user.must_change_password) {
    return { status: 403, body: { ...body, error: 'PASSWORD_CHANGE_REQUIRED', must_change_password: true } };
  }
  return { status: 200, body };
}

async function ssoAudit(db, tenantId, userId, userName, role, action, note, email) {
  await db.prepare(
    `INSERT INTO audit_log (tenant_id, user_id, user_name, action, resource_type, context, actor_role, note)
     VALUES (?, ?, ?, ?, 'user', ?, ?, ?)`
  ).runAsync(tenantId, userId, userName, action, JSON.stringify({ email }), role).catch(() => {});
}

// POST /api/auth/sso/start {email} — tim tenant co bat SSO, tra auth_url.
// 404 chung chung (khong lo user co ton tai hay khong qua thong diep khac nhau).
router.post('/start', loginLimiter, async (req, res) => {
  const db = getDb();
  const { email, tenant } = req.body || {};
  if (!email || typeof email !== 'string') return res.status(400).json({ error: 'email required' });
  try {
    const rows = await db.prepare(
      `SELECT u.id, u.tenant_id, t.code AS tenant_code, t.name AS tenant_name
       FROM users u JOIN tenants t ON t.id = u.tenant_id
       WHERE u.email = ? ORDER BY u.tenant_id`
    ).allAsync(email.trim().toLowerCase());
    if (rows.length > 1 && (tenant == null || tenant === '')) {
      return res.status(409).json({
        error: 'TENANT_REQUIRED',
        tenants: rows.map((row) => ({ id: row.tenant_id, code: row.tenant_code, name: row.tenant_name })),
      });
    }
    const selected = tenant == null || tenant === ''
      ? rows[0]
      : rows.find((row) => String(row.tenant_id) === String(tenant) || String(row.tenant_code) === String(tenant));
    const user = rows.length === 1 || selected ? selected : null;
    const cfg = user
      ? await db.prepare('SELECT * FROM sso_configs WHERE tenant_id = ?').getAsync(user.tenant_id)
      : null;
    if (!user || !cfg?.enabled) return res.status(404).json({ error: 'SSO chua kha dung cho tai khoan nay' });
    const { auth_url } = await buildAuthUrl(cfg, user.tenant_id);
    res.json({ auth_url });
  } catch (e) {
    // Không trả `e.message`: 502 là 5xx nên lọt thẳng ra ngoài, mà lỗi ở đây là lỗi
    // mạng/HTTP tới IdP — chứa issuer, endpoint, thậm chí body IdP trả về. Chi tiết đi
    // log để quản trị viên còn dò được, người dùng chỉ cần biết "đăng nhập SSO hỏng".
    console.error('[sso] tao auth_url that bai', e.message);
    res.status(502).json({ error: 'SSO khoi tao that bai' });
  }
});

// POST /api/auth/sso/callback {code, state} — doi code, link/subject, cap token.
router.post('/callback', loginLimiter, async (req, res) => {
  const db = getDb();
  const { code, state } = req.body || {};
  if (!code || !state) return res.status(400).json({ error: 'code + state required' });
  try {
    const { tenantId, verifier } = verifyState(state);
    const cfg = await db.prepare('SELECT * FROM sso_configs WHERE tenant_id = ?').getAsync(tenantId);
    if (!cfg?.enabled) return res.status(403).json({ error: 'SSO chua bat cho tenant nay' });
    const info = await exchangeCode(cfg, code, verifier);
    let user = await db.prepare('SELECT * FROM users WHERE tenant_id = ? AND email = ?').getAsync(tenantId, info.email);
    if (!user) {
      if (!cfg.auto_provision) return res.status(403).json({ error: 'Tai khoan chua duoc cap — lien he admin' });
      const ins = await db.prepare(
        `INSERT INTO users (tenant_id, email, name, role, password_hash) VALUES (?, ?, ?, ?, NULL) RETURNING *`
      ).runAsync(tenantId, info.email, info.name, cfg.default_role || 'site').catch(() => null);
      // runAsync khong tra row (chi lastInsertRowid) — doc lai.
      user = await db.prepare('SELECT * FROM users WHERE tenant_id = ? AND email = ?').getAsync(tenantId, info.email);
      if (!user || !ins) return res.status(500).json({ error: 'Auto-provision that bai' });
      await ssoAudit(db, tenantId, user.id, user.name, user.role, 'SSO_PROVISION', `SSO tu dong cap ${info.email}`, info.email);
    }
    // Subject da link cho sub khac -> chan (chong chiem doat), admin go link roi thu lai.
    if (user.sso_subject && info.subject && user.sso_subject !== info.subject) {
      return res.status(403).json({ error: 'SSO subject doi — lien he admin go lien ket cu' });
    }
    if (!user.sso_subject && info.subject) {
      await db.prepare('UPDATE users SET sso_subject = ?, sso_issuer = ? WHERE id = ?')
        .runAsync(info.subject, cfg.issuer, user.id);
      await ssoAudit(db, tenantId, user.id, user.name, user.role, 'SSO_LINK', `Lien ket SSO ${cfg.issuer}`, info.email);
    }
    await ssoAudit(db, tenantId, user.id, user.name, user.role, 'SSO_LOGIN', 'Dang nhap SSO thanh cong', info.email);
    if (user.mfa_enabled) {
      return res.status(401).json({ error: 'MFA_REQUIRED', mfa_required: true, email: user.email, sso_pending: issueSsoPending(user) });
    }
    const { status, body } = await issueLoginPair(db, user);
    res.status(status).json(body);
  } catch (e) {
    res.status(400).json({ error: `SSO callback that bai: ${e.message}` });
  }
});

// POST /api/auth/sso/mfa/verify {sso_pending, code} — buoc 2 TOTP sau SSO.
router.post('/mfa/verify-sso', loginLimiter, async (req, res) => {
  const db = getDb();
  const { sso_pending, code } = req.body || {};
  if (!sso_pending || !code) return res.status(400).json({ error: 'sso_pending + code required' });
  try {
    const { userId, tenantId } = verifySsoPending(sso_pending);
    const user = await db.prepare('SELECT * FROM users WHERE id = ? AND tenant_id = ?').getAsync(userId, tenantId);
    if (!user || !user.mfa_enabled || !user.mfa_secret) {
      return res.status(400).json({ error: 'MFA chua bat cho tai khoan nay' });
    }
    if (!verifyTotp(dec(user.mfa_secret), code)) {
      await ssoAudit(db, tenantId, user.id, user.name, user.role, 'MFA_FAILED', 'Sai ma MFA sau SSO', user.email);
      return res.status(401).json({ error: 'Sai ma xac thuc' });
    }
    const { status, body } = await issueLoginPair(db, user);
    res.status(status).json(body);
  } catch (e) {
    res.status(400).json({ error: `Xac thuc MFA that bai: ${e.message}` });
  }
});

// NOTE: there is deliberately no public `GET /api/auth/sso/discover?issuer=`.
// It was an unauthenticated server-side fetch of a caller-chosen URL (SSRF:
// loopback/private/metadata addresses reachable from the server) and SSO is
// out of scope for this release. Admins test a configured issuer through the
// authenticated `POST /api/admin/sso/test`, which only reads tenant config.

export default router;
