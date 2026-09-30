// Retention sweeper for operational logs.
//
// Only rows that cannot be needed after the fact are pruned. Business and
// compliance data is never touched here: audit_log, notifications, AI
// embeddings and every business table stay unless a PMO/CEO decision says
// otherwise (see docs/DATA_DECISIONS_REQUIRED.md).
//
// Defaults, all env-overridable (each floored at 1 day — see MIN_DAYS):
//   SESSION_RETENTION_DAYS   30   expired refresh + revoked-jti rows
//   AI_LOG_RETENTION_DAYS    90   ai_calls telemetry
//   AUDIT_RETENTION_DAYS     0    audit_log — 0 means KEEP (off by default,
//                                  deleting an audit trail is a policy call)
//   RETENTION_MIN_ROWS   10000   never prune a table smaller than this, so a
//                                demo/UAT database keeps its evidence
import { getDb } from '../db/index.js';

const days = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

// Minimum effective window. A configured 0 would mean `created_at < now()`,
// which matches rows written a millisecond ago — the sweeper would race live
// traffic. One day is the floor for every target.
const MIN_DAYS = 1;

const TARGETS = [
  {
    table: 'auth_refresh_tokens',
    where: 'expires_at < now() - make_interval(days => $1)',
    arg: () => Math.max(MIN_DAYS, days('SESSION_RETENTION_DAYS', 30)),
    describe: (n) => `phiên đã hết hạn > ${n} ngày`,
  },
  {
    table: 'auth_revoked_jti',
    where: 'expires_at < now() - make_interval(days => $1)',
    arg: () => Math.max(MIN_DAYS, days('SESSION_RETENTION_DAYS', 30) - 1),
    describe: (n) => `jti thu hồi quá hạn > ${n} ngày`,
  },
  {
    table: 'ai_calls',
    where: 'created_at < now() - make_interval(days => $1)',
    arg: () => Math.max(MIN_DAYS, days('AI_LOG_RETENTION_DAYS', 90)),
    describe: (n) => `log AI > ${n} ngày`,
  },
  {
    table: 'audit_log',
    where: 'created_at < now() - make_interval(days => $1)',
    arg: () => Math.max(MIN_DAYS, days('AUDIT_RETENTION_DAYS', 0)),
    enabled: () => days('AUDIT_RETENTION_DAYS', 0) > 0,
    describe: (n) => `audit log > ${n} ngày`,
  },
];

const MIN_ROWS = () => {
  const n = Number(process.env.RETENTION_MIN_ROWS);
  return Number.isFinite(n) && n >= 0 ? n : 10000;
};

// `tenantScoped`: bảng này có cột `tenant_id` hay không. Khai báo tường minh thay vì
// suy ra lúc gọi — `auth_refresh_tokens` và `auth_revoked_jti` là bảng phiên **toàn
// cục**, không có `tenant_id`, nên không thể lọc theo tenant và cũng không nên giả vờ
// lọc được. Đo được: `auth_refresh_tokens` → không có, `ai_calls` → có.
const TENANT_SCOPED = new Set(['ai_calls', 'audit_log']);

export function retentionPlan() {
  return TARGETS.filter((t) => !t.enabled || t.enabled()).map((t) => ({
    table: t.table,
    keepDays: t.arg(),
    describe: t.describe(t.arg()),
    enabled: true,
    tenantScoped: TENANT_SCOPED.has(t.table),
  }));
}

export async function runRetention() {
  const db = getDb();
  const floor = MIN_ROWS();
  const results = [];
  for (const target of TARGETS) {
    if (target.enabled && !target.enabled()) continue;
    const keep = target.arg();
    // getAsync() resolves to the row itself (or undefined), not { rows }.
    const counted = await db.prepare(`SELECT count(*)::int AS n FROM ${target.table}`).getAsync();
    const total = counted?.n ?? 0;
    if (total < floor) {
      results.push({ table: target.table, deleted: 0, total, skipped: `dưới ngưỡng ${floor} dòng (giữ nguyên cho demo/UAT)` });
      continue;
    }
    // One statement: DELETE inside a CTE so the count and the delete cannot
    // disagree, and the wrapper's auto-LIMIT stays out of the way.
    const gone = await db.prepare(
      `WITH deleted AS (DELETE FROM ${target.table} WHERE ${target.where} RETURNING 1)
       SELECT count(*)::int AS n FROM deleted`
    ).getAsync(keep);
    results.push({ table: target.table, deleted: gone?.n ?? 0, total, describe: target.describe(keep) });
  }
  return { ran_at: new Date().toISOString(), min_rows: floor, results };
}
