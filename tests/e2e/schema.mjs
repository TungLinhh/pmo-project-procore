// PG Schema deep verify (env-driven: PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE/PSQL_BIN)
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { psqlQuery } from '../tools/env.mjs';
const run = (sql) => psqlQuery(sql, { tuplesOnly: false });
const issues = [];
const log = [];

function check(name, ok, detail) { log.push({ name, ok, detail }); console.log(`  ${ok ? '✅' : '❌'} ${name}: ${detail}`); if (!ok) issues.push(name); }

// 1. All tables exist
const tables = run("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name").trim();
const required = ['users', 'projects', 'zones', 'wbs', 'work_items', 'shop_drawings', 'materials', 'material_submittals', 'contracts', 'invoices', 'payment_requests', 'payment_request_items', 'payments', 'schedule_baselines', 'schedule_baseline_items', 'kpi_targets', 'audit_log', 'notifications', 'issues', 'directives', 'vendors', 'subcontractors', 'suppliers', 'workers', 'teams', 'rfa_log', 'daily_reports', 'manpower_plans', 'qa_inspections', 'attention_digest_runs'];
const missing = required.filter(t => !tables.includes(t));
check('Required tables', missing.length === 0, `${missing.length === 0 ? 'all present' : 'missing: ' + missing.join(',')}`);

// 2. Audit log columns
const auditCols = run("SELECT column_name FROM information_schema.columns WHERE table_name='audit_log' ORDER BY ordinal_position").trim();
const auditReq = ['id', 'action', 'resource_type', 'resource_id', 'context', 'field_changes', 'actor_role', 'created_at', 'user_name'];
const auditMissing = auditReq.filter(c => !auditCols.includes(c));
check('audit_log columns', auditMissing.length === 0, auditMissing.length === 0 ? 'all present' : 'missing: ' + auditMissing.join(','));

// 3. Audit log indexes
const auditIdx = run("SELECT indexname FROM pg_indexes WHERE tablename='audit_log'").trim();
check('audit_log indexes', auditIdx.includes('audit_project_idx') && auditIdx.includes('audit_action_idx'), 'audit_project_idx + audit_action_idx');

// 4. Material submittal columns (SLA)
const msCols = run("SELECT column_name FROM information_schema.columns WHERE table_name='material_submittals' ORDER BY ordinal_position").trim();
const msReq = ['supervisor_approval_days', 'supervisor_deadline', 'sla_deadline', 'sla_days', 'revision_number', 'physical_sample_status', 'physical_sample_received_at'];
const msMissing = msReq.filter(c => !msCols.includes(c));
check('material_submittals SLA cols', msMissing.length === 0, msMissing.length === 0 ? 'all present' : 'missing: ' + msMissing.join(','));

// 5. Projects columns (close)
const projCols = run("SELECT column_name FROM information_schema.columns WHERE table_name='projects' ORDER BY ordinal_position").trim();
const projReq = ['status', 'closed_at', 'closed_by', 'close_reason', 'closed_revoked_at', 'closed_revoked_by'];
const projMissing = projReq.filter(c => !projCols.includes(c));
check('projects close cols', projMissing.length === 0, projMissing.length === 0 ? 'all present' : 'missing: ' + projMissing.join(','));

// 6. Users columns (notification prefs)
const userCols = run("SELECT column_name FROM information_schema.columns WHERE table_name='users' ORDER BY ordinal_position").trim();
const userReq = ['notify_email', 'notify_zalo', 'zalo_user_id'];
const userMissing = userReq.filter(c => !userCols.includes(c));
check('users notification cols', userMissing.length === 0, userMissing.length === 0 ? 'all present' : 'missing: ' + userMissing.join(','));

// 7. KPI versioning columns
const kpiCols = run("SELECT column_name FROM information_schema.columns WHERE table_name='kpi_targets' ORDER BY ordinal_position").trim();
const kpiReq = ['version', 'effective_from', 'effective_to', 'kpi_code'];
const kpiMissing = kpiReq.filter(c => !kpiCols.includes(c));
check('kpi_targets versioning', kpiMissing.length === 0, kpiMissing.length === 0 ? 'all present' : 'missing: ' + kpiMissing.join(','));

// 8. Schedule baseline versioning
const sbCols = run("SELECT column_name FROM information_schema.columns WHERE table_name='schedule_baselines' ORDER BY ordinal_position").trim();
const sbReq = ['version', 'content_hash', 'is_current', 'source_scenario_id'];
const sbMissing = sbReq.filter(c => !sbCols.includes(c));
check('schedule_baselines version', sbMissing.length === 0, sbMissing.length === 0 ? 'present' : 'missing');

