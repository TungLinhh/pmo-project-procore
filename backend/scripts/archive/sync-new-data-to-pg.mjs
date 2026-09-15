// Sync data mới (từ mục 43) từ SQLite → PostgreSQL
// Mục đích: đảm bảo PG đủ data để backend có thể chuyển sang PG sau này
// Chạy: node scripts/archive/sync-new-data-to-pg.mjs
import sqlite3 from 'better-sqlite3';
import pg from 'pg';

const sqlite = sqlite3('/home/vutun/pmo_project/backend/data/pmo.db', { readonly: true });
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_pass@localhost:5432/pmo' });

async function sync(table, columns) {
  const rows = sqlite.prepare(`SELECT ${columns.join(', ')} FROM ${table}`).all();
  if (rows.length === 0) { console.log(`  ${table}: 0 rows (skip)`); return 0; }

  // Clear + insert
  await pool.query(`DELETE FROM ${table}`);
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const colList = columns.map(c => `"${c}"`).join(', ');
  let inserted = 0;
  for (const r of rows) {
    const values = columns.map(c => r[c] === undefined ? null : r[c]);
    try {
      await pool.query(`INSERT INTO ${table} (${colList}) VALUES (${placeholders})`, values);
      inserted++;
    } catch (e) {
      console.error(`  ${table} insert error:`, e.message.slice(0, 100));
    }
  }
  console.log(`  ${table}: ${inserted}/${rows.length} synced`);
  return inserted;
}

async function main() {
  console.log('Syncing new tables (mục 43) from SQLite → PG...');

  // Bảng cũ đã sync từ migrate-sqlite-to-pg.mjs (projects, zones, shop_drawings, materials, schedule, daily_*, business_process_steps, subcontractors, suppliers)
  // Sync các bảng mới/missing:
  await sync('issues', [
    'id', 'tenant_id', 'project_id', 'source_resource', 'source_id', 'title', 'body',
    'category', 'severity', 'status', 'created_at', 'updated_at'
  ]);
  await sync('notifications', [
    'id', 'tenant_id', 'user_id', 'severity', 'title', 'body', 'resource_type', 'resource_id', 'read_at', 'created_at'
  ]);
  await sync('directives', [
    'id', 'tenant_id', 'project_id', 'issue_id', 'from_user_id', 'from_user_name', 'body', 'notify_to_user_ids', 'created_at'
  ]);
  await sync('audit_log', [
    'id', 'tenant_id', 'user_id', 'user_name', 'action', 'resource_type', 'resource_id',
    'field_name', 'old_value', 'new_value', 'note', 'created_at'
  ]);
  await sync('rfa_log', [
    'id', 'project_id', 'source_sheet', 'ordinal', 'rfa_code', 'description_vi',
    'discipline', 'area', 'submitted_date', 'reviewer', 'reviewer_status',
    'reviewer_comment', 'response_date', 'final_status', 'notes', 'created_at'
  ]);

  // material_submittals (từ SQLite)
  await sync('material_submittals', [
    'id', 'project_id', 'material_id', 'submittal_code', 'status', 'sla_days', 'sla_deadline',
    'revision_number', 'parent_submittal_id', 'rejection_reason', 'submitted_by', 'approved_by',
    'submitted_date', 'approved_date', 'rejected_at', 'created_at'
  ]);

  // schedule_baselines
  await sync('schedule_baselines', ['id', 'project_id', 'version', 'effective_date', 'created_by', 'notes', 'created_at']);

  // kpi_targets (từ SQLite)
  await sync('kpi_targets', [
    'id', 'project_id', 'kpi_code', 'name_vi', 'target_value', 'actual_value',
    'period_start', 'period_end', 'version', 'effective_from', 'approved_by', 'created_at'
  ]);

  // contracts (empty)
  await sync('contracts', ['id', 'project_id', 'vendor_id', 'contract_no', 'contract_name', 'signed_date', 'total_value', 'status', 'created_at']);
  await sync('invoices', ['id', 'contract_id', 'invoice_no', 'invoice_date', 'amount', 'vat_amount', 'status', 'created_at']);
  await sync('payment_requests', ['id', 'invoice_id', 'request_no', 'request_date', 'amount', 'retention_amount', 'due_date', 'status', 'approved_by', 'approved_date', 'notes', 'created_at']);

  // offline_sync_queue (with enum mapping SQLite → PG)
  const offlineRows = sqlite.prepare(`SELECT id, user_id, device_id, client_id, resource_type, resource_json,
    client_timestamp, client_created_at, conflict_resolution, server_record_id,
    superseded_at, status, error_message, synced_at, created_at FROM offline_sync_queue`).all();
  await pool.query(`DELETE FROM offline_sync_queue`);
  const enumMap = { CLIENT: 'CLIENT_NEWER', SERVER: 'SERVER_NEWER', EQUAL: 'EQUAL', NONE: 'NONE' };
  let count = 0;
  for (const r of offlineRows) {
    try {
      await pool.query(
        `INSERT INTO offline_sync_queue (id, user_id, device_id, client_id, resource_type, resource_json,
          client_timestamp, client_created_at, conflict_resolution, server_record_id,
          superseded_at, status, error_message, synced_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::sync_conflict, $10, $11, $12, $13, $14, $15)`,
        [r.id, r.user_id, r.device_id, r.client_id, r.resource_type, r.resource_json,
         r.client_timestamp, r.client_created_at,
         enumMap[r.conflict_resolution] || 'NONE', r.server_record_id, r.superseded_at,
         r.status, r.error_message, r.synced_at, r.created_at]
      );
      count++;
    } catch (e) {
      console.error(`  offline_sync_queue error:`, e.message.slice(0, 80));
    }
  }
  console.log(`  offline_sync_queue: ${count}/${offlineRows.length} synced`);

  console.log('\n✅ Sync complete');
  await pool.end();
  sqlite.close();
}

main().catch(e => { console.error(e); process.exit(1); });
