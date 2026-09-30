// Notification dispatcher — gửi qua nhiều kênh.
// Channels hỗ trợ:
//   - in_app: insert vào notifications table, hiển thị bell
//   - email: gửi qua SMTP (nodemailer, optional — bỏ qua nếu không config)
//   - zalo: Zalo OA API (optional — bỏ qua nếu không config)
//
// Mỗi user có thể bật/tắt kênh nhận qua user_notification_prefs.
// User cấu hình từng kênh: in_app (luôn bật), email (bật nếu có email), zalo (cần OA ID).
//
// Quyết định 2026-09-04: in_app (default) + email (nếu config) + zalo (nếu có thể).
// Kênh nào không config → log warning + bỏ qua (graceful degradation).

import { getDb } from '../db/index.js';
import { dec } from '../lib/crypto.js';

const EMAIL_CONFIG = {
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  user: process.env.SMTP_USER,
  pass: process.env.SMTP_PASS,
  from: process.env.SMTP_FROM || 'pmo@hbg.com',
};

const ZALO_CONFIG = {
  oaId: process.env.ZALO_OA_ID,
  accessToken: process.env.ZALO_OA_ACCESS_TOKEN,
};

let _nodemailer = null;
async function getNodemailer() {
  if (_nodemailer !== null) return _nodemailer;
  try {
    _nodemailer = (await import('nodemailer')).default;
  } catch (e) {
    console.warn('[notify] nodemailer not installed, email channel disabled. Run: npm i nodemailer');
    _nodemailer = false;
  }
  return _nodemailer;
}

async function sendEmail(to, subject, body) {
  if (!EMAIL_CONFIG.host) return { ok: false, reason: 'SMTP not configured' };
  const nm = await getNodemailer();
  if (!nm) return { ok: false, reason: 'nodemailer not installed' };
  try {
    const transporter = nm.createTransport({
      host: EMAIL_CONFIG.host, port: EMAIL_CONFIG.port, secure: EMAIL_CONFIG.secure,
      auth: { user: EMAIL_CONFIG.user, pass: EMAIL_CONFIG.pass },
    });
    await transporter.sendMail({ from: EMAIL_CONFIG.from, to, subject, text: body });
    return { ok: true };
  } catch (e) {
    console.error('[notify] email error:', e.message);
    return { ok: false, reason: e.message };
  }
}

async function sendZalo(userZaloId, body) {
  if (!ZALO_CONFIG.oaId || !ZALO_CONFIG.accessToken) return { ok: false, reason: 'Zalo OA not configured' };
  if (!userZaloId) return { ok: false, reason: 'user has no zalo_id' };
  try {
    const res = await fetch('https://openapi.zalo.me/v2.0/oa/message/cs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': ZALO_CONFIG.accessToken,
      },
      body: JSON.stringify({
        recipient: { user_id: userZaloId },
        message: { text: body },
      }),
    });
    const j = await res.json();
    return j.error === 0 ? { ok: true } : { ok: false, reason: j.message || 'zalo error' };
  } catch (e) {
    console.error('[notify] zalo error:', e.message);
    return { ok: false, reason: e.message };
  }
}

