// Database initialization — PG only. OWNER pool throughout: migrations, DDL
// indexes, setval resync and seeds all need ownership. Request traffic never
// touches this pool (see db/index.js getDb vs getOwnerDb).
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getOwnerDb, closeDb } from './index.js';
import { runMigrations } from './migrate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = getOwnerDb();

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

// App role password (Wave 2 A1): set from env every boot so rotation = restart.
// AFTER migrations — fresh DBs only gain the role from 9999h. Dev default
// matches buildAppDatabaseUrl(); production MUST set APP_DB_PASSWORD.
try {
  const appPass = process.env.APP_DB_PASSWORD || 'pmo_app_dev_pwd';
  await db.exec(`ALTER ROLE pmo_app WITH LOGIN PASSWORD '${appPass.replace(/'/g, "''")}'`);
  console.log('✓ App role password ensured');
} catch (e) {
  console.error(`❌ App role password FAILED (needs 9999h applied): ${e.message}`);
  await closeDb();
  process.exit(1);
}

  // ── Cấp quyền đọc cho `pmo_backup` TRÊN MỌI BẢNG, sau mỗi lần migrate ───────────
  // Vì sao phải ở đây, mà không chỉ dựa vào `ALTER DEFAULT PRIVILEGES`:
  // default privileges chỉ phủ object tạo **sau** nó **bởi đúng role đã đặt**. Migration
  // của dự án chạy bằng `pmo_user` (owner), còn `00-backup-role.sh` thường chạy bằng
  // `vutun` ⇒ bảng mới tạo bởi `pmo_user` **không** được phủ. Đo 2026-09-30: thêm bảng
  // `demo_date_rebase` xong thì `POST /api/admin/backups/run` trả 500 với
  // `permission denied for table demo_date_rebase` — tức **sao lưu hỏng đúng lúc thêm
  // bảng mới**, đúng thứ `00-backup-role.sh` đã cảnh báo bằng comment nhưng không chặn
  // được. `pg_dump` dừng ở bảng đầu tiên không đọc được.
  //
  // Nên: sau migrate, cấp lại cho toàn bảng. Rẻ, và tự phục hồi ở lần boot sau — bài
  // kiểm `tests/e2e/backup.mjs` bắt được hồi quy này, không phải may mắn.
  try {
    const hasBackupRole = await db.prepare(`SELECT 1 AS ok FROM pg_roles WHERE rolname = 'pmo_backup'`).getAsync();
    if (hasBackupRole?.ok) {
      await db.exec('GRANT SELECT ON ALL TABLES IN SCHEMA public TO pmo_backup');
      await db.exec('GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO pmo_backup');
      console.log('✓ pmo_backup: granted SELECT on all tables/sequences (backup-safe)');
    } else {
      // Không phải lỗi: máy dev không cài role sao lưu. Nhắc để không ai tưởng sao lưu
      // chạy được khi thực tế không có role nào đọc.
      console.log('· pmo_backup chưa có — bỏ qua (xem deploy/production/00-backup-role.sh)');
    }
  } catch (e) {
    // Không được làm hỏng boot vì việc cấp quyền sao lưu thất bại; chỉ cảnh báo.
    console.error(`⚠ cấp quyền pmo_backup thất bại: ${e.message}`);
  }

