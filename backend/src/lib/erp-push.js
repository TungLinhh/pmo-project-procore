// ERP SFTP push (Wave 3 C2): AP ledger CSV → accountant server.
// Transport is injectable (default ssh2, mock in tests via ERP_SFTP_MOCK=1 or
// injected sender) — same doctrine as AI_MOCK. Secrets from env only.
// Retry 3× backoff; every attempt lands in erp_push_log (audit by record).
import { getDb } from '../db/index.js';
import { buildApLedger, AP_LEDGER_COLS } from '../routes/export.js';

const csvCell = (v) => {
  if (v == null) return '';
  const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function ledgerCsv(rows) {
  const lines = [AP_LEDGER_COLS.join(',')];
  for (const r of rows) lines.push(AP_LEDGER_COLS.map((c) => csvCell(r[c])).join(','));
  return '\ufeff' + lines.join('\n');
}

async function sftpPut({ host, port, username, secret, remotePath, data }) {
  if (process.env.ERP_SFTP_MOCK === '1') {
    return { ok: true, mocked: true, bytes: Buffer.byteLength(data) };
  }
  const { Client } = await import('ssh2').catch((e) => {
    // P2-9: missing ssh2 → actionable 503, never raw Cannot-find-module 500.
    if (e?.code === 'ERR_MODULE_NOT_FOUND' || /Cannot find (module|package)/.test(String(e?.message || ''))) {
      throw Object.assign(new Error('Optional dependency missing: ssh2 (run: npm install ssh2)'), { status: 503 });
    }
    throw e;
  });
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const timer = setTimeout(() => { try { conn.end(); } catch {} reject(new Error('sftp connect timeout (15s)')); }, 15000);
    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) { clearTimeout(timer); conn.end(); return reject(err); }
        const ws = sftp.createWriteStream(remotePath);
        ws.on('close', () => { clearTimeout(timer); conn.end(); resolve({ ok: true, bytes: Buffer.byteLength(data) }); });
        ws.on('error', (e) => { clearTimeout(timer); conn.end(); reject(e); });
        ws.end(data);
      });
    }).on('error', (e) => { clearTimeout(timer); reject(e); }).connect({
      host, port, username, password: secret,
      readyTimeout: 12000,
    });
  });
}

export async function pushLedger({ tenantId, profileId, projectId, sender = sftpPut }) {
  const db = getDb();
  const profile = await db.prepare('SELECT * FROM erp_profiles WHERE id = ? AND tenant_id = ?').getAsync(profileId, tenantId);
  if (!profile) throw Object.assign(new Error('ERP profile not found'), { status: 404 });
  if (!profile.enabled) throw Object.assign(new Error('ERP profile disabled'), { status: 422 });
  const secret = process.env[profile.secret_env];
  if (!secret) throw Object.assign(new Error(`SFTP secret missing: set ${profile.secret_env} in env`), { status: 503 });
  const project = await db.prepare('SELECT id, code FROM projects WHERE id = ? AND tenant_id = ?').getAsync(projectId, tenantId);
  if (!project) throw Object.assign(new Error('Project not found'), { status: 404 });
  const rows = await buildApLedger(projectId);
  const csv = ledgerCsv(rows);
  const remoteFile = `${profile.remote_path.replace(/\/*$/, '')}/ap-ledger-${project.code}-${Date.now()}.csv`;
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await sender({
        host: profile.sftp_host, port: profile.sftp_port, username: profile.sftp_user,
        secret, remotePath: remoteFile, data: csv,
      });
      await db.prepare(
        `INSERT INTO erp_push_log (tenant_id, profile_id, project_id, remote_file, bytes, status) VALUES (?, ?, ?, ?, ?, 'ok')`
      ).runAsync(tenantId, profileId, projectId, remoteFile, r.bytes ?? Buffer.byteLength(csv));
      return { ok: true, remote_file: remoteFile, bytes: r.bytes ?? Buffer.byteLength(csv), rows: rows.length, attempts: attempt, mocked: !!r.mocked };
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  await db.prepare(
    `INSERT INTO erp_push_log (tenant_id, profile_id, project_id, remote_file, bytes, status, error) VALUES (?, ?, ?, ?, 0, 'failed', ?)`
  ).runAsync(tenantId, profileId, projectId, remoteFile, String(lastErr?.message || lastErr).slice(0, 500));
  throw Object.assign(new Error(`SFTP push failed after 3 attempts: ${lastErr?.message || lastErr}`), { status: 502 });
}
