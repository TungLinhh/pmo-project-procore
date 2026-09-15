// Migrate data from SQLite (backend/data/pmo.db) → PostgreSQL
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './src/db/schema-pg.js';

const sqlite = new Database('/home/vutun/pmo_project/backend/data/pmo.db', { readonly: true });
const pool = new Pool({ connectionString: 'postgresql://pmo_user:pmo_dev_pwd@localhost:5432/pmo' });
const pg = drizzle(pool, { schema });

// Map SQLite table name → PG table name (when they differ)
const TABLE_MAP = {
  'business_process_steps': 'business_process_steps',  // parent = business_processes (synthesized)
  'daily_safety_observations': 'daily_safety',
  'rfa_log_entries': 'rfa_log',
  'payment_milestones': 'payments',  // TODO: mục 43.5
};

async function copyTable(tableName, sqliteRows, transform) {
  const pgTable = TABLE_MAP[tableName] || tableName;
  if (sqliteRows.length === 0) {
    console.log(`  ${tableName} → ${pgTable}: 0 rows (skip)`);
    return 0;
  }
  const cols = Object.keys(sqliteRows[0]);
  // Filter out cols that don't exist in PG
  const pgCols = await getPgColumns(pgTable);
  const validCols = cols.filter(c => pgCols.includes(c));
  if (validCols.length === 0) {
    console.log(`  ${tableName} → ${pgTable}: no matching columns, skip`);
    return 0;
  }
  const colList = validCols.map(c => `"${c}"`).join(', ');
  const placeholders = validCols.map((_, i) => `$${i+1}`).join(', ');

  // Default value transforms
  const transforms = {
    subcontractors: (col, v) => {
      if (col === 'status') {
        // Map Vietnamese status → enum
        if (['ĐƠN VỊ THẦU PHỤ', 'ĐƠN VỊ TỔ ĐỘI'].includes(v)) return 'ACTIVE';
        if (v === 'INACTIVE') return 'INACTIVE';
        return 'ACTIVE';  // default
      }
      return v;
    },
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let inserted = 0;
    for (const row of sqliteRows) {
      const values = validCols.map(c => {
        let v = row[c];
        if (transforms[pgTable]) v = transforms[pgTable](c, v);
        else if (transform) v = transform(c, v);
        if (v === undefined) return null;
        return v;
      });
      try {
        await client.query(`INSERT INTO "${pgTable}" (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`, values);
        inserted++;
      } catch (e) {
        // Skip errors (FK, duplicate, etc.)
      }
    }
    await client.query('COMMIT');
    console.log(`  ${tableName} → ${pgTable}: ${inserted}/${sqliteRows.length} inserted`);
    return inserted;
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(`  ${tableName} → ${pgTable}: FAILED - ${e.message}`);
    return 0;
  } finally {
    client.release();
  }
}

const _colCache = new Map();
async function getPgColumns(tableName) {
  if (_colCache.has(tableName)) return _colCache.get(tableName);
  const r = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`, [tableName]);
  const cols = r.rows.map(row => row.column_name);
  _colCache.set(tableName, cols);
  return cols;
}

const TABLES = [
  'tenants', 'users', 'projects', 'zones',
  'daily_reports', 'daily_work_items', 'daily_manpower', 'daily_materials', 'daily_acceptance', 'daily_recommendations',
  'shop_drawings', 'construction_schedule_items', 'materials',
  'rfa_log_entries',
  'subcontractors', 'suppliers',
  'file_uploads', 'generic_sheets',
];

async function main() {
  // 1) Insert tenants first
  const tenantRows = sqlite.prepare('SELECT * FROM tenants').all();
  await copyTable('tenants', tenantRows);

  // 2) Synthesize parent business_processes after tenants exist
  const bpSteps = sqlite.prepare('SELECT DISTINCT process_code FROM business_process_steps').all();
  const processCodeToId = new Map();
  if (bpSteps.length > 0) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const row of bpSteps) {
        if (!row.process_code) continue;
        const r = await client.query(
          'INSERT INTO business_processes (tenant_id, code) VALUES ($1, $2) ON CONFLICT (tenant_id, code) DO UPDATE SET code = EXCLUDED.code RETURNING id',
          [1, row.process_code]
        );
        if (r.rows[0]) processCodeToId.set(row.process_code, r.rows[0].id);
      }
      await client.query('COMMIT');
      console.log(`  business_processes (synthesized): ${bpSteps.length} from distinct process_code`);
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('  business_processes synth FAILED:', e.message);
    } finally {
      client.release();
    }
  }

  // 3) Continue with other tables
  for (const table of TABLES) {
    if (table === 'tenants') continue;  // already done
    const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
    await copyTable(table, rows);
  }

  // 4) Copy business_process_steps now that parent exists; transform process_code → process_id
  const bpStepRows = sqlite.prepare('SELECT * FROM business_process_steps').all();
  const transformed = bpStepRows.map(r => ({
    ...r,
    process_id: processCodeToId.get(r.process_code) || null,
  }));
  // Drop the SQLite-specific process_code column
  const cleaned = transformed.map(({ process_code, ...rest }) => rest);
  await copyTable('business_process_steps', cleaned);

  // 5) Copy rfa_log_entries
  const rfaRows = sqlite.prepare('SELECT * FROM rfa_log_entries').all();
  await copyTable('rfa_log_entries', rfaRows);

  sqlite.close();
  await pool.end();
  console.log('\n✅ Migration complete');
}

main().catch(console.error);
