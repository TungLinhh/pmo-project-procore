// Migration runner with ledger — each drizzle/*.sql applies exactly once.
// Ledger table: schema_migrations(filename PK, checksum, applied_at).
//   - already applied + same checksum → skip
//   - already applied + different checksum → THROW (schema drift, fail loud)
//   - not applied → apply + record (apply failure is never recorded)
// New migration files are picked up automatically; explicit ordering only
// where FKs demand it (9999 issues before 9998 directives; tenant RLS 9999b/c
// AFTER every table exists — policies on missing tables fail fresh inits;
// 9999d schedule_links likewise needs construction_schedule_items + helpers;
// 9999e scenarios needs schedule_links + the same).
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function orderedMigrationFiles(files) {
  const rank = (f) => (f === '9999_add_issues_table.sql' ? 1 : f === '9998_align_schema_with_routes.sql' ? 2 : f === '9999b_tenant_rls.sql' ? 3 : f === '9999c_fix_rls_hatch.sql' ? 4 : f === '9999d_schedule_links.sql' ? 5 : f === '9999e_schedule_scenarios.sql' ? 6 : f === '9999f_site_holidays.sql' ? 7 : f === '9999g_ai_foundation.sql' ? 8 : f === '9999h_app_role.sql' ? 9 : f === '9999i_password_flag.sql' ? 10 : f === '9999j_erp_push.sql' ? 11 : f === '9999k_nested_departments.sql' ? 12 : f === '9999l_erp_connectors.sql' ? 13 : f === '9999m_erp_nullable.sql' ? 14 : 0);
  return [...files].sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
}

export function checksumOf(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export async function runMigrations(db, drizzleDir) {
  // pgvector (v0.7.0 AI layer) must exist before any migration referencing the
  // `vector` type. Installing an UNTRUSTED extension needs a superuser, so this
  // only ever succeeds for superusers (compose bootstrap, DBA shells) or on
  // databases inheriting template1 (which carries vector since the v0.7.0
  // provisioning). Everyone else gets a loud remediation error — never a
  // half-vector schema. Note: superusers BYPASS RLS even under FORCE, so the
  // app role must stay NON-superuser or all tenant isolation silently dies.
  try {
    await db.exec(`CREATE EXTENSION IF NOT EXISTS vector`);
    await db.exec(`CREATE EXTENSION IF NOT EXISTS pg_trgm`); // ERP vendor matching (trusted)
  } catch (e) {
    const has = await db.prepare(`SELECT 1 FROM pg_extension WHERE extname = 'vector'`).getAsync().catch(() => null);
    if (!has) {
      throw new Error(
        `pgvector extension missing and cannot install (needs superuser): install the pgvector package, then as a superuser run CREATE EXTENSION vector on this database (or into template1 for fresh DBs). Original: ${e.message}`
      );
    }
  }
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ DEFAULT now() NOT NULL
  )`);
  const applied = new Map(
    (await db.prepare('SELECT filename, checksum FROM schema_migrations').allAsync())
      .map((r) => [r.filename, r.checksum])
  );
  const files = orderedMigrationFiles(readdirSync(drizzleDir).filter((f) => f.endsWith('.sql')));
  // Adoption: pre-ledger databases already have the schema but no ledger rows.
  // Record current files as applied WITHOUT re-running them (re-running would
  // crash on plain CREATE TABLE). From here on, checksums guard every boot.
  if (applied.size === 0) {
    const hasSchema = await db.prepare(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tenants')`
    ).getAsync();
    if (hasSchema?.exists) {
      for (const f of files) {
        const sql = readFileSync(join(drizzleDir, f), 'utf8');
        await db.prepare('INSERT INTO schema_migrations (filename, checksum) VALUES (?, ?) RETURNING filename').runAsync(f, checksumOf(sql));
      }
      console.log(`  Adopted ${files.length} pre-ledger migration(s) into the ledger`);
      return { ran: 0, skipped: files.length, total: files.length };
    }
  }
  let ran = 0, skipped = 0;
  for (const f of files) {
    const sql = readFileSync(join(drizzleDir, f), 'utf8');
    // SQL has no // comments — a stray one fails at apply time with a cryptic
    // error. Fail here instead, naming the file and line (3 strikes in v0.9.0).
    const badLine = sql.split('\n').findIndex((l) => /^\s*\/\//.test(l));
    if (badLine >= 0) {
      throw new Error(`Bad SQL comment in ${f}:${badLine + 1} — use -- not //`);
    }
    const sum = checksumOf(sql);
    if (applied.has(f)) {
      if (applied.get(f) !== sum) {
        throw new Error(`Schema drift: ${f} changed since it was applied (checksum mismatch). Refusing to boot.`);
      }
      skipped++;
      continue;
    }
    await db.exec(sql); // throws on failure → not recorded, init aborts
    await db.prepare('INSERT INTO schema_migrations (filename, checksum) VALUES (?, ?) RETURNING filename').runAsync(f, sum);
    console.log(`  Applied ${f}`);
    ran++;
  }
  return { ran, skipped, total: files.length };
}
