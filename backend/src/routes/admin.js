// Admin user management (minimal): list users + assign department.
// No password/role editing here (auth policy stays in auth.js).
// Whole router: admin/ceo only, tenant-scoped, never exposes password_hash.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { requireAuth, requireRole } from '../lib/auth.js';
import { getDb } from '../db/index.js';
import { withAudit } from '../lib/with-audit.js';
import { errorBody } from '../lib/error-body.js';

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
    res.status(e.status || 500).json(errorBody(e));
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
    res.status(e.status || 500).json(errorBody(e));
  }
});

// ---- Daily backups (SRS NFR) — admin/ceo qua router guard ----
// GET /api/admin/backups — trạng thái scheduler + danh sách bản sao.
router.get('/backups', async (req, res) => {
  const { listBackups, backupDir, keepCount, backupHour, nextRunAt, lastRun } = await import('../lib/backup.js');
  res.json({
    dir: backupDir(), keep: keepCount(), hour: backupHour(),
    next_run: nextRunAt(), last_run: lastRun(), backups: listBackups(),
  });
});

// POST /api/admin/backups/run — chạy sao lưu ngay (audit). 409 nếu đang chạy.
let _manualRunning = false;
router.post('/backups/run', async (req, res) => {
  if (_manualRunning) return res.status(409).json({ error: 'Backup đang chạy — thử lại sau' });
  const { runBackup } = await import('../lib/backup.js');
  _manualRunning = true;
  try {
    const out = await runBackup();
    const db = getDb();
    await db.prepare(
      `INSERT INTO audit_log (tenant_id, user_id, user_name, action, resource_type, context, actor_role, note)
       VALUES (?, ?, ?, 'BACKUP_RUN', 'backup', ?, ?, ?)`
    ).runAsync(req.user.tenant_id, req.user.id, req.user.name,
      JSON.stringify({ file: out.file, size: out.size }), req.user.role, `Sao lưu thủ công ${out.file}`).catch(() => {});
    res.status(201).json(out);
  } catch (e) {
    res.status(e.status || 500).json(errorBody(e));
  } finally {
    _manualRunning = false;
  }
});

// GET /api/admin/production-readiness — release checklist, no secrets returned.
router.get('/production-readiness', async (req, res) => {
  const { getProductionReadiness } = await import('../lib/production-readiness.js');
  res.json(await getProductionReadiness(req.user.tenant_id));
});

// ---- SSO IdP config per tenant (SRS 6: SSO truoc production) ----
// Secret KHONG luu DB: body.client_secret chi nhan khi ALLOW_SSO_INLINE_SECRET=1
// (test hatch, giu trong memory, mat khi restart) — production doc tu env.
router.get('/sso', async (req, res) => {
  const db = getDb();
  const cfg = await db.prepare('SELECT tenant_id, issuer, client_id, secret_env, enabled, auto_provision, default_role, updated_at FROM sso_configs WHERE tenant_id = ?').getAsync(req.user.tenant_id);
  res.json({ config: cfg || null, secret_env_default: 'SSO_CLIENT_SECRET' });
});