// Create unique indexes required by db.upsert() in ingestors
const requiredIndexes = [
  { name: 'business_process_steps_process_ord_uq', table: 'business_process_steps', cols: ['process_id', 'ordinal'] },
  { name: 'construction_schedule_items_uq', table: 'construction_schedule_items', cols: ['project_id', 'zone_id', 'source_sheet', 'level_roman', 'level_arabic', 'sublevel', 'ordinal'] },
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
// Offline outbox dedupe (Wave 2 B1): one PENDING row per (user, client_id).
// Resolved rows keep history (same client_id may recur after resolve).
await db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS offline_sync_queue_user_client_uq
  ON offline_sync_queue (user_id, client_id) WHERE status = 'PENDING'`);

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

// Demo personas are seeded only outside production (or with an explicit test
// hatch). Production operators must provision real credentials and MFA/SSO.
const allowDemoAccounts = process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEV_PASSWORD === '1';
if (allowDemoAccounts) {
  const demoUsers = [
    ['ceo@hbg.com', 'CEO HBG', 'pmo', true],
    ['pm@hbg.com', 'PM HBG', 'pm', false],
    ['pmo@hbg.com', 'PMO HBG', 'pmo', false],
    ['site@hbg.com', 'Site HBG', 'site', false],
    ['technical@hbg.com', 'Technical HBG', 'technical', false],
    ['procurement@hbg.com', 'Procurement HBG', 'procurement', false],
    ['accounting@hbg.com', 'Accounting HBG', 'accounting', false],
  ];
  for (const [email, name, role, isCeo] of demoUsers) {
    const exists = await db.prepare('SELECT id FROM users WHERE tenant_id = ? AND email = ?').getAsync(tenantId, email);
    if (!exists) {
      await db.prepare('INSERT INTO users (tenant_id, email, name, role, is_ceo) VALUES (?, ?, ?, ?, ?)')
        .runAsync(tenantId, email, name, role, isCeo);
      console.log(`✓ Created demo user ${email}`);
    }
  }
} else {
  console.log('✓ Demo accounts skipped in production');
}

// Every login requires a bcrypt password_hash. Development seeds demo users
// with the documented shared password. Production sets the first admin password
// once, then removes ADMIN_INITIAL_PASSWORD from the runtime environment.
const { default: bcrypt } = await import('bcryptjs');
const unsetHashes = await db.prepare(
  'SELECT id, email FROM users WHERE tenant_id = ? AND password_hash IS NULL ORDER BY id'
).allAsync(tenantId);
if (allowDemoAccounts) {
  for (const u of unsetHashes) {
    const hash = await bcrypt.hash('admin123', 10);
    await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').runAsync(hash, u.id);
    console.log(`✓ Set dev password hash for ${u.email}`);
  }
} else {
  const adminWithoutPassword = unsetHashes.find((user) => user.email === 'admin@hbg.com');
  if (adminWithoutPassword) {
    const initialPassword = String(process.env.ADMIN_INITIAL_PASSWORD || '');
    if (initialPassword.length < 12) {
      throw new Error('ADMIN_INITIAL_PASSWORD (>=12 characters) is required for the first production admin login');
    }
    const hash = await bcrypt.hash(initialPassword, 12);
    await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').runAsync(hash, adminWithoutPassword.id);
    console.log('✓ Initial production admin password set');
  }
  const remaining = unsetHashes.filter((user) => user.email !== 'admin@hbg.com').length;
  if (remaining) {
    console.warn(`⚠ ${remaining} production user(s) have no password_hash; provision credentials before login`);
  }
}

// Demo project data never enters a production database.
if (allowDemoAccounts) {
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

    // Demo tenant only: give each seeded persona explicit access to the demo
    // project. Production and new projects still require explicit membership.
    const demoEmails = ['pm@hbg.com', 'pmo@hbg.com', 'site@hbg.com', 'technical@hbg.com', 'procurement@hbg.com', 'accounting@hbg.com'];
    for (const email of demoEmails) {
      const member = await db.prepare('SELECT id FROM users WHERE tenant_id = ? AND email = ?').getAsync(tenantId, email);
      if (member?.id) {
        await db.prepare('INSERT INTO project_members (project_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING').runAsync(bteProject.id, member.id);
      }
    }
    console.log('✓ Seeded explicit demo memberships for BTE project');
  }
} else {
  console.log('✓ Demo project and zone data skipped in production');
}

// A fresh local demo has no provider rows yet. Seed the real OpenRouter
// routes as names only; the key is still read from backend/.env at runtime.
// Production skips this block and must provision providers explicitly.
if (allowDemoAccounts) {
  const aiCount = await db.prepare('SELECT COUNT(*) AS c FROM ai_provider_configs WHERE tenant_id = ?').getAsync(tenantId);
  if (Number(aiCount?.c || 0) === 0) {
    const demoRoutes = [
      ['chat', 'nvidia/nemotron-3-ultra-550b-a55b:free', 0],
      ['chat', 'stealth/space-bunny-alpha', 1],
      ['embed', 'nvidia/nemotron-3-embed-1b:free', 1],
    ];
    for (const [purpose, model, priority] of demoRoutes) {
      await db.prepare(
        `INSERT INTO ai_provider_configs
          (tenant_id, purpose, provider, model, api_key_env, priority, enabled)
         VALUES (?, ?, 'openrouter', ?, 'OPENROUTER_API_KEY', ?, true)`,
      ).runAsync(tenantId, purpose, model, priority);
    }
    console.log('✓ Seeded OpenRouter demo routes (Nemotron → Space Bunny)');
  }
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
// Danh mục demo: Vendors / Teams / Workers.
// `workers.team_id` trỏ tới `teams`, nên phải tạo tổ trước rồi mới tạo công nhân.
// Thứ tự trong mảng là thứ tự chạy.
const { VENDOR_SEED, TEAM_SEED, WORKER_SEED } = await import('./master-data-seed.js');
// `fillBlanks` lấp các ô còn TRỐNG của bản ghi đã có, không ghi đè giá trị người
// dùng sửa. Cần vì tương tác này đã xảy ra thật: lần chạy đầu chạy trước khi seed
// có trường `tax_id`, nên 5 dòng NCC được chèn với `tax_id = NULL`; các lần chạy
// sau thấy "đã tồn tại" nên bỏ qua, và MST vĩnh viễn trống.
//
// Không dùng cách xoá rồi chép lại: `vendors.id` được nhiều bảng khác tham chiếu.
const fillBlanks = async (table, id, values) => {
  const sets = [];
  const params = [];
  let n = 0;
  for (const [col, val] of Object.entries(values)) {
    if (val === null || val === undefined || val === '') continue;
    // COALESCE trong chính câu UPDATE: chỉ ghi khi cột hiện đang NULL/rỗng.
    // Dùng `$N` cho cả hai vì `db.prepare()` từ chối trộn `?` với `$N`.
    n += 1;
    sets.push(`${col} = COALESCE(NULLIF(${col}, ''), $${n})`);
    params.push(val);
  }
  if (!sets.length) return;
  params.push(id);
  await db.prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = $${params.length}`).runAsync(...params);
};

