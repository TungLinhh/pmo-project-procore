// Transaction wrapper — đảm bảo business action + audit log cùng COMMIT hoặc cùng ROLLBACK
// Trước đây: auditLog() chạy riêng, có thể fail → mất log
// Bây giờ: wrap trong transaction
//
// Usage:
//   await tx(async (client) => {
//     const r = await client.query('UPDATE ...', [...]);
//     await client.query('INSERT INTO audit_log ...');
//     return r;
//   });

import { getPool } from '../db/index.js';
export { getPool };

export async function tx(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    throw err;
  } finally {
    client.release();
  }
}

// Audit-friendly tx lives in ./with-audit.js as txAudit(req, meta, fn)
// (alias withAudit) — business + audit_log COMMIT/ROLLBACK together
// through the single shared pool from ../db/index.js.