// Send notification to a user
// options: { userId, tenantId, projectId, issueId, title, body, severity, resourceType, resourceId, channels: ['in_app', 'email', 'zalo'] }
// tenantId is REQUIRED (no silent cross-tenant writes) — callers pass req.user.tenant_id.
// Backward-compat aliases: `channel` (singular) → channels, `link` accepted
// (no link column yet — kept in signature so call sites don't churn when one is added).
export async function notify(options) {
  const { userId, tenantId, projectId, issueId, title, body, resourceType, resourceId } = options;
  let { severity = 'info', channels = ['in_app'] } = options;
  if (options.channel && !options.channels) channels = [options.channel];
  severity = String(severity || 'info').toLowerCase();
  if (!userId) return;
  if (tenantId == null) throw new Error('notify: tenantId required');
  const db = getDb();
  const results = {};

  // Người nhận phải cùng tenant. Comment ngay trên nói "no silent cross-tenant
  // writes" nhưng trước đây **không có** bước nào kiểm tra điều đó: `userId` đi
  // thẳng từ `notify_to_user_ids` / `user_ids` trong body của client, và `tenantId`
  // lấy từ `req.user.tenant_id` — nên gửi được thông báo tenant A cho user tenant B.
  //
  // Sửa ở **đây** chứ không ở từng route vì đây là nơi duy nhất mọi lời gọi đều đi
  // qua. Trong request thì RLS đã chặn sẵn (GUC được set), nên kiểm này chủ yếu bảo
  // vệ các caller chạy nền — nơi `app.current_tenant` không có và RLS mở hatch
  // `app_tenant_unset()`, đúng chỗ `routes/jobs.js` từng rò 25 dòng.
  const target = await db.prepare('SELECT id, tenant_id FROM users WHERE id = ?').getAsync(userId);
  if (!target || Number(target.tenant_id) !== Number(tenantId)) {
    return { rejected: `user ${userId} không thuộc tenant ${tenantId}` };
  }

  // 1. in_app (always)
  if (channels.includes('in_app')) {
    try {
      const info = await db.prepare(`INSERT INTO notifications (tenant_id, user_id, project_id, issue_id, channel, delivery_status, severity, title, body, resource_type, resource_id, sent_at) VALUES (?, ?, ?, ?, 'in_app', 'sent', ?, ?, ?, ?, ?, now())`)
        .runAsync(tenantId, userId, projectId || null, issueId || null, severity, title, body, resourceType || null, resourceId || null);
      results.in_app = { ok: true, id: info.lastInsertRowid };
    } catch (e) {
      results.in_app = { ok: false, reason: e.message };
    }
  }

  // 2. email
  if (channels.includes('email')) {
    const u = await db.prepare('SELECT email, notify_email FROM users WHERE id = ? AND tenant_id = ?').getAsync(userId, tenantId);
    if (u?.notify_email && u.email) {
      results.email = await sendEmail(u.email, title, body);
    } else {
      results.email = { ok: false, reason: 'user email disabled or missing' };
    }
  }

  // 3. zalo
  if (channels.includes('zalo')) {
    const u = await db.prepare('SELECT zalo_user_id, notify_zalo FROM users WHERE id = ? AND tenant_id = ?').getAsync(userId, tenantId);
    if (u?.notify_zalo && u.zalo_user_id) {
      // zalo_user_id ma hoa cot (task 10) — giai ma truoc khi goi OA API.
      results.zalo = await sendZalo(dec(u.zalo_user_id), body);
    } else {
      results.zalo = { ok: false, reason: 'user zalo disabled or missing' };
    }
  }

  // 4. realtime fan-out (Wave D3): best-effort, never throws into callers.
  if (results.in_app?.ok) {
    try {
      const { publish } = await import('../lib/events.js');
      publish(userId, {
        type: 'notification.created',
        id: results.in_app.id, severity, title,
        resource_type: resourceType || null, resource_id: resourceId || null,
        project_id: projectId || null,
      });
    } catch {}
  }

  return results;
}

// Broadcast to multiple users (filters theo role/zone).
// `results` giữ nguyên một phần tử cho **mỗi** id, kể cả id bị từ chối — nên đếm
// `.length` vẫn bằng số id gửi vào. Dùng `delivered` để biết thực sự có bao nhiêu
// người nhận, và `rejected` để báo cáo id sai tenant thay vì im lặng bỏ.
export async function notifyMany(userIds, options) {
  const results = [];
  for (const uid of userIds) {
    const r = await notify({ ...options, userId: uid });
    results.push({ userId: uid, ...r });
  }
  return {
    results,
    delivered: results.filter((r) => r.in_app?.ok).length,
    rejected: results.filter((r) => r.rejected).map((r) => ({ userId: r.userId, reason: r.rejected })),
  };
}
