// FAST accounting connector (Wave D4): push approved payment requests as JSON,
// pull vendor tax list (suggest-only — writes go through the ERP confirm path).
// Auth: Bearer token from env (secret_env names the var). Endpoint paths come
// from profile config with sane defaults (per-customer adjustable — FAST
// deployments differ). Transport injectable for tests (mocked sender).
// No new npm deps (native fetch).
import { getDb } from '../db/index.js';

const DEFAULT_PATHS = { push_prs: '/api/prs', vendors: '/api/vendors' };

function cfgOf(profile) {
  const c = typeof profile.config === 'string' ? JSON.parse(profile.config || '{}') : (profile.config || {});
  return {
    baseUrl: (c.base_url || profile.sftp_host || '').replace(/\/*$/, ''),
    appId: c.app_id || profile.sftp_user || '',
    paths: { ...DEFAULT_PATHS, ...(c.paths || {}) },
  };
}

async function callFast({ baseUrl, appId, secret, path, method = 'GET', body = null, timeoutMs = 15000 }) {
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(baseUrl + path, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}`, 'X-App-Id': appId },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) return j;
      lastErr = new Error(j?.error || j?.message || `FAST HTTP ${r.status}`);
      lastErr.status = r.status;
      if (r.status !== 429 && r.status < 500) break;
    } catch (e) {
      lastErr = e;
      break;
    }
  }
  throw lastErr;
}

export async function pushFastPRs({ tenantId, profileId, projectId = null, sender = null }) {
  const db = getDb();
  const profile = await db.prepare('SELECT * FROM erp_profiles WHERE id = ? AND tenant_id = ?').getAsync(profileId, tenantId);
  if (!profile) throw Object.assign(new Error('ERP profile not found'), { status: 404 });
  if (profile.connector !== 'fast') throw Object.assign(new Error('profile is not a fast connector'), { status: 422 });
  const secret = process.env[profile.secret_env];
  if (!secret) throw Object.assign(new Error(`FAST secret missing: set ${profile.secret_env} in env`), { status: 503 });
  const cfg = cfgOf(profile);
  if (!cfg.baseUrl) throw Object.assign(new Error('fast profile needs config.base_url'), { status: 422 });
  // projectId is not optional decoration: without it this pushed every
  // APPROVED/PAID request in the tenant, so an ACCOUNTING user assigned to one
  // project could ship the whole tenant's AP ledger to the remote system.
  const rows = await db.prepare(
    `SELECT pr.id, pr.request_no, pr.amount, pr.status, pr.due_date, i.invoice_no, c.contract_no, p.code AS project_code
     FROM payment_requests pr
     JOIN invoices i ON i.id = pr.invoice_id
     JOIN contracts c ON c.id = i.contract_id
     JOIN projects p ON p.id = c.project_id
     WHERE p.tenant_id = ? ${projectId ? 'AND p.id = ?' : ''} AND pr.status IN ('APPROVED', 'PAID') ORDER BY pr.id DESC LIMIT 500`
  ).allAsync(...(projectId ? [tenantId, projectId] : [tenantId]));
  const payload = { project_count: rows.length, payment_requests: rows };
  const post = sender || (async (args) => callFast({ ...args, method: 'POST', body: payload }));
  const r = await post({ baseUrl: cfg.baseUrl, appId: cfg.appId, secret, path: cfg.paths.push_prs });
  await db.prepare(
    `INSERT INTO erp_push_log (tenant_id, profile_id, remote_file, bytes, status) VALUES (?, ?, ?, ?, 'ok')`
  ).runAsync(tenantId, profileId, `${cfg.baseUrl}${cfg.paths.push_prs}`, JSON.stringify(payload).length);
  return { ok: true, pushed: rows.length, ...(r && r.mocked ? { mocked: true } : {}) };
}

// Pull vendor tax list (read-only suggest helper — caller decides what to confirm).
export async function pullFastVendors({ tenantId, profileId, sender = null }) {
  const db = getDb();
  const profile = await db.prepare('SELECT * FROM erp_profiles WHERE id = ? AND tenant_id = ?').getAsync(profileId, tenantId);
  if (!profile) throw Object.assign(new Error('ERP profile not found'), { status: 404 });
  if (profile.connector !== 'fast') throw Object.assign(new Error('profile is not a fast connector'), { status: 422 });
  const secret = process.env[profile.secret_env];
  if (!secret) throw Object.assign(new Error(`FAST secret missing: set ${profile.secret_env} in env`), { status: 503 });
  const cfg = cfgOf(profile);
  if (!cfg.baseUrl) throw Object.assign(new Error('fast profile needs config.base_url'), { status: 422 });
  const get = sender || ((args) => callFast(args));
  const j = await get({ baseUrl: cfg.baseUrl, appId: cfg.appId, secret, path: cfg.paths.vendors });
  const list = Array.isArray(j) ? j : (j.vendors || j.items || j.data || []);
  return (Array.isArray(list) ? list : []).slice(0, 500).map((v) => ({
    name: String(v.name || v.ten || ''),
    tax_id: String(v.tax_id || v.mst || v.taxId || ''),
  })).filter((v) => v.name);
}
