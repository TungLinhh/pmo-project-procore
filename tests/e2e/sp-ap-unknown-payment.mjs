import { getDb, getOwnerDb, closeDb } from '../../backend/src/db/index.js';
import { commit } from '../../backend/src/services/ingest/sp_ap.js';

let project = null;
try {
  const owner = getOwnerDb();
  project = await owner.prepare(
    `INSERT INTO projects (tenant_id, code, name_vi, status) VALUES (1, $1, 'SP unknown payment', 'ACTIVE') RETURNING id`,
  ).getAsync(`SP-UNKNOWN-${Date.now()}`);
  const parsed = {
    skippedEmpty: 0,
    sheets: [{
      sheet: 'supplier',
      rows: [{
        rowIndex: 1, ref_code: 'REF-1', description: 'Test', contract_no: 'SP-UNKNOWN-1', contract_date: null,
        batches: [{
          rowIndex: 1, batch: '1', request_no: 'SP-UNKNOWN-REQ-1',
          payment: { paid_date: '2026-01-01', value: null, balance: null, dossier_date: null, due_date: null },
        }],
      }],
    }],
  };
  const report = await commit(parsed, project.id, 'ZONE-1');
  if (report.errors < 1) throw new Error('unknown paid amount was not rejected');
  const db = getDb();
  const paid = await db.prepare(
    `SELECT COUNT(*)::int AS n FROM payments
     WHERE project_id = ? AND status = 'PAID'`,
  ).getAsync(project.id);
  if (paid.n !== 0) throw new Error('unknown paid amount created a PAID payment');
  console.log('ALL PASS — supplier AP unknown paid amount is rejected without PAID side effect');
} catch (error) {
  console.error(`FAIL — ${error.message}`);
  process.exitCode = 1;
} finally {
  if (project) {
    const owner = getOwnerDb();
    await owner.prepare('DELETE FROM payments WHERE project_id = ?').runAsync(project.id).catch(() => {});
    await owner.prepare('DELETE FROM payment_requests WHERE invoice_id IN (SELECT i.id FROM invoices i JOIN contracts c ON c.id = i.contract_id WHERE c.project_id = ?)').runAsync(project.id).catch(() => {});
    await owner.prepare('DELETE FROM invoices WHERE contract_id IN (SELECT id FROM contracts WHERE project_id = ?)').runAsync(project.id).catch(() => {});
    await owner.prepare('DELETE FROM contracts WHERE project_id = ?').runAsync(project.id).catch(() => {});
    await owner.prepare('DELETE FROM zones WHERE project_id = ?').runAsync(project.id).catch(() => {});
    await owner.prepare('DELETE FROM project_members WHERE project_id = ?').runAsync(project.id).catch(() => {});
    await owner.prepare('DELETE FROM projects WHERE id = ?').runAsync(project.id).catch(() => {});
    await owner.prepare("DELETE FROM audit_log WHERE context->>'project_id' = ?").runAsync(String(project.id)).catch(() => {});
  }
  await closeDb();
}
