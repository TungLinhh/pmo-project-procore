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
import dotenv from 'dotenv';
import { applyTenantGuc, resetTenantGuc } from '../lib/tenant.js';

// Scripts such as reconciliation are launched from the repository root, while
// the documented local env file lives at backend/.env. Load it before the
// first Pool URL is built; shell variables still win because dotenv does not
// override existing values.
//
// Never do this in production: an image that shipped a baked backend/.env
// (the .dockerignore gap) would silently connect to a developer's database when
// the real DB env is missing. Production must supply the database explicitly.
// Bỏ qua `backend/.env` khi **cả hai** nhóm biến đã được cấp tường minh: nhóm owner
// (migrate/seed) và nhóm app role (request pool).
//
// Trước đây chỉ kiểm nhóm owner. Hậu quả đo được 2026-09-28: đặt `DATABASE_URL` (mà mọi
// lệnh trong hướng dẫn đều dùng) làm `hasDatabaseEnv` thành true ⇒ **`backend/.env` bị
// bỏ qua** ⇒ `APP_DB_USER` không được nạp ⇒ request pool chạy bằng owner, tức mất RLS,
// dù `.env` đã cấu hình `pmo_app`. Hai biến này **không xung đột** nhau (khác vai trò),
// nên sự có mặt của `DATABASE_URL` không có lý do gì để bỏ qua cấu hình app role.
const hasDatabaseEnv = ['DATABASE_URL', 'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']
  .some((key) => process.env[key] != null && process.env[key] !== '');
const hasAppRoleEnv = ['APP_DATABASE_URL', 'APP_DB_USER', 'APP_DB_PASSWORD']
  .some((key) => process.env[key] != null && process.env[key] !== '');
if ((!hasDatabaseEnv || !hasAppRoleEnv) && process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });
}
if (process.env.NODE_ENV === 'production' && !hasDatabaseEnv) {
  console.error('[db] NODE_ENV=production without DATABASE_URL/DB_* — refusing to guess a database connection');
}

const { Pool } = pg;

// NUMERIC(oid 1700) arrives as string by default ('16615877.00') — string +
// silently concatenates instead of adding (the 'NaN tỷ' Payment bug class).
// Parse at the driver so every consumer sees numbers. Values here are VND
// amounts well below 2^53; SQL-side SUMs stay exact decimal regardless.
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));

// DATABASE_URL wins when set; otherwise build from DB_* parts so
// docker-compose / production envs (DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME)
// work without extra wiring. Defaults match README local dev.
// NOTE: this is the OWNER url (migrations/seeds/init). Request traffic uses
// buildAppDatabaseUrl() below — least privilege.
export function buildDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const user = process.env.DB_USER || 'pmo_user';
  const pass = process.env.DB_PASSWORD || 'pmo_dev_pwd';
  const host = process.env.DB_HOST || '127.0.0.1';
  const port = process.env.DB_PORT || '5433';
  const name = process.env.DB_NAME || 'pmo';
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${name}`;
}

// APP pool url (Wave 2 A1): least-privilege pmo_app by default.
//
// Thứ tự ưu tiên — phải khớp với comment ở `lib/production-readiness.js:57`:
//   1. `APP_DATABASE_URL`  — chỉ định đầy đủ, thắng tất cả.
//   2. `APP_DB_USER` (+ `APP_DB_PASSWORD`) — **đây là cách cấu hình app role mà
//      tài liệu chỉ định**, host/port/db lấy từ `DATABASE_URL` nếu có.
//   3. URL owner — chỉ khi (1) và (2) đều không có.
//
// Bản cũ kiểm tra `DATABASE_URL` ở bước 2, nên `APP_DB_USER` **không bao giờ được tới**
// khi `DATABASE_URL` có mặt — mà `DATABASE_URL` thì gần như luôn có vì migrate/seed
// cần nó. Hậu quả đo được 2026-09-28: đặt `APP_DB_USER=pmo_app` xong, pool request vẫn
// chạy bằng owner (`db-role.mjs`: "pool user is pmo_app (got pmo_user)"), tức mất RLS,
// trong khi `production-readiness` vẫn báo `app_db_user` OK vì nó đọc biến môi trường
// chứ không đọc URL thật.
//
// Escape hatch (rollback = một biến): `APP_DB_USER=pmo_user`, hoặc bỏ trống cả (2).
export function buildAppDatabaseUrl() {
  if (process.env.APP_DATABASE_URL) return process.env.APP_DATABASE_URL;

  const user = process.env.APP_DB_USER || '';
  const pass = process.env.APP_DB_PASSWORD
    || (user === 'pmo_app' ? 'pmo_app_dev_pwd' : user ? 'pmo_dev_pwd' : '');

  // Host/port/db: ưu tiên `DATABASE_URL` (nguồn thật của môi trường) rồi tới `DB_*`.
  let host = process.env.DB_HOST || '127.0.0.1';
  let port = process.env.DB_PORT || '5433';
  let name = process.env.DB_NAME || 'pmo';
  if (process.env.DATABASE_URL) {
    try {
      const owner = new URL(process.env.DATABASE_URL);
      if (owner.hostname) host = owner.hostname;
      if (owner.port) port = owner.port;
      const dbName = decodeURIComponent(owner.pathname.replace(/^\//, ''));
      if (dbName) name = dbName;
    } catch { /* URL hỏng: rơi xuống DB_* / mặc định, không ném */ }
  }

  if (user) {
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${name}`;
  }
  // Không có `APP_DB_USER` nào: dùng owner URL **chỉ khi** `DATABASE_URL` được đặt
  // tường minh (môi trường thật sẽ cấu hình `APP_DB_USER`; thiếu thì readiness fail
  // `app_db_user` — fail-closed thay vì đoán).
  // Còn **dev tĩnh** (không biến nào) thì mặc định `pmo_app` như trước: local không có
  // `DATABASE_URL` nên rơi vào nhánh này, và trả owner sẽ làm mất RLS ở chính nơi dễ
  // phát hiện nhất. Đây là hành vi bản cũ, giữ nguyên.
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  return `postgresql://pmo_app:pmo_app_dev_pwd@${host}:${port}/${name}`;
}

