// PDPL self-service (mount /api/me — permissionMiddleware mien /api/me*).
// Quyen cua chu the du lieu theo Luat BVDL ca nhan 91/2025:
// dong y/rut (consents), truy xuat (export), yeu cau hieu chinh/xoa (DSR).
import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { getDb } from '../db/index.js';
import { withAudit } from '../lib/with-audit.js';
import { errorBody } from '../lib/error-body.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

export const PDPL_POLICY_VERSION = '2026-09-v1';
export const PDPL_PURPOSES = [
  { purpose: 'account', required: true, title_vi: 'Duy tri tai khoan', desc_vi: 'Bat buoc de dang nhap, phan quyen, audit. Khong the rut.' },
  { purpose: 'notify', required: false, title_vi: 'Nhan thong bao', desc_vi: 'Email/Zalo ve viec duoc giao. Rut = tat ca 2 kenh.' },
  { purpose: 'analytics', required: false, title_vi: 'Thong ke an danh', desc_vi: 'Tu nguyen, mac dinh TAT. Hien chua thu thap gi.' },
];
const MUTABLE = new Set(['notify', 'analytics']);

// Dam bao hang 'account' luon ton tai (dieu kien duy tri tai khoan).
// (Khong dung db.upsert: bang khong co cot id, upsert lookup id se fail.)
async function ensureAccount(db, user) {
  await db.prepare(
    `INSERT INTO pdpl_consents (user_id, tenant_id, purpose, granted, policy_version, decided_at)
     VALUES (?, ?, 'account', true, ?, now())
     ON CONFLICT (user_id, purpose) DO UPDATE SET granted = true, policy_version = EXCLUDED.policy_version`
  ).runAsync(user.id, user.tenant_id, PDPL_POLICY_VERSION).catch(() => {});
}

// GET /api/me/privacy — thong bao + consents + DSR cua toi.
router.get('/privacy', async (req, res) => {
  const db = getDb();
  await ensureAccount(db, req.user);
  const rows = await db.prepare('SELECT purpose, granted, policy_version, decided_at FROM pdpl_consents WHERE user_id = ?').allAsync(req.user.id);
  const byPurpose = Object.fromEntries(rows.map((r) => [r.purpose, r]));
  const requests = await db.prepare(
    'SELECT id, type, status, detail, resolve_note, created_at, resolved_at FROM pdpl_requests WHERE user_id = ? ORDER BY id DESC LIMIT 50'
  ).allAsync(req.user.id);
  res.json({
    policy_version: PDPL_POLICY_VERSION,
    purposes: PDPL_PURPOSES.map((p) => ({ ...p, granted: p.required ? true : !!byPurpose[p.purpose]?.granted })),
    requests,
  });
});

// POST /api/me/privacy/consents {purpose, granted} — chi notify/analytics.
router.post('/privacy/consents', async (req, res) => {
  const db = getDb();
  const { purpose, granted } = req.body || {};
  if (!MUTABLE.has(purpose)) return res.status(422).json({ error: 'Chi duoc dong y/rut notify hoac analytics (account la bat buoc)' });
  const g = granted === true;
  await ensureAccount(db, req.user);
  try {
    await withAudit(req, {
      action: g ? 'CONSENT_GRANT' : 'CONSENT_WITHDRAW', resourceType: 'pdpl_consent', resourceId: req.user.id,
      before: {}, after: { purpose, granted: g },
      fieldChanges: [{ field: purpose, from: !g, to: g }],
      note: `${g ? 'Dong y' : 'Rut'} ${purpose} (chinh sach ${PDPL_POLICY_VERSION})`,
    }, async (client) => {
      await client.query(
        `INSERT INTO pdpl_consents (user_id, tenant_id, purpose, granted, policy_version, decided_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (user_id, purpose) DO UPDATE SET granted = EXCLUDED.granted, policy_version = EXCLUDED.policy_version, decided_at = now()`,
        [req.user.id, req.user.tenant_id, purpose, g, PDPL_POLICY_VERSION]
      );
      // Rut notify = tat ca kenh gui (nhat quan, khong gui chui).
      if (purpose === 'notify') {
        await client.query(
          `UPDATE users SET notify_email = $1, notify_zalo = $2 WHERE id = $3`,
          [...(g ? [true, false] : [false, false]), req.user.id]
        );
      }
      return { ok: true };
    });
    res.json({ ok: true, purpose, granted: g });
  } catch (e) {
    res.status(e.status || 500).json(errorBody(e));
  }
});

