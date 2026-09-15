// Migration runner with ledger — each drizzle/*.sql applies exactly once.
// Ledger table: schema_migrations(filename PK, checksum, applied_at).
//   - already applied + same checksum → skip
//   - already applied + different checksum → THROW (schema drift, fail loud)
//   - not applied → apply + record (apply failure is never recorded)
// New migration files are picked up automatically; explicit ordering only
// where FKs demand it (9999 issues before 9998 directives).
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function orderedMigrationFiles(files) {
  const rank = (f) => (f === '9999_add_issues_table.sql' ? 1 : f === '9998_align_schema_with_routes.sql' ? 2 : 0);
  return [...files].sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
}

export function checksumOf(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export async function runMigrations(db, drizzleDir) {
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
