// Database abstraction — PostgreSQL ONLY.
// Unified async API:
//   await db.prepare('SELECT 1').getAsync()         -> first row or undefined
//   await db.prepare('SELECT * FROM x').allAsync()  -> rows[]
//   await db.prepare('INSERT ...').runAsync(...args) -> { lastInsertRowid, changes }
//   await db.exec(sql)                              -> run multi-statement SQL
//   await db.upsert(...)                            -> see below
//
// Helper: db.upsert(table, { conflictCols, setCols, row })
//   Auto-generates INSERT ... ON CONFLICT (cols) DO UPDATE SET ...
//   - table: PG table name
//   - conflictCols: array of column names for the conflict target (must have a unique index)
//   - setCols: optional array of column names to update on conflict. Default = all columns except conflictCols.
//   - row: object { col1: val1, col2: val2, ... } — only listed columns are inserted
//   - returns: { lastInsertRowid, changes }
//   - note: if a row already exists with the same conflictCols, all non-conflict columns are updated.
//
// Removed in PG-only refactor:
//   - Dual-driver code (SQLite)
//   - isPg()/isSqlite() helpers
//   - Sync API (throw at runtime if called)
import pg from 'pg';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const { Pool } = pg;

// NUMERIC(oid 1700) arrives as string by default ('16615877.00') — string +
// silently concatenates instead of adding (the 'NaN tỷ' Payment bug class).
// Parse at the driver so every consumer sees numbers. Values here are VND
// amounts well below 2^53; SQL-side SUMs stay exact decimal regardless.
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));

// DATABASE_URL wins when set; otherwise build from DB_* parts so
// docker-compose / production envs (DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME)
// work without extra wiring. Defaults match README local dev.
export function buildDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const user = process.env.DB_USER || 'pmo_user';
  const pass = process.env.DB_PASSWORD || 'pmo_dev_pwd';
  const host = process.env.DB_HOST || '127.0.0.1';
  const port = process.env.DB_PORT || '5433';
  const name = process.env.DB_NAME || 'pmo';
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${name}`;
}

const PG_URL = buildDatabaseUrl();
const __dirname = dirname(fileURLToPath(import.meta.url));

let _pgPool = null;

// Single pool for the whole backend — db.prepare(), db.exec(), db.upsert()
// and tx() all share it (previously tx.js held a second pool, doubling
// connections and breaking the "same pool" assumption).
function getPool() {
  if (!_pgPool) {
    _pgPool = new Pool({
      connectionString: PG_URL,
      max: Number(process.env.PG_POOL_MAX) || 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    // Unhandled 'error' on an idle client crashes node — log and continue.
    _pgPool.on('error', (err) => console.error('[pg pool]', err.message));
  }
  return _pgPool;
}

// Convert `?` placeholders to PG-style `$1, $2, ...`
// Nếu SQL đã có `$N` thì giữ nguyên (caller dùng client.query thẳng)
function convertSql(sql) {
  if (/\$\d+/.test(sql)) return sql;
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

class PgStatement {
  constructor(sql) {
    this.sql = convertSql(sql);
    this._isInsert = sql.trim().toUpperCase().startsWith('INSERT');
    this._needsReturningId = this._isInsert && !/RETURNING/i.test(sql);
  }
  async runAsync(...args) {
    const c = await getPool().connect();
    try {
      let sql = this.sql;
      // Tables without an `id` column (composite PKs) can't RETURNING id —
      // probe once per table per process instead of regex/SQL hacks at callsites.
      if (this._needsReturningId && (await tableHasId(c, sql))) sql += ' RETURNING id';
      const r = await c.query(sql, args);
      const lastInsertRowid = r.rows[0]?.id !== undefined ? Number(r.rows[0].id) : undefined;
      return { lastInsertRowid, changes: r.rowCount };
    } finally { c.release(); }
  }
  async getAsync(...args) {
    const c = await getPool().connect();
    try {
      // Skip LIMIT 1 if SQL already has LIMIT or RETURNING
      const sql = (/\bLIMIT\b/i.test(this.sql) || /\bRETURNING\b/i.test(this.sql))
        ? this.sql
        : this.sql + ' LIMIT 1';
      const r = await c.query(sql, args);
      return r.rows[0] || undefined;
    } finally { c.release(); }
  }
  async allAsync(...args) {
    const c = await getPool().connect();
    try {
      const r = await c.query(this.sql, args);
      return r.rows;
    } finally { c.release(); }
  }
  // Sync API throws — PG requires async
  run() { throw new Error('PG requires async: use await runAsync()'); }
  get() { throw new Error('PG requires async: use await getAsync()'); }
  all() { throw new Error('PG requires async: use await allAsync()'); }
}

// Which tables have an `id` column (for RETURNING id). Probed once per
// table per process; sequences are resynced at boot (init.js), so inserts
// stay a single round-trip with no per-INSERT setval magic.
const _idProbeCache = new Map();
async function tableHasId(client, sql) {
  const m = sql.match(/(?:INSERT\s+INTO)\s+"?(\w+)"?/i);
  if (!m) return false;
  const tbl = m[1];
  if (!_idProbeCache.has(tbl)) {
    const r = await client.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'id' LIMIT 1`,
      [tbl]
    );
    _idProbeCache.set(tbl, r.rowCount > 0);
  }
  return _idProbeCache.get(tbl);
}

