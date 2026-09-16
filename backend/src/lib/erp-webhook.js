// Generic outbound webhooks (Wave D4): HMAC-SHA256 signed POST on domain events.
// Subscriptions reuse erp_profiles (connector='webhook', config {url, events}).
// Delivery logged to erp_push_log (remote_file=url). Retry 3×, then log failed.
// Secret from env only (secret_env names the var) — never stored, never logged.
import { createHmac } from 'node:crypto';
import { getDb } from '../db/index.js';

export function signWebhook(secret, body) {
  return createHmac('sha256', secret).update(body).digest('hex');
}

export async function deliverWebhook({ tenantId, profile, event, sender = null }) {
  const db = getDb();
  const cfg = typeof profile.config === 'string' ? JSON.parse(profile.config || '{}') : (profile.config || {});
  const url = cfg.url;
  if (!url || !/^https?:\/\//.test(url)) throw Object.assign(new Error('webhook profile needs config.url (http/https)'), { status: 422 });
  const secret = process.env[profile.secret_env];
  if (!secret) throw Object.assign(new Error(`webhook secret missing: set ${profile.secret_env} in env`), { status: 503 });
  const body = JSON.stringify({ event: event.type, at: new Date().toISOString(), tenant_id: tenantId, data: event.data || {} });
  const headers = {
    'Content-Type': 'application/json',
    'X-PMO-Event': event.type,
    'X-PMO-Signature': signWebhook(secret, body),
  };
  const post = sender || (async () => {
    const r = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw Object.assign(new Error(`webhook HTTP ${r.status}`), { status: 502 });
    return { ok: true };
  });
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await post({ url, headers, body });
      await db.prepare(
        `INSERT INTO erp_push_log (tenant_id, profile_id, remote_file, bytes, status) VALUES (?, ?, ?, ?, 'ok')`
      ).runAsync(tenantId, profile.id, url, Buffer.byteLength(body));
      return { ok: true, attempts: attempt };
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 300 * attempt));
    }
  }
  await db.prepare(
    `INSERT INTO erp_push_log (tenant_id, profile_id, remote_file, bytes, status, error) VALUES (?, ?, ?, ?, 'failed', ?)`
  ).runAsync(tenantId, profile.id, url, Buffer.byteLength(body), String(lastErr?.message || lastErr).slice(0, 500));
  throw Object.assign(new Error(`webhook failed after 3 attempts: ${lastErr?.message || lastErr}`), { status: 502 });
}

// Fan-out helper: all enabled webhook subs whose events include type (or '*').
// Fire-and-forget for domain call sites (never throws into business logic).
export async function emitWebhook(tenantId, type, data) {
  try {
    const db = getDb();
    const profiles = await db.prepare(
      `SELECT * FROM erp_profiles WHERE tenant_id = ? AND connector = 'webhook' AND enabled`
    ).allAsync(tenantId);
    for (const p of profiles) {
      const cfg = typeof p.config === 'string' ? JSON.parse(p.config || '{}') : (p.config || {});
      const events = Array.isArray(cfg.events) ? cfg.events : [];
      if (!events.includes(type) && !events.includes('*')) continue;
      await deliverWebhook({ tenantId, profile: p, event: { type, data } }).catch(() => {});
    }
  } catch {}
}
