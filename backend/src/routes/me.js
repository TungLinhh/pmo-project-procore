// Me routes — current user info: permissions, notification prefs

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requireAuth, issueAccess, createRefreshToken } from '../lib/auth.js';
import { getDb } from '../db/index.js';
import { getPermissions } from '../lib/permissions.js';
import { withAudit } from '../lib/with-audit.js';
import { enc, dec } from '../lib/crypto.js';
import { errorBody } from '../lib/error-body.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

// GET /api/me — current user info (id, email, name, role, tenant + plan)
router.get('/', async (req, res) => {
  const { getEntitlements } = await import('../lib/entitlements.js');
  // Fail-**closed** khi không đọc được plan — trước đây `.catch` trả
  // `plan: 'enterprise'`, tức lỗi đọc lại mở khoá toàn bộ gói tính năng. Nó còn
  // tệ hơn: `features: []` (ẩn nav) nhưng `plan: 'enterprise'` (đầu vỏ hiện badge
  // Enterprise) ⇒ hai nửa của cùng một object trái nhau, và người dùng của gói
  // Small thấy "Enterprise" trên đầu màn hình. `getEntitlements` nay đã tự hạ về
  // `small` có log; `.catch` ở đây chỉ bắt lỗi DB thật sự.
  const ent = await getEntitlements(req.user.tenant_id).catch(() => ({ plan: 'small', features: [] }));
  res.json({
    id: req.user.id,
    email: req.user.email,
    name: req.user.name,
    full_name: req.user.full_name || req.user.name, // backward compat
    role: req.user.role,
    tenant_id: req.user.tenant_id,
    plan: ent.plan,
    locale: req.user.locale || 'vi',
  });
});

// GET /api/me/entitlements — plan + feature flags for nav gating (HqShell).
// Frontend hides what the plan lacks; backend requireFeature() still enforces.
router.get('/entitlements', async (req, res) => {
  const { getEntitlements } = await import('../lib/entitlements.js');
  res.json(await getEntitlements(req.user.tenant_id));
});

router.get('/permissions', (req, res) => {
  res.json({ role: req.user.role, permissions: getPermissions(req.user.role) });
});

router.get('/notification-prefs', async (req, res) => {
  const db = getDb();
  const u = await db.prepare('SELECT notify_email, notify_zalo, zalo_user_id FROM users WHERE id = ?').getAsync(req.user.id);
  res.json({
    channels: {
      in_app: true,
      email: u?.notify_email !== false,
      zalo: u?.notify_zalo === true,
    },
    // zalo_user_id ma hoa cot (task 10) — giai ma khi tra ve chu so huu.
    zalo_user_id: u?.zalo_user_id ? dec(u.zalo_user_id) : null,
  });
});

router.put('/notification-prefs', async (req, res) => {
  const db = getDb();
  const { notify_email, notify_zalo, zalo_user_id } = req.body || {};
  await db.prepare(`UPDATE users SET notify_email = ?, notify_zalo = ?, zalo_user_id = ? WHERE id = ?`)
    .runAsync(notify_email !== false, notify_zalo === true, zalo_user_id ? enc(zalo_user_id) : null, req.user.id);
  res.json({ ok: true });
});

// PUT /api/me/locale {locale: vi|en} — ghi nho ngon ngu giao dien (task 10).
router.put('/locale', async (req, res) => {
  const db = getDb();
  const { locale } = req.body || {};
  if (!['vi', 'en'].includes(locale)) return res.status(400).json({ error: 'locale vi|en' });
  await db.prepare('UPDATE users SET locale = ? WHERE id = ?').runAsync(locale, req.user.id);
  res.json({ ok: true, locale });
});