// 9. Enums (workflow_status has PAID)
const enumList = run("SELECT enumlabel FROM pg_enum WHERE enumtypid = 'workflow_status'::regtype ORDER BY enumsortorder").trim();
const enumReq = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID'];
const enumMissing = enumReq.filter(e => !enumList.includes(e));
check('workflow_status enum', enumMissing.length === 0, enumMissing.length === 0 ? 'all values present' : 'missing: ' + enumMissing.join(','));

// 10. master_status has CLOSED
const masterList = run("SELECT enumlabel FROM pg_enum WHERE enumtypid = 'master_status'::regtype ORDER BY enumsortorder").trim();
check('master_status has CLOSED', masterList.includes('CLOSED'), 'present');

// 11. Lifecycle, equipment and digest columns
const shopCols = run("SELECT column_name FROM information_schema.columns WHERE table_name='shop_drawings'").trim();
const prCols = run("SELECT column_name FROM information_schema.columns WHERE table_name='payment_requests'").trim();
const manpowerCols = run("SELECT column_name FROM information_schema.columns WHERE table_name='daily_manpower'").trim();
const workItemCols = run("SELECT column_name FROM information_schema.columns WHERE table_name='work_items'").trim();
const materialCols = run("SELECT column_name FROM information_schema.columns WHERE table_name='materials'").trim();
const baselineItemCols = run("SELECT column_name FROM information_schema.columns WHERE table_name='schedule_baseline_items'").trim();
const tailReq = {
  shop_drawings: ['as_built_status', 'as_built_at', 'as_built_by'],
  payment_requests: ['retention_status', 'retention_due_date', 'retention_released_amount', 'retention_released_at'],
  daily_manpower: ['kind', 'work_item_id'],
  work_items: ['zone_id', 'item_type', 'source_schedule_item_id', 'updated_at'],
  materials: ['procurement_status', 'po_number', 'delivered_at', 'accepted_at', 'work_item_id'],
  schedule_baseline_items: ['baseline_id', 'schedule_item_id', 'plan_start_date', 'plan_end_date', 'plan_duration_days'],
};
const tailMissing = [
  ...tailReq.shop_drawings.filter((c) => !shopCols.includes(c)).map((c) => `shop_drawings.${c}`),
  ...tailReq.payment_requests.filter((c) => !prCols.includes(c)).map((c) => `payment_requests.${c}`),
  ...tailReq.daily_manpower.filter((c) => !manpowerCols.includes(c)).map((c) => `daily_manpower.${c}`),
  ...tailReq.work_items.filter((c) => !workItemCols.includes(c)).map((c) => `work_items.${c}`),
  ...tailReq.materials.filter((c) => !materialCols.includes(c)).map((c) => `materials.${c}`),
  ...tailReq.schedule_baseline_items.filter((c) => !baselineItemCols.includes(c)).map((c) => `schedule_baseline_items.${c}`),
];
check('Lifecycle tail columns', tailMissing.length === 0, tailMissing.length === 0 ? 'all present' : 'missing: ' + tailMissing.join(','));

// 12. Foreign keys
const fkCount = run("SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_type='FOREIGN KEY' AND table_schema='public'").trim().split('\n')[2].trim();
check('FK constraints', parseInt(fkCount) >= 20, `${fkCount} FKs`);

// 12. Indexes count
const idxCount = run("SELECT COUNT(*) FROM pg_indexes WHERE schemaname='public'").trim().split('\n')[2].trim();
check('Indexes', parseInt(idxCount) >= 50, `${idxCount} indexes`);

// 13. Audit log has rows
const auditRows = run("SELECT COUNT(*) FROM audit_log").trim().split('\n')[2].trim();
check('audit_log has data', parseInt(auditRows) > 0, `${auditRows} rows`);

// 14. Sequences aligned
const seqs = run("SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema='public'").trim();
check('Sequences', seqs.split('\n').length > 20, `${seqs.split('\n').length} sequences`);

// 15. Every current Drizzle migration is recorded in the checksum ledger.
const migrationDir = join(fileURLToPath(new URL('../../backend/drizzle/', import.meta.url)));
const migrationFiles = readdirSync(migrationDir).filter((name) => name.endsWith('.sql'));
const tracked = new Set(psqlQuery('SELECT filename FROM schema_migrations').split('\n').filter(Boolean));
const missingMigrations = migrationFiles.filter((name) => !tracked.has(name));
const migCount = psqlQuery('SELECT COUNT(*) FROM schema_migrations');
check(
  'Migrations tracked',
  missingMigrations.length === 0 && Number(migCount) >= migrationFiles.length,
  `${migCount} ledger rows; ${migrationFiles.length} current files${missingMigrations.length ? `; missing: ${missingMigrations.join(',')}` : ''}`,
);

console.log(`\n=== Schema verify: ${log.filter(l => l.ok).length}/${log.length} PASS ===\n`);
if (issues.length) {
  console.log('FAILED:', issues);
  process.exit(1);
}