const PG_URL = buildDatabaseUrl();
const APP_PG_URL = buildAppDatabaseUrl();
const __dirname = dirname(fileURLToPath(import.meta.url));

let _pgPool = null;
let _ownerPool = null;

function makePool(url) {
  const pool = new Pool({
    connectionString: url,
    max: Number(process.env.PG_POOL_MAX) || 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  // Unhandled 'error' on an idle client crashes node — log and continue.
  pool.on('error', (err) => console.error('[pg pool]', err.message));
  return pool;
}

// App pool for ALL request traffic (pmo_app by default).
// Single pool for the whole backend — db.prepare(), db.exec(), db.upsert()
// and tx() all share it (previously tx.js held a second pool, doubling
// connections and breaking the "same pool" assumption).
function getPool() {
  if (!_pgPool) _pgPool = makePool(APP_PG_URL);
  return _pgPool;
}

// Owner pool: migrations/seeds/init ONLY (DDL needs the owner; the app role
// must never gain it). Separate pool, same wrapper API via getOwnerDb().
function getOwnerPool() {
  if (!_ownerPool) _ownerPool = makePool(PG_URL);
  return _ownerPool;
}

// Convert `?` placeholders to PG-style `$1, $2, ...`
// Nếu SQL đã có `$N` thì giữ nguyên (caller dùng client.query thẳng)
export function convertSql(sql) {
  const hasQuestion = /\?/.test(sql);
  const hasDollar = /\$\d+/.test(sql);
  if (hasQuestion && hasDollar) {
    throw new Error('Mixed SQL placeholders (?, $N) are ambiguous; use one style');
  }
  if (hasDollar) return sql;
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// `getAsync()` means exactly one row. Keep PostgreSQL's clause order valid:
// LIMIT belongs before a row-locking clause, and a trailing semicolon must go
// before appending anything.
export function singleRowSql(rawSql) {
  const sql = String(rawSql).trim().replace(/;+\s*$/, '');
  if (/\bLIMIT\b/i.test(sql) || /\bRETURNING\b/i.test(sql)) return sql;
  const lock = /\bFOR\s+(?:NO\s+KEY\s+UPDATE|UPDATE|SHARE|KEY\s+SHARE)\b/i;
  return lock.test(sql)
    ? sql.replace(lock, 'LIMIT 1 $&')
    : `${sql} LIMIT 1`;
}

class PgStatement {
  constructor(sql, poolFn = getPool) {
    this.sql = convertSql(sql);
    this._isInsert = sql.trim().toUpperCase().startsWith('INSERT');
    this._needsReturningId = this._isInsert && !/RETURNING/i.test(sql);
    this._poolFn = poolFn;
  }
  // Every checkout applies the request tenant GUC (RLS, see lib/tenant.js) and
  // RESETs it on release — pooled connections must never leak a tenant.
  // No tenant in context (migrations/seeds/login) → no SET → hatch allows.
  async _withTenantClient(fn) {
    const c = await this._poolFn().connect();
    let applied = false;
    try {
      applied = await applyTenantGuc(c);
      return await fn(c);
    } finally {
      if (applied) await resetTenantGuc(c);
      c.release();
    }
  }
  async runAsync(...args) {
    return this._withTenantClient(async (c) => {
      let sql = this.sql;
      // Tables without an `id` column (composite PKs) can't RETURNING id —
      // probe once per table per process instead of regex/SQL hacks at callsites.
      if (this._needsReturningId && (await tableHasId(c, sql))) sql += ' RETURNING id';
      const r = await c.query(sql, args);
      const lastInsertRowid = r.rows[0]?.id !== undefined ? Number(r.rows[0].id) : undefined;
      return { lastInsertRowid, changes: r.rowCount };
    });
  }
  async getAsync(...args) {
    return this._withTenantClient(async (c) => {
      const r = await c.query(singleRowSql(this.sql), args);
      return r.rows[0] || undefined;
    });
  }
  async allAsync(...args) {
    return this._withTenantClient(async (c) => {
      const r = await c.query(this.sql, args);
      return r.rows;
    });
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
  constructor(poolFn = getPool) { this._poolFn = poolFn; }
  prepare(sql) { return new PgStatement(sql, this._poolFn); }
  async exec(sql) { await this._poolFn().query(sql); }
  getPool() { return this._poolFn(); }
  // Ngoài transaction thì `try/catch` là đủ (mỗi câu lệnh tự có transaction riêng),
  // nên đây chỉ gọi thẳng `fn`. Bản trong `withClientTx` mới cần savepoint thật — xem
  // `scoped.savepoint` và lý do ở đó.
  savepoint(fn) { return fn(); }
}

let _db = null;
let _ownerDb = null;
export function getDb() { if (!_db) _db = new DbWrapper(); return _db; }
// Owner wrapper: migrations/seeds/init ONLY. Same API, owner pool.
export function getOwnerDb() { if (!_ownerDb) _ownerDb = new DbWrapper(getOwnerPool); return _ownerDb; }
export { getPool, getOwnerPool };

// =====================================================================
// withClientTx(): run a block of db.upsert/db.prepare calls inside ONE
// transaction on ONE connection.
//
// Why this exists: the ingestors do a destructive DELETE-then-INSERT. Each
// db.prepare/db.upsert call takes its own pooled connection, so a mid-way
// failure left the parent row with zero or partial children while the old data
// was already deleted. This facade keeps the same call shape but pins every
// statement to the transaction's client, so a sheet commits or rolls back whole.
// =====================================================================
export async function withClientTx(fn) {
  const c = await getPool().connect();
  let appliedGuc = false;
  try {
    appliedGuc = await applyTenantGuc(c);
    await c.query('BEGIN');
    const bind = (sql) => {
      // `?` placeholders are positional and may appear inside string literals,
      // so count them in order exactly like the DbWrapper does.
      let index = 0;
      return String(sql).replace(/\?/g, () => `$${++index}`);
    };
    const convert = (args) => args.map((value) => {
      // `undefined` phải ra NULL, **giống hệt** đường pool (dòng dưới) — nơi driver
      // `pg` tự đổi. Bản này từng ném, tức cùng một câu lệnh chạy được ngoài
      // transaction thì hỏng **bên trong** transaction:
      //
      //   `db.prepare('INSERT … VALUES (?)').runAsync(row.someOptionalField)` — dùng
      //   `undefined` cho cột tuỳ chọn. Ngoài tx: ghi NULL, chạy. Trong tx: ném
      //   `undefined SQL parameter`, cả hàng bị bỏ.
      //
      // Đo được 2026-09-28: `ingest/daily_report.js:177` truyền
      // `item.system_type` / `item.progress_pct` / `item.start_date` / `item.finish_date`
      // / `item.lost_days` — sheet báo cáo ngày thực tế không có cột nào trong số đó,
      // nên **mọi** hạng mục bị bỏ và `work_items_count` ghi 0 trong khi
      // `manpower_count` ghi 1. `p1-real-numbers.mjs` bắt được.
      //
      // Cột KHÔNG có trong câu lệnh vẫn bị chặn ở tầng Postgres, nên không mất an toàn.
      if (value === undefined) return null;
      if (value === null || value instanceof Date || typeof value !== 'object') return value;
      return JSON.stringify(value);
    });
    // `savepoint` cho phép bắt lỗi **từng dòng** bên trong transaction.
    //
    // Vì sao cần: trong Postgres, một câu lệnh hỏng sẽ **hỏng cả transaction** — mọi
    // câu sau đó đều trả `current transaction is aborted`. Nên `try/catch` quanh từng
    // dòng là vô dụng: dòng lỗi đầu tiên giết luôn phần còn lại. Đo được 2026-09-28 ở
    // `ingest/daily_report.js`: một sheet có **một** dòng hỏng ⇒ `status: FAILED`,
    // `error: "current transaction is aborted, commands ignored until end of transaction
    // block"`, `failures` không có ⇒ toàn bộ dòng hợp lệ của sheet cũng mất, và thông
    // điệp không chỉ ra dòng nào sai — đúng thứ `p2-04-ingest-failures.mjs` sinh ra để
    // chặn.
    let _sp = 0;
    const scoped = {
      // `fn` chạy trong một savepoint: thành công thì `RELEASE`, lỗi thì `ROLLBACK TO`
      // rồi **ném lại** cho caller tự ghi vào báo cáo lỗi.
      savepoint: async (fn) => {
        const name = `sp_${++_sp}`;
        await c.query(`SAVEPOINT ${name}`);
        try {
          const out = await fn();
          await c.query(`RELEASE SAVEPOINT ${name}`);
          return out;
        } catch (e) {
          await c.query(`ROLLBACK TO SAVEPOINT ${name}`).catch(() => {});
          throw e;
        }
      },
      prepare(sql) {
        const text = bind(sql);
        return {
          runAsync: (...args) => c.query(text, convert(args))
            .then((r) => ({ lastInsertRowid: r.rows[0]?.id ?? undefined, changes: r.rowCount })),
          getAsync: (...args) => c.query(text, convert(args)).then((r) => r.rows[0] ?? null),
          allAsync: (...args) => c.query(text, convert(args)).then((r) => r.rows),
        };
      },
      async upsert(table, opts, row) {
        const conflictCols = opts.conflictCols;
        if (!Array.isArray(conflictCols) || conflictCols.length === 0) {
          throw new Error('upsert: conflictCols must be a non-empty array');
        }
        const cols = Object.keys(row);
        if (cols.length === 0) throw new Error('upsert: row is empty');
        const setCols = opts.setCols
          ? opts.setCols.filter((col) => cols.includes(col) && !conflictCols.includes(col))
          : cols.filter((col) => !conflictCols.includes(col));
        const values = cols.map((col) => {
          const value = row[col];
          if (value === undefined) throw new Error(`upsert: undefined value for ${col}`);
          if (value === null || value instanceof Date || typeof value !== 'object') return value;
          return JSON.stringify(value);
        });
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
        const conflictAction = setCols.length > 0
          ? `DO UPDATE SET ${setCols.map((col) => `${col} = EXCLUDED.${col}`).join(', ')}`
          : 'DO NOTHING';
        const baseSql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})
                     ON CONFLICT (${conflictCols.join(', ')}) ${conflictAction}`;
        const hasId = await tableHasId(c, baseSql);
        const r = await c.query(hasId ? `${baseSql} RETURNING id` : baseSql, values);
        if (!hasId) return { lastInsertRowid: undefined, changes: r.rowCount };
        if (r.rows[0]?.id != null) return { lastInsertRowid: Number(r.rows[0].id), changes: r.rowCount };
        const whereSql = `SELECT id FROM ${table} WHERE ${conflictCols.map((col, i) => `${col} = $${i + 1}`).join(' AND ')}`;
        const r2 = await c.query(whereSql, conflictCols.map((col) => row[col]));
        return { lastInsertRowid: r2.rows[0]?.id != null ? Number(r2.rows[0].id) : undefined, changes: r.rowCount };
      },
    };
    const result = await fn(scoped);
    await c.query('COMMIT');
    return result;
  } catch (err) {
    try { await c.query('ROLLBACK'); } catch {}
    throw err;
  } finally {
    if (appliedGuc) { try { await resetTenantGuc(c); } catch {} }
    c.release();
  }
}
export async function closeDb() {
  if (_pgPool) { await _pgPool.end(); _pgPool = null; }
  if (_ownerPool) { await _ownerPool.end(); _ownerPool = null; }
}

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

  const baseSql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})
               ON CONFLICT (${conflictCols.join(', ')}) ${conflictAction}`;
  const c = await this._poolFn().connect();
  let appliedGuc = false;
  try {
    appliedGuc = await applyTenantGuc(c);
    const hasId = await tableHasId(c, baseSql);
    const r = await c.query(hasId ? `${baseSql} RETURNING id` : baseSql, values);
    if (!hasId) return { lastInsertRowid: undefined, changes: r.rowCount };
    if (r.rows[0]?.id != null) {
      return { lastInsertRowid: Number(r.rows[0].id), changes: r.rowCount };
    }
    // DO NOTHING on a conflict returns no row. Only this branch needs a lookup;
    // inserts and updates get their id from the same statement above.
    const whereSql = `SELECT id FROM ${table} WHERE ${conflictCols.map((c, i) => `${c} = $${i + 1}`).join(' AND ')}`;
    const whereArgs = conflictCols.map(c => row[c]);
    const r2 = await c.query(whereSql, whereArgs);
    return { lastInsertRowid: r2.rows[0]?.id != null ? Number(r2.rows[0].id) : undefined, changes: r.rowCount };
  } finally {
    if (appliedGuc) { try { await c.query('RESET app.current_tenant'); } catch {} }
    c.release();
  }
};