// GET /api/me/privacy/export — quyen truy xuat: toan bo du lieu ca nhan cua toi.
router.get('/privacy/export', async (req, res) => {
  const db = getDb();
  const u = await db.prepare(
    'SELECT id, email, name, role, is_ceo, tenant_id, locale, sso_issuer, created_at FROM users WHERE id = ?'
  ).getAsync(req.user.id);
  const consents = await db.prepare('SELECT purpose, granted, policy_version, decided_at FROM pdpl_consents WHERE user_id = ?').allAsync(req.user.id);
  const memberships = await db.prepare(
    `SELECT m.project_id, p.code AS project_code FROM project_members m JOIN projects p ON p.id = m.project_id WHERE m.user_id = ?`
  ).allAsync(req.user.id).catch(() => []);
  const requests = await db.prepare('SELECT id, type, status, created_at, resolved_at FROM pdpl_requests WHERE user_id = ?').allAsync(req.user.id);
  const auditCount = await db.prepare('SELECT COUNT(*) AS c FROM audit_log WHERE user_id = ?').getAsync(req.user.id).catch(() => ({ c: 0 }));
  res.json({
    exported_at: new Date().toISOString(),
    policy_version: PDPL_POLICY_VERSION,
    user: { ...u, sso_subject: undefined },
    consents, project_memberships: memberships, dsr_requests: requests,
    audit_entries: Number(auditCount?.c || 0),
  });
});

// POST /api/me/privacy/requests {type, detail?} — tao DSR (ACCESS/RECTIFY/ERASE).
router.post('/privacy/requests', async (req, res) => {
  const db = getDb();
  const { type, detail } = req.body || {};
  if (!['ACCESS', 'RECTIFY', 'ERASE'].includes(type)) {
    return res.status(400).json({ error: 'type phai la ACCESS/RECTIFY/ERASE' });
  }
  try {
    const r = await withAudit(req, {
      action: 'DSR_CREATE', resourceType: 'pdpl_request',
      after: { type, detail: detail || null }, note: `Yeu cau DSR ${type}`,
    }, async (client) => {
      const ins = await client.query(
        `INSERT INTO pdpl_requests (tenant_id, user_id, type, detail) VALUES ($1, $2, $3, $4) RETURNING id, type, status, created_at`,
        [req.user.tenant_id, req.user.id, type, detail ? String(detail).slice(0, 2000) : null]
      );
      return ins.rows[0];
    });
    res.status(201).json(r);
  } catch (e) {
    res.status(e.status || 500).json(errorBody(e));
  }
});

// PATCH /api/me/privacy/profile {name} — tu hieu chinh ten (quyen rectify).
router.patch('/privacy/profile', async (req, res) => {
  const db = getDb();
  const { name } = req.body || {};
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 200) {
    return res.status(400).json({ error: 'name 1..200 ky tu' });
  }
  try {
    const result = await withAudit(req, {
      action: 'UPDATE', resourceType: 'user', resourceId: req.user.id,
      before: { name: req.user.name }, after: { name: name.trim() },
      fieldChanges: [{ field: 'name', from: req.user.name, to: name.trim() }],
      note: 'Tu hieu chinh ten (PDPL rectify)',
    }, async (client) => {
      const r = await client.query('UPDATE users SET name = $1 WHERE id = $2 RETURNING id, name', [name.trim(), req.user.id]);
      return r.rows[0];
    });
    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json(errorBody(e));
  }
});

// GET /api/me/sso — trang thai lien ket SSO.
router.get('/sso', async (req, res) => {
  const db = getDb();
  const u = await db.prepare('SELECT sso_subject, sso_issuer FROM users WHERE id = ?').getAsync(req.user.id);
  res.json({ linked: !!u?.sso_subject, issuer: u?.sso_issuer || null });
});

// DELETE /api/me/sso — go lien ket SSO (ve dang nhap mat khau).
router.delete('/sso', async (req, res) => {
  const db = getDb();
  const u = await db.prepare('SELECT sso_subject FROM users WHERE id = ?').getAsync(req.user.id);
  if (!u?.sso_subject) return res.status(404).json({ error: 'Chua lien ket SSO' });
  try {
    await withAudit(req, {
      action: 'SSO_UNLINK', resourceType: 'user', resourceId: req.user.id,
      before: { linked: true }, after: { linked: false },
      fieldChanges: [{ field: 'sso_subject', from: 'set', to: null }],
      note: 'Go lien ket SSO',
    }, async (client) => {
      await client.query('UPDATE users SET sso_subject = NULL, sso_issuer = NULL WHERE id = $1', [req.user.id]);
      return { ok: true };
    });
    res.json({ ok: true, linked: false });
  } catch (e) {
    res.status(e.status || 500).json(errorBody(e));
  }
});

export default router;