router.put('/sso', async (req, res) => {
  const db = getDb();
  const { issuer, client_id, secret_env, enabled, auto_provision, default_role, client_secret } = req.body || {};
  if (!issuer || !client_id) return res.status(400).json({ error: 'issuer + client_id required' });
  if (!/^https?:\/\//.test(String(issuer))) return res.status(400).json({ error: 'issuer phai la http(s) URL' });
  if (default_role && !['pm', 'pmo', 'site', 'procurement', 'accounting', 'technical'].includes(default_role)) {
    return res.status(400).json({ error: 'default_role khong hop le' });
  }
  if (client_secret != null) {
    const { allowInlineSecret, setMemorySecret } = await import('../lib/sso.js');
    if (!allowInlineSecret()) return res.status(403).json({ error: 'client_secret inline chi dung khi ALLOW_SSO_INLINE_SECRET=1 (production dung env)' });
    setMemorySecret(req.user.tenant_id, client_secret);
  }
  try {
    const result = await withAudit(req, {
      action: 'UPDATE', resourceType: 'sso_config', resourceId: req.user.tenant_id,
      after: { issuer, client_id, enabled: enabled !== false },
      fieldChanges: [{ field: 'issuer', from: null, to: issuer }],
      note: `Cau hinh SSO ${issuer}`,
    }, async (client) => {
      const r = await client.query(
        `INSERT INTO sso_configs (tenant_id, issuer, client_id, secret_env, enabled, auto_provision, default_role, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
         ON CONFLICT (tenant_id) DO UPDATE SET issuer = EXCLUDED.issuer, client_id = EXCLUDED.client_id,
           secret_env = EXCLUDED.secret_env, enabled = EXCLUDED.enabled, auto_provision = EXCLUDED.auto_provision,
           default_role = EXCLUDED.default_role, updated_by = EXCLUDED.updated_by, updated_at = now()
         RETURNING tenant_id, issuer, client_id, secret_env, enabled, auto_provision, default_role, updated_at`,
        [req.user.tenant_id, String(issuer).replace(/\/+$/, ''), client_id, secret_env || 'SSO_CLIENT_SECRET',
         enabled !== false, auto_provision === true, default_role || 'site', req.user.id]
      );
      return r.rows[0];
    });
    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json(errorBody(e));
  }
});

router.delete('/sso', async (req, res) => {
  const db = getDb();
  try {
    await withAudit(req, {
      action: 'DELETE', resourceType: 'sso_config', resourceId: req.user.tenant_id,
      note: 'Xoa cau hinh SSO (dang nhap mat khau van giu)',
    }, async (client) => {
      await client.query('DELETE FROM sso_configs WHERE tenant_id = $1', [req.user.tenant_id]);
      return { ok: true };
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(e.status || 500).json(errorBody(e));
  }
});

// POST /api/admin/sso/test {issuer?} — kiem tra discovery IdP (khong can secret).
router.post('/sso/test', async (req, res) => {
  const db = getDb();
  const { discover } = await import('../lib/sso.js');
  const cfg = await db.prepare('SELECT issuer FROM sso_configs WHERE tenant_id = ?').getAsync(req.user.tenant_id);
  const issuer = (req.body || {}).issuer || cfg?.issuer;
  if (!issuer) return res.status(400).json({ error: 'issuer required' });
  try {
    const doc = await discover(String(issuer));
    res.json({ ok: true, issuer: doc.issuer, authorization_endpoint: doc.authorization_endpoint, token_endpoint: doc.token_endpoint, userinfo_endpoint: doc.userinfo_endpoint });
  } catch (e) {
    // Không trả `e.message`: `discover()` quay ra IdP và lỗi kèm URL, mã HTTP, body
    // IdP trả về. `errorBody()` ở production sẽ gộp còn "Internal error" — thông tin
    // dạng đó vô dụng với người đang cấu hình SSO, nên ở đây giữ **thông điệp do ta
    // viết** (nói đúng bước hỏng) và đẩy chi tiết vào log.
    console.error('[admin] SSO discovery that bai', e.message);
    res.status(502).json({ ok: false, error: 'Khong phat hien dich vu OIDC tu issuer nay' });
  }
});

// ---- PDPL DSR queue (admin/ceo duyet yeu cau truy xuat/hieu chinh/xoa) ----
router.get('/dsr', async (req, res) => {
  const db = getDb();
  const { status } = req.query || {};
  const rows = status
    ? await db.prepare(
        `SELECT r.*, u.email FROM pdpl_requests r JOIN users u ON u.id = r.user_id
         WHERE r.tenant_id = ? AND r.status = ? ORDER BY r.id DESC LIMIT 200`
      ).allAsync(req.user.tenant_id, String(status))
    : await db.prepare(
        `SELECT r.*, u.email FROM pdpl_requests r JOIN users u ON u.id = r.user_id
         WHERE r.tenant_id = ? ORDER BY r.id DESC LIMIT 200`
      ).allAsync(req.user.tenant_id);
  const pending = await db.prepare(`SELECT COUNT(*) AS c FROM pdpl_requests WHERE tenant_id = ? AND status = 'PENDING'`).getAsync(req.user.tenant_id);
  res.json({ pending: Number(pending?.c || 0), requests: rows });
});

// POST /api/admin/dsr/:id/resolve {decision: DONE|REJECTED, note?, apply?}
// ERASE+DONE = an danh hoa (giu row cho FK audit), kill sessions.
// RECTIFY+DONE + apply.name = doi ten. ACCESS+DONE = xac nhan da cap export.
router.post('/dsr/:id/resolve', async (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id must be integer' });
  const { decision, note, apply } = req.body || {};
  if (!['DONE', 'REJECTED'].includes(decision)) return res.status(400).json({ error: 'decision DONE|REJECTED' });
  const r = await db.prepare('SELECT * FROM pdpl_requests WHERE id = ? AND tenant_id = ?').getAsync(id, req.user.tenant_id);
  if (!r) return res.status(404).json({ error: 'Not found' });
  if (r.status !== 'PENDING') return res.status(409).json({ error: `Yeu cau da ${r.status}` });
  const target = await db.prepare('SELECT * FROM users WHERE id = ? AND tenant_id = ?').getAsync(r.user_id, req.user.tenant_id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  try {
    const out = await withAudit(req, {
      action: decision === 'DONE' ? 'DSR_RESOLVE' : 'DSR_REJECT', resourceType: 'pdpl_request', resourceId: id,
      before: { status: 'PENDING', type: r.type }, after: { status: decision },
      fieldChanges: [{ field: 'status', from: 'PENDING', to: decision }],
      note: `Duyet DSR ${r.type} #${id}: ${decision}${note ? ` — ${note}` : ''}`,
    }, async (client) => {
      if (decision === 'DONE' && r.type === 'ERASE') {
        const admins = await client.query(`SELECT COUNT(*) AS c FROM users WHERE tenant_id = $1 AND role = 'admin'`, [req.user.tenant_id]);
        if (target.role === 'admin' && Number(admins.rows[0]?.c || 0) <= 1) {
          throw new Error('Khong the xoa admin cuoi cung cua tenant');
        }
        await client.query(
          `UPDATE users SET name = 'Da an danh', email = $1, password_hash = NULL, must_change_password = false,
            zalo_user_id = NULL, mfa_secret = NULL, mfa_enabled = false, sso_subject = NULL, sso_issuer = NULL,
            notify_email = false, notify_zalo = false, token_version = token_version + 1 WHERE id = $2`,
          [`deleted-${target.id}@invalid.local`, target.id]
        );
        await client.query(`UPDATE auth_refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [target.id]);
      }
      if (decision === 'DONE' && r.type === 'RECTIFY' && apply?.name) {
        const nm = String(apply.name).trim();
        if (!nm || nm.length > 200) throw new Error('apply.name 1..200 ky tu');
        await client.query('UPDATE users SET name = $1 WHERE id = $2', [nm, target.id]);
      }
      // `AND status = 'PENDING'` trong chính câu UPDATE. Hai admin bấm giải quyết
      // cùng một yêu cầu PDPL sẽ cùng qua kiểm tra ngoài transaction; nếu không khoá
      // ở đây thì cả hai đều chạy phần ẩn danh và ghi hai dòng audit `DSR_RESOLVE` với
      // `note` khác nhau ⇒ lý do vì sao một người bị ẩn danh là bản ghi commit sau cùng,
      // và một cặp `DONE` + `REJECTED` để lại hàng ở `REJECTED` trong khi audit ghi cả
      // hai kết quả.
      const upd = await client.query(
        `UPDATE pdpl_requests SET status = $1, resolved_by = $2, resolved_at = now(), resolve_note = $3
         WHERE id = $4 AND status = 'PENDING'
         RETURNING id, type, status, resolved_at`,
        [decision, req.user.id, note ? String(note).slice(0, 2000) : null, id]
      );
      if (!upd.rows[0]) {
        throw Object.assign(new Error('Yêu cầu đã được xử lý bởi người khác'), { status: 409 });
      }
      return upd.rows[0];
    });
    res.json(out);
  } catch (e) {
    const code = /admin cuoi cung|apply\.name/.test(e.message || '') ? 422 : 500;
    res.status(code).json({ error: e.message });
  }
});

// GET /api/admin/security-status — buc tranh tin cay: ma hoa + TLS + SSO + PDPL.
router.get('/security-status', async (req, res) => {
  const db = getDb();
  const { encStatus } = await import('../lib/crypto.js');
  const sso = await db.prepare('SELECT enabled, issuer FROM sso_configs WHERE tenant_id = ?').getAsync(req.user.tenant_id).catch(() => null);
  const dsr = await db.prepare(`SELECT COUNT(*) AS c FROM pdpl_requests WHERE tenant_id = ? AND status = 'PENDING'`).getAsync(req.user.tenant_id).catch(() => ({ c: 0 }));
  const consents = await db.prepare(
    `SELECT purpose, COUNT(*) FILTER (WHERE granted) AS granted, COUNT(*) AS total
     FROM pdpl_consents WHERE tenant_id = ? GROUP BY purpose`
  ).allAsync(req.user.tenant_id).catch(() => []);
  const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  res.json({
    encryption: encStatus(),
    tls: { proto, hsts_active: proto === 'https', note: 'TLS ket thuc o reverse proxy (xem DOCKER.md); HSTS chi bat khi proto=https' },
    sso: { enabled: !!sso?.enabled, issuer: sso?.issuer || null },
    pdpl: { policy_version: '2026-09-v1', pending_dsr: Number(dsr?.c || 0), consents },
  });
});

export default router;