// POST /api/me/password {old_password, new_password} — self rotation (Wave 2 A2).
// Strength: ≥10 chars. Clears must_change_password, bumps token_version (all
// other sessions die), audit-logged. Reachable even under the forced-change gate.
router.post('/password', async (req, res) => {
  const db = getDb();
  const { old_password, new_password } = req.body || {};
  if (!old_password || !new_password) return res.status(400).json({ error: 'old_password + new_password required' });
  if (String(new_password).length < 10) return res.status(400).json({ error: 'Mật khẩu mới tối thiểu 10 ký tự' });
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').getAsync(req.user.id);
  if (!user || !user.password_hash || !(await bcrypt.compare(old_password, user.password_hash))) {
    return res.status(401).json({ error: 'Sai mật khẩu hiện tại' });
  }
  try {
    await withAudit(req, {
      action: 'PASSWORD_CHANGE', resourceType: 'user', resourceId: req.user.id,
      before: { must_change_password: !!user.must_change_password },
      after: { must_change_password: false },
      fieldChanges: [{ field: 'must_change_password', from: !!user.must_change_password, to: false }],
      note: 'Đổi mật khẩu',
    }, async (client) => {
      const hash = await bcrypt.hash(new_password, 10);
      await client.query(
        `UPDATE users SET password_hash = $1, must_change_password = false, token_version = token_version + 1 WHERE id = $2`,
        [hash, req.user.id]
      );
      await client.query(`UPDATE auth_refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [req.user.id]);
      return { ok: true };
    });
    const freshUser = await db.prepare('SELECT * FROM users WHERE id = ?').getAsync(req.user.id);
    const token = issueAccess(freshUser);
    const refreshToken = await createRefreshToken(freshUser.id);
    res.json({
      ok: true,
      token,
      refresh_token: refreshToken,
      // Both spellings: the client caches this object and the shell reads
      // `full_name`. Returning only `name` made the header fall back to the
      // email until the next sign-in.
      user: {
        id: freshUser.id, email: freshUser.email, name: freshUser.name,
        full_name: freshUser.name,
        role: freshUser.role, is_ceo: !!freshUser.is_ceo, tenant_id: freshUser.tenant_id,
      },
    });
  } catch (e) {
    res.status(e.status || 500).json(errorBody(e));
  }
});

// ---- TOTP MFA self-service (SRS: cá nhân + MFA trước production) ----
// GET /api/me/mfa — trạng thái (không lộ secret).
router.get('/mfa', async (req, res) => {
  const db = getDb();
  const u = await db.prepare('SELECT mfa_enabled FROM users WHERE id = ?').getAsync(req.user.id);
  res.json({ mfa_enabled: !!u?.mfa_enabled });
});

// POST /api/me/mfa/setup — tạo secret mới (trả 1 lần), chưa bật.
router.post('/mfa/setup', async (req, res) => {
  const { newSecret, otpauthUrl } = await import('../lib/mfa.js');
  const db = getDb();
  const secret = newSecret();
  // mfa_secret ma hoa cot (task 10) — lo DB khong lo seed TOTP.
  await db.prepare('UPDATE users SET mfa_secret = ?, mfa_enabled = false WHERE id = ?').runAsync(enc(secret), req.user.id);
  res.json({ secret, otpauth_url: otpauthUrl({ secret, email: req.user.email }) });
});

// POST /api/me/mfa/enable {code} — xác nhận code mới bật (audit).
router.post('/mfa/enable', async (req, res) => {
  const { verifyTotp } = await import('../lib/mfa.js');
  const db = getDb();
  const { code } = req.body || {};
  const u = await db.prepare('SELECT mfa_secret FROM users WHERE id = ?').getAsync(req.user.id);
  if (!u?.mfa_secret) return res.status(400).json({ error: 'Chưa setup — gọi /mfa/setup trước' });
  if (!verifyTotp(dec(u.mfa_secret), code)) return res.status(401).json({ error: 'Sai mã xác thực' });
  await withAudit(req, {
    action: 'MFA_ENABLE', resourceType: 'user', resourceId: req.user.id,
    before: { mfa_enabled: false }, after: { mfa_enabled: true },
    fieldChanges: [{ field: 'mfa_enabled', from: false, to: true }],
    note: 'Bật MFA',
  }, async (client) => {
    await client.query('UPDATE users SET mfa_enabled = true WHERE id = $1', [req.user.id]);
    return { ok: true };
  });
  res.json({ ok: true, mfa_enabled: true });
});

// POST /api/me/mfa/disable {password} — xác nhận mật khẩu mới tắt (audit).
router.post('/mfa/disable', async (req, res) => {
  const db = getDb();
  const { password } = req.body || {};
  const u = await db.prepare('SELECT * FROM users WHERE id = ?').getAsync(req.user.id);
  if (!u?.password_hash || !(await bcrypt.compare(password || '', u.password_hash))) {
    return res.status(401).json({ error: 'Sai mật khẩu' });
  }
  await withAudit(req, {
    action: 'MFA_DISABLE', resourceType: 'user', resourceId: req.user.id,
    before: { mfa_enabled: !!u.mfa_enabled }, after: { mfa_enabled: false },
    fieldChanges: [{ field: 'mfa_enabled', from: !!u.mfa_enabled, to: false }],
    note: 'Tắt MFA',
  }, async (client) => {
    await client.query('UPDATE users SET mfa_secret = NULL, mfa_enabled = false WHERE id = $1', [req.user.id]);
    return { ok: true };
  });
  res.json({ ok: true, mfa_enabled: false });
});

export default router;
