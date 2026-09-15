// Admin user management (minimal): list users + assign department.
// No password/role editing here (auth policy stays in auth.js).
// Whole router: admin/ceo only, tenant-scoped, never exposes password_hash.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { requireAuth, requireRole } from '../lib/auth.js';
import { getDb } from '../db/index.js';
import { withAudit } from '../lib/with-audit.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(requireRole('admin', 'ceo'));

router.get('/users', async (req, res) => {
  const db = getDb();
  res.json(await db.prepare(
    `SELECT u.id, u.email, u.name, u.role, u.is_ceo, u.department_id, d.code AS department_code
     FROM users u LEFT JOIN departments d ON d.id = u.department_id
     WHERE u.tenant_id = ? ORDER BY u.id`
  ).allAsync(req.user.tenant_id));
});

router.patch('/users/:id', async (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id must be integer' });
  const { department_id = null } = req.body || {};
  const target = await db.prepare('SELECT * FROM users WHERE id = ? AND tenant_id = ?').getAsync(id, req.user.tenant_id);
  if (!target) return res.status(404).json({ error: 'Not found' });
  if (department_id) {
    const dept = await db.prepare('SELECT id FROM departments WHERE id = ? AND tenant_id = ?').getAsync(department_id, req.user.tenant_id);
    if (!dept) return res.status(404).json({ error: 'Department not found' });
  }
  try {
    const result = await withAudit(req, {
      action: 'UPDATE', resourceType: 'user', resourceId: Number(req.params.id),
      before: { department_id: target.department_id },
      after: { department_id },
      fieldChanges: [{ field: 'department_id', from: target.department_id, to: department_id }],
      note: `Gán ${target.email} vào dept ${department_id ?? '—'}`,
    }, async (client) => {
      const r = await client.query(
        `UPDATE users SET department_id = $1 WHERE id = $2 RETURNING id, email, name, role, is_ceo, department_id`,
        [department_id, req.params.id]
      );
      return r.rows[0];
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/users/:id/reset-password — temp password, returned ONCE (Wave 2 A2).
// Sets must_change_password (login gates until changed), bumps token_version
// (all sessions die), revokes refresh rows, audit-logged. Tenant-scoped 404.
router.post('/users/:id/reset-password', async (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id must be integer' });
  const target = await db.prepare('SELECT * FROM users WHERE id = ? AND tenant_id = ?').getAsync(id, req.user.tenant_id);
  if (!target) return res.status(404).json({ error: 'Not found' });
  const temp = randomBytes(9).toString('base64url');
  try {
    await withAudit(req, {
      action: 'PASSWORD_RESET', resourceType: 'user', resourceId: id,
      before: { must_change_password: !!target.must_change_password },
      after: { must_change_password: true },
      fieldChanges: [{ field: 'must_change_password', from: !!target.must_change_password, to: true }],
      note: `Reset mật khẩu ${target.email} (mật khẩu tạm, đổi ở lần đăng nhập sau)`,
    }, async (client) => {
      const hash = await bcrypt.hash(temp, 10);
      await client.query(
        `UPDATE users SET password_hash = $1, must_change_password = true, token_version = token_version + 1 WHERE id = $2`,
        [hash, id]
      );
      await client.query(`UPDATE auth_refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [id]);
      return { ok: true };
    });
    res.json({ ok: true, temp_password: temp });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
