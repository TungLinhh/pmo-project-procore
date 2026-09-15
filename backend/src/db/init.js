// Database initialization — PG only.
// Migrations run through the schema_migrations ledger (lib: ./migrate.js),
// then unique indexes + idempotent seeds below.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getDb, closeDb } from './index.js';
import { runMigrations } from './migrate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = getDb();

console.log('Initializing PostgreSQL database...');

// Apply migrations (ledger: each file once, checksum-verified)
const drizzleDir = join(__dirname, '..', '..', 'drizzle');
try {
  const { ran, skipped, total } = await runMigrations(db, drizzleDir);
  console.log(`✓ Migrations: ${ran} applied, ${skipped} already applied (${total} files)`);
} catch (e) {
  console.error(`❌ Migration FAILED — aborting init: ${e.message}`);
  await closeDb();
  process.exit(1);
}

// Create unique indexes required by db.upsert() in ingestors
const requiredIndexes = [
  { name: 'business_process_steps_process_ord_uq', table: 'business_process_steps', cols: ['process_id', 'ordinal'] },
  { name: 'construction_schedule_items_uq', table: 'construction_schedule_items', cols: ['project_id', 'zone_id', 'source_sheet', 'ordinal'] },
  { name: 'subcontractors_tenant_name_uq', table: 'subcontractors', cols: ['tenant_id', 'name'] },
  { name: 'suppliers_tenant_name_uq', table: 'suppliers', cols: ['tenant_id', 'name'] },
  { name: 'materials_project_zone_code_uq', table: 'materials', cols: ['project_id', 'zone_id', 'material_code'] },
  { name: 'generic_sheets_uq', table: 'generic_sheets', cols: ['project_id', 'doc_type', 'source_sheet', 'ordinal'] },
  { name: 'daily_reports_project_date_uq', table: 'daily_reports', cols: ['project_id', 'report_date'] },
];
for (const idx of requiredIndexes) {
  await db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ${idx.name} ON ${idx.table} (${idx.cols.join(', ')})`);
}
console.log(`✓ Ensured ${requiredIndexes.length} unique indexes for upsert()`);

// Seed default tenant + project for demo
const tenantExists = await db.prepare('SELECT id FROM tenants WHERE code = ?').getAsync('hbg');
let tenantId;
if (!tenantExists) {
  const result = await db.prepare('INSERT INTO tenants (code, name) VALUES (?, ?)').runAsync('hbg', 'HBG Construction');
  tenantId = Number(result.lastInsertRowid);
  console.log(`✓ Created tenant 'hbg' (id=${tenantId})`);
} else {
  tenantId = tenantExists.id;
  console.log(`✓ Tenant 'hbg' exists (id=${tenantId})`);
}

// Seed admin user
const userExists = await db.prepare('SELECT id FROM users WHERE tenant_id = ? AND email = ?').getAsync(tenantId, 'admin@hbg.com');
if (!userExists) {
  await db.prepare('INSERT INTO users (tenant_id, email, name, role) VALUES (?, ?, ?, ?)').runAsync(tenantId, 'admin@hbg.com', 'Admin HBG', 'admin');
  console.log('✓ Created admin user admin@hbg.com');
}

// Phase 2 auth: every login requires a bcrypt password_hash. Demo users keep
// the shared dev password 'admin123' (hashed) so current demo logins survive;
// per-user passwords were never functional (auth.js hardcode accepted only
// admin123). Idempotent: only NULL hashes are set.
const { default: bcrypt } = await import('bcryptjs');
const unsetHashes = await db.prepare('SELECT id, email FROM users WHERE password_hash IS NULL').allAsync();
for (const u of unsetHashes) {
  const hash = await bcrypt.hash('admin123', 10);
  await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').runAsync(hash, u.id);
  console.log(`✓ Set dev password hash for ${u.email}`);
}

// Seed demo projects — BTE only. (LAWRENCE-STING-2 was a placeholder seed,
// removed: real projects come from user ingestion, e.g. HBG-LVK-BCTH.)
const projects = [
  { code: 'BTE-WP4-HBC', name_vi: 'Khu du lịch sinh thái Bãi Tràm', name_en: 'Bãi Tràm Estates', package: 'MEP', rev_prefix: 'BTE-HBG' },
];
for (const p of projects) {
  const exists = await db.prepare('SELECT id FROM projects WHERE tenant_id = ? AND code = ?').getAsync(tenantId, p.code);
  if (!exists) {
    await db.prepare('INSERT INTO projects (tenant_id, code, name_vi, name_en, package, rev_prefix) VALUES (?, ?, ?, ?, ?, ?)').runAsync(tenantId, p.code, p.name_vi, p.name_en, p.package, p.rev_prefix);
    console.log(`✓ Created project ${p.code}`);
  }
}

// Seed zones for BTE project
const bteProject = await db.prepare('SELECT id FROM projects WHERE tenant_id = ? AND code = ?').getAsync(tenantId, 'BTE-WP4-HBC');
if (bteProject) {
  const zones = [
    { code: 'BOH', name_en: 'Back of House' },
    { code: 'BPV', name_en: 'Beach Pool Villa' },
    { code: 'BPV-1BR', name_en: 'Beach Pool Villa 1BR' },
    { code: 'BPV-2BR', name_en: 'Beach Pool Villa 2BR' },
    { code: 'BSN', name_en: 'Business' },
    { code: 'BUT', name_en: 'Butler' },
    { code: 'BZONE', name_en: 'Zone B' },
    { code: 'CLU', name_en: 'Cluster Villa' },
    { code: 'GEN', name_en: 'General' },
    { code: 'HPV', name_en: 'HPV' },
    { code: 'HPV-1BR', name_en: 'HPV 1BR' },
    { code: 'HPV-2BR', name_en: 'HPV 2BR' },
    { code: 'INF', name_en: 'Infrastructure' },
    { code: 'KID', name_en: 'Kid Club' },
    { code: 'LOB-SPA', name_en: 'Lobby & Spa' },
    { code: 'RES', name_en: 'Resort' },
    { code: 'RES-3BR', name_en: 'Resort 3BR' },
    { code: 'RES-4BR', name_en: 'Resort 4BR' },
    { code: 'VNR', name_en: 'Vietnam Residences' },
  ];
  for (const z of zones) {
    const exists = await db.prepare('SELECT id FROM zones WHERE project_id = ? AND code = ?').getAsync(bteProject.id, z.code);
    if (!exists) {
      await db.prepare('INSERT INTO zones (project_id, code, name_en) VALUES (?, ?, ?)').runAsync(bteProject.id, z.code, z.name_en);
    }
  }
  console.log(`✓ Seeded ${zones.length} zones for BTE project`);
}

// Seed departments (Wave 2 approval chains). Idempotent; codes are stable
// so approval_chains can reference them. Rename freely via master-data.
const departments = [
  { code: 'KT', name_vi: 'Kỹ thuật' },
  { code: 'TC', name_vi: 'Thi công' },
  { code: 'AT', name_vi: 'An toàn' },
  { code: 'VP', name_vi: 'Văn phòng' },
];
for (const d of departments) {
  const exists = await db.prepare('SELECT id FROM departments WHERE tenant_id = ? AND code = ?').getAsync(tenantId, d.code);
  if (!exists) {
    await db.prepare('INSERT INTO departments (tenant_id, code, name_vi) VALUES (?, ?, ?)').runAsync(tenantId, d.code, d.name_vi);
    console.log(`✓ Created department ${d.code}`);
  }
}
// HBG-only access seam: every user is a member of every project in their
// tenant. Idempotent. (Multi-tenant later = manage project_members explicitly
// instead of this backfill.)
const allUsers = await db.prepare('SELECT id, tenant_id FROM users').allAsync();
const allProjects = await db.prepare('SELECT id, tenant_id FROM projects').allAsync();
let memberAdds = 0;
for (const u of allUsers) {
  for (const p of allProjects) {
    if (u.tenant_id !== p.tenant_id) continue;
    const has = await db.prepare('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?').getAsync(p.id, u.id);
    if (!has) {
      // explicit RETURNING: the db wrapper auto-appends RETURNING id, but this
      // table's PK is (project_id, user_id) with no id column.
      await db.prepare('INSERT INTO project_members (project_id, user_id) VALUES (?, ?) RETURNING project_id').runAsync(p.id, u.id);
      memberAdds++;
    }
  }
}
if (memberAdds) console.log(`✓ Backfilled ${memberAdds} project memberships`);

// One-time sequence resync (replaces the old per-INSERT setval magic):
// external imports with explicit ids can leave <table>_id_seq behind MAX(id).
// 3-arg setval with is_called=false on empty tables keeps the first-ever
// insert at id 1 (2-arg form would skip to 2 — fatal for seeded tenant id=1).
const seqTables = await db.prepare(
  `SELECT t.tablename FROM pg_tables t
   JOIN information_schema.columns c ON c.table_name = t.tablename
     AND c.table_schema = 'public' AND c.column_name = 'id'
   WHERE t.schemaname = 'public'`
).allAsync();
for (const { tablename } of seqTables) {
  try {
    await db.exec(`SELECT setval(pg_get_serial_sequence('"${tablename}"', 'id'),
      GREATEST((SELECT COALESCE(MAX(id), 0) FROM "${tablename}"), 1),
      EXISTS (SELECT 1 FROM "${tablename}"))`);
  } catch { /* no serial sequence on id (e.g. ledger PK) — ignore */ }
}
console.log(`✓ Resynced sequences for ${seqTables.length} table(s)`);

await closeDb();
console.log(`\n✅ Database ready`);