class DbWrapper {
  prepare(sql) { return new PgStatement(sql); }
  async exec(sql) { await getPool().query(sql); }
  getPool() { return getPool(); }
}

let _db = null;
export function getDb() { if (!_db) _db = new DbWrapper(); return _db; }
export { getPool };
export async function closeDb() { if (_pgPool) { await _pgPool.end(); _pgPool = null; } }

// =====================================================================
// upsert(): unified INSERT ... ON CONFLICT helper. Replaces scattered
// INSERT OR REPLACE / ON CONFLICT literals throughout ingestors.
// =====================================================================
//
// Usage:
//   await db.upsert('subcontractors',
//     { conflictCols: ['tenant_id', 'name'],
//       setCols: ['capability_summary', 'status'] },
//     { tenant_id: 1, name: 'Acme', capability_summary: 'Welding', status: 'ACTIVE' }
//   );
//
//   await db.upsert('materials',
//     { conflictCols: ['project_id', 'zone_id', 'material_code'] },
//     { project_id: 1, zone_id: 2, material_code: 'M-001', name_vi: 'Ống', progress_pct: 0 }
//   );
//   // ↑ all non-conflict columns updated on conflict by default.
//
// The unique index on conflictCols must exist in PG (added via init.js or migration).
// =====================================================================
DbWrapper.prototype.upsert = async function(table, opts, row) {
  const conflictCols = opts.conflictCols;
  if (!Array.isArray(conflictCols) || conflictCols.length === 0) {
    throw new Error('upsert: conflictCols must be a non-empty array');
  }
  // Filter row to only columns that exist in `row` (caller may omit optional cols)
  const cols = Object.keys(row);
  if (cols.length === 0) throw new Error('upsert: row is empty');

  // Set cols = non-conflict cols (caller can override via opts.setCols)
  const setCols = opts.setCols
    ? opts.setCols.filter(c => cols.includes(c) && !conflictCols.includes(c))
    : cols.filter(c => !conflictCols.includes(c));

  const values = cols.map(c => row[c]);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');

  // ON CONFLICT DO NOTHING if no setCols (pure insert-or-skip)
  const conflictAction = setCols.length > 0
    ? `DO UPDATE SET ${setCols.map(c => `${c} = EXCLUDED.${c}`).join(', ')}`
    : 'DO NOTHING';

  const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})
               ON CONFLICT (${conflictCols.join(', ')}) ${conflictAction}`;
  const c = await getPool().connect();
  try {
    const r = await c.query(sql, values);
    // EXCLUDED.* with no UPDATE returns no row, so fallback to manual lookup for lastInsertRowid
    if (setCols.length > 0 && r.rows[0]?.id) {
      return { lastInsertRowid: Number(r.rows[0].id), changes: r.rowCount };
    }
    // For DO NOTHING or no RETURNING: lookup the row id
    const whereSql = `SELECT id FROM ${table} WHERE ${conflictCols.map((c, i) => `${c} = $${i + 1}`).join(' AND ')}`;
    const whereArgs = conflictCols.map(c => row[c]);
    const r2 = await c.query(whereSql, whereArgs);
    return { lastInsertRowid: r2.rows[0]?.id ? Number(r2.rows[0].id) : undefined, changes: r.rowCount };
  } finally { c.release(); }
};
