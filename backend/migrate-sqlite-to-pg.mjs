// One-shot migration: copy rows from data/pmo.db (SQLite) to PG @ 127.0.0.1:5433.
// Run: DB_DRIVER=postgres DATABASE_URL=... node migrate-sqlite-to-pg.mjs
import Database from 'better-sqlite3';
import { getDb, closeDb, isPg } from './src/db/index.js';

if (!isPg()) {
  console.error('ERROR: set DB_DRIVER=postgres before running this script');
  process.exit(1);
}

const sqliteDb = new Database('/home/vutun/pmo_project/backend/data/pmo.db', { readonly: true });
const pgDb = getDb();

// Table mapping: SQLite name -> PG name (only when they differ)
const TABLE_MAP = {
  'daily_safety_observations': 'daily_safety',  // SQLite legacy name -> PG
  'payment_milestones': 'payment_requests',     // legacy SQLite table for payment tracking
};

const TABLES = [
  'tenants', 'users', 'projects', 'zones', 'business_processes', 'business_process_steps',
  'subcontractors', 'suppliers',
  'daily_reports', 'daily_work_items', 'daily_materials', 'daily_manpower', 'daily_acceptance',
  'daily_recommendations', 'daily_safety_observations', 'daily_safety', 'daily_infos',
  'shop_drawings', 'construction_schedule_items', 'schedule_baselines',
  'materials', 'material_submittals', 'rfa_log',
  'generic_sheets', 'file_uploads',
  'audit_log', 'notifications', 'payment_milestones',
];

let totalInserted = 0;
for (const table of TABLES) {
  const sqliteName = table;
  const pgName = TABLE_MAP[table] || table;

  const sqliteHas = sqliteDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(sqliteName);
  if (!sqliteHas) { console.log(`  - ${sqliteName}: skip (not in SQLite)`); continue; }

  const rows = sqliteDb.prepare(`SELECT * FROM ${sqliteName}`).all();
  if (rows.length === 0) { console.log(`  - ${sqliteName} -> ${pgName}: 0 rows`); continue; }

  // Get columns from SQLite row, drop columns not in PG
  const sqliteCols = Object.keys(rows[0]);
  // Try a SELECT to discover PG columns
  let pgCols;
  try {
    const sample = await pgDb.prepare(`SELECT * FROM ${pgName} LIMIT 0`).allAsync();
    pgCols = Object.keys(sample[0] || {});
    if (pgCols.length === 0) {
      // No rows yet — use INSERT ... RETURNING to discover
      // Fallback: we'll just try inserting and catch errors
      pgCols = sqliteCols; // optimistic
    }
  } catch (e) {
    console.log(`  - ${sqliteName} -> ${pgName}: skip (${e.message.slice(0, 60)})`);
    continue;
  }
  const colsToInsert = sqliteCols.filter(c => pgCols.includes(c));
  if (colsToInsert.length === 0) {
    console.log(`  - ${sqliteName} -> ${pgName}: no common columns`);
    continue;
  }

  const placeholders = colsToInsert.map(() => '?').join(',');
  const insertSql = `INSERT INTO ${pgName} (${colsToInsert.join(',')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
  const stmt = pgDb.prepare(insertSql);

  let inserted = 0;
  for (const row of rows) {
    const values = colsToInsert.map(c => row[c] === undefined ? null : row[c]);
    try {
      await stmt.runAsync(...values);
      inserted++;
    } catch (e) {
      // Skip FK or type errors silently
    }
  }
  console.log(`  ✓ ${sqliteName} -> ${pgName}: ${inserted}/${rows.length} rows`);
  totalInserted += inserted;
}

console.log(`\nTotal inserted: ${totalInserted}`);
sqliteDb.close();
await closeDb();
