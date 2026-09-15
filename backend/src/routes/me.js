// Me routes — current user info: permissions, notification prefs

import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { getDb } from '../db/index.js';
import { getPermissions } from '../lib/permissions.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

// GET /api/me — current user info (id, email, name, role, tenant)
router.get('/', (req, res) => {
  res.json({
    id: req.user.id,
    email: req.user.email,
    name: req.user.name,
    full_name: req.user.full_name || req.user.name, // backward compat
    role: req.user.role,
    tenant_id: req.user.tenant_id,
  });
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

export default router;