for (const v of VENDOR_SEED) {
  const found = await db.prepare('SELECT id FROM vendors WHERE tenant_id = ? AND code = ?').getAsync(tenantId, v.code);
  if (found) {
    await fillBlanks('vendors', found.id, { tax_id: v.tax_id, category: v.category, contact: v.contact, name: v.name });
    continue;
  }
  await db.prepare(
    'INSERT INTO vendors (tenant_id, code, name, tax_id, category, contact, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).runAsync(tenantId, v.code, v.name, v.tax_id, v.category, v.contact, 'ACTIVE');
}
for (const t of TEAM_SEED) {
  const found = await db.prepare('SELECT id FROM teams WHERE tenant_id = ? AND code = ?').getAsync(tenantId, t.code);
  if (found) { await fillBlanks('teams', found.id, { name: t.name }); continue; }
  await db.prepare('INSERT INTO teams (tenant_id, code, name, status) VALUES (?, ?, ?, ?)').runAsync(tenantId, t.code, t.name, 'ACTIVE');
}
// Đội trưởng: worker đầu tiên của mỗi tổ. `lead_worker_id` là khóa ngoại nên phải
// tạo hết worker trước rồi mới trỏ ngược.
for (const w of WORKER_SEED) {
  const exists = await db.prepare('SELECT id FROM workers WHERE tenant_id = ? AND code = ?').getAsync(tenantId, w.code);
  if (exists) continue;
  const team = await db.prepare('SELECT id FROM teams WHERE tenant_id = ? AND code = ?').getAsync(tenantId, w.team);
  await db.prepare(
    'INSERT INTO workers (tenant_id, code, full_name, role, team_id, status) VALUES (?, ?, ?, ?, ?, ?)',
  ).runAsync(tenantId, w.code, w.full_name, w.role, team?.id ?? null, 'ACTIVE');
}
for (const w of WORKER_SEED.filter((x) => x.team)) {
  const team = await db.prepare('SELECT id FROM teams WHERE tenant_id = ? AND code = ?').getAsync(tenantId, w.team);
  if (!team) continue;
  const alreadyLeads = await db.prepare('SELECT 1 FROM teams WHERE id = ? AND lead_worker_id IS NOT NULL').getAsync(team.id);
  if (alreadyLeads) continue;
  const first = await db.prepare('SELECT id FROM workers WHERE tenant_id = ? AND team_id = ? ORDER BY id LIMIT 1').getAsync(tenantId, team.id);
  if (first) await db.prepare('UPDATE teams SET lead_worker_id = ? WHERE id = ?').runAsync(first.id, team.id);
}
const masterCounts = await db.prepare(
  `SELECT (SELECT count(*) FROM vendors WHERE tenant_id = $1) AS vendors,
          (SELECT count(*) FROM teams WHERE tenant_id = $1) AS teams,
          (SELECT count(*) FROM workers WHERE tenant_id = $1) AS workers`,
).getAsync(tenantId);
console.log(`✓ Master data: ${masterCounts.vendors} vendors · ${masterCounts.teams} teams · ${masterCounts.workers} workers`);

// Explicit membership (Phase A, 2026-09-15): the old HBG-only backfill that made
// every user a member of every project in their tenant is GONE. Existing
// project_members rows are kept as seed data; new users/projects get membership
// only via POST /api/projects/:id/members (admin/CEO/PM) or the auto-member on
// project creation (wizard POST /api/projects). Least-privilege by default —
// the pilot-tenant guard test proves a fresh user sees nothing until added.
console.log('✓ Memberships are explicit (no auto backfill; existing rows kept)');

// One-time sequence resync: external imports with explicit ids can leave
// `<table>_id_seq` **behind** `MAX(id)`. Chỉ vậy thì `setval(MAX(id))` là đúng.
//
// **Nhưng `setval(MAX(id))` cũng cuộn sequence LÙI khi `MAX(id)` nhỏ hơn `last_value`**,
// và đó là mất an toàn dữ liệu thật, không chỉ là bẩn test. Đo 2026-09-29: chạy
// `init.js` khi bảng đang ở `MAX(id)=28` còn sequence ở 67 ⇒ sequence rơi về **28**,
// tức **39 id sẽ được cấp lại**. Mà `audit_log` **cố ý không có** khoá ngoại tới bảng
// nghiệp vụ (audit phải sống sót cùng resource) ⇒ dòng audit cũ vẫn trỏ tới những id đó.
// Hậu quả: "cho tôi xem chuyện gì đã xảy ra với hợp đồng 358" trở nên **mơ hồ** — dòng
// `CREATE` có thể nói về hợp đồng đã xoá từ lâu, hoặc về cái mới. Lịch sử kiểm toán
// mất khả năng truy vết.
//
// Nên: chỉ **đẩy lên**, không bao giờ cuộn lùi. Bảng rỗng thì **không đụng** sequence —
// sequence mới vốn đã cho id đầu tiên = 1, và `setval(…, 0|1, true)` sẽ làm id đầu
// tiên nhảy sang 2 (đúng cái lỗi mà comment cũ cảnh báo cho seeded tenant id=1).
const seqTables = await db.prepare(
  `SELECT t.tablename FROM pg_tables t
   JOIN information_schema.columns c ON c.table_name = t.tablename
     AND c.table_schema = 'public' AND c.column_name = 'id'
   WHERE t.schemaname = 'public'`
).allAsync();

// `audit_log.resource_type` dùng cả số ít lẫn số nhiều, và không phải lúc nào cũng
// trùng tên bảng: `vendors` <-> `vendor`/`vendors`, `ai_drafts` <-> `ai_draft`,
// `construction_schedule_items` <-> `construction_schedule_item`. Nên thử **cả hai**
// dạng. Dạng nào không khớp thì không sao — mốc `MAX(id)` của bảng vẫn giữ cho đúng.
const singular = (name) => (
  /ies$/.test(name) ? `${name.slice(0, -3)}y`
    : /(ss|sh|ch|x)es$/.test(name) ? name.slice(0, -2)
      : /s$/.test(name) ? name.slice(0, -1)
        : name
);
const literal = (v) => `'${String(v).replace(/'/g, "''")}'`;

let seqAdvanced = 0;
let seqLeftAlone = 0;
for (const { tablename } of seqTables) {
  try {
    // `HAVING` = bỏ qua bảng rỗng **mà lịch sử chưa từng thấy**. Bảng rỗng nhưng
    // `audit_log` đã trỏ tới id 1..3 thì vẫn phải nâng: nếu không, `nextval` sẽ cấp lại
    // id 2 và dòng `CREATE` cũ sẽ "trỏ đúng" vào dòng mới — đúng cái mơ hồ cần tránh.
    // Bảng rỗng hoàn toàn mới thì để nguyên sequence, vì `setval(…, 0|1, true)` sẽ làm
    // id đầu tiên nhảy sang 2 (đúng lỗi mà comment gốc cảnh báo cho tenant seed id=1).
    // `GREATEST(...)` với `is_called = true` => `nextval` trả `giá trị + 1`, nên luôn lớn
    // hơn **cả ba** mốc: `last_value`, `MAX(id)` của bảng, và mốc cao nhất mà `audit_log`
    // từng thấy. Mốc cuối chính là thứ chặn việc `nextval` cấp lại một id mà lịch sử
    // kiểm toán đã ghi tới — và `MAX(id)` không đủ, vì dòng đó đã bị xoá khỏi bảng.
    const r = await db.prepare(
      `SELECT setval(pg_get_serial_sequence('"${tablename}"', 'id'),
         GREATEST(
           (SELECT last_value FROM "${tablename}_id_seq"),
           (SELECT MAX(id) FROM "${tablename}"),
           (SELECT COALESCE(MAX(resource_id), 0) FROM audit_log
              WHERE resource_type IN (${[tablename, singular(tablename)].map(literal).join(', ')}))
         ), true) AS v
       FROM (SELECT 1) one
       HAVING (SELECT MAX(id) FROM "${tablename}") IS NOT NULL
           OR (SELECT COALESCE(MAX(resource_id), 0) FROM audit_log
                WHERE resource_type IN (${[tablename, singular(tablename)].map(literal).join(', ')})) > 0`
    ).getAsync();
    if (r?.v != null) seqAdvanced += 1; else seqLeftAlone += 1;
  } catch { /* no serial sequence on id (e.g. ledger PK) — ignore */ }
}
console.log(`✓ Sequences: ${seqAdvanced} advanced (không bao giờ cuộn lùi, có tính mốc audit_log), ${seqLeftAlone} bảng rỗng — giữ nguyên`);

await closeDb();
console.log(`\n✅ Database ready`);
