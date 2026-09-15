// Me routes — current user info: permissions, notification prefs

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requireAuth } from '../lib/auth.js';
import { getDb } from '../db/index.js';
import { getPermissions } from '../lib/permissions.js';
import { withAudit } from '../lib/with-audit.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

// GET /api/me — current user info (id, email, name, role, tenant + plan)
router.get('/', async (req, res) => {
  const { getEntitlements } = await import('../lib/entitlements.js');
  const ent = await getEntitlements(req.user.tenant_id).catch(() => ({ plan: 'enterprise', features: [] }));
  res.json({
    id: req.user.id,
    email: req.user.email,
    name: req.user.name,
    full_name: req.user.full_name || req.user.name, // backward compat
    role: req.user.role,
    tenant_id: req.user.tenant_id,
    plan: ent.plan,
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
    zalo_user_id: u?.zalo_user_id || null,
  });
});

router.put('/notification-prefs', async (req, res) => {
  const db = getDb();
  const { notify_email, notify_zalo, zalo_user_id } = req.body || {};
  await db.prepare(`UPDATE users SET notify_email = ?, notify_zalo = ?, zalo_user_id = ? WHERE id = ?`)
    .runAsync(notify_email !== false, notify_zalo === true, zalo_user_id || null, req.user.id);
  res.json({ ok: true });
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
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
