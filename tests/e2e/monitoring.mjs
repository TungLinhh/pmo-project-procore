// Monitoring surface: a probe that cannot fail is worse than no probe.
//
// /api/health used to return a hardcoded `{status:'ok'}` without touching the
// database, so a dead database still looked healthy. /api/ready now really
// queries. /api/jobs/retention exposes the prune plan to admins and refuses to
// delete the audit trail by default.
import { api, loginAs, auth, ok, summary } from './lib.mjs';

try {
  // 1. Liveness: cheap, no DB, says how long the process has been up.
  const h = await api('/api/health');
  ok(h.status === 200 && h.data?.status === 'ok', `GET /api/health ok (${h.status})`);
  ok(typeof h.data?.uptime_s === 'number', `health báo uptime (${h.data?.uptime_s}s)`);

  // 2. Readiness: really queries the DB and reports latency.
  const r = await api('/api/ready');
  ok(r.status === 200, `GET /api/ready ok (${r.status})`);
  ok(r.data?.db?.ok === true, `ready xác nhận DB sống (${JSON.stringify(r.data?.db)})`);
  ok(typeof r.data?.db?.latency_ms === 'number' && r.data.db.latency_ms < 2000,
    `ready đo độ trễ DB (${r.data?.db?.latency_ms}ms)`);
  ok(['ok', 'degraded'].includes(r.data?.status), `trạng thái ready hợp lệ (${r.data?.status})`);

  // 3. Retention plan: admin only, and audit_log is not in it by default.
  const admin = await loginAs('admin@hbg.com');
  const plan = await api('/api/jobs/retention', { headers: auth(admin) });
  ok(plan.status === 200, `admin xem được kế hoạch retention (${plan.status})`);
  const tables = (plan.data?.plan || []).map((p) => p.table);
  ok(tables.includes('auth_refresh_tokens') && tables.includes('ai_calls'),
    `kế hoạch gồm phiên + log AI (${tables.join(', ')})`);
  ok(!tables.includes('audit_log'), 'audit_log KHÔNG nằm trong kế hoạch mặc định');
  ok(plan.data?.counts && typeof plan.data.counts.auth_refresh_tokens === 'number',
    'kế hoạch kèm số dòng hiện tại');

  // 4. The prune endpoints are admin-gated, not public.
  const anon = await api('/api/jobs/retention');
  ok(anon.status === 401, `không đăng nhập thì bị chặn (${anon.status})`);
  const anonRun = await api('/api/jobs/retention/run', { method: 'POST' });
  ok(anonRun.status === 401, `không đăng nhập thì không chạy được dọn dẹp (${anonRun.status})`);
  const site = await loginAs('site@hbg.com');
  const siteRun = await api('/api/jobs/retention/run', { method: 'POST', headers: auth(site) });
  ok(siteRun.status === 403, `user thường không chạy được dọn dẹp (${siteRun.status})`);

  // 5. Dry reality check: running it must not touch audit_log.
  const run = await api('/api/jobs/retention/run', { method: 'POST', headers: auth(admin) });
  ok(run.status === 200 && Array.isArray(run.data?.results), `chạy dọn dẹp trả báo cáo (${run.status})`);
  const auditTouched = (run.data?.results || []).find((r) => r.table === 'audit_log' && r.deleted > 0);
  ok(!auditTouched, 'lần chạy thật không xoá dòng audit nào');
  ok(!(run.data?.results || []).some((r) => r.table === 'audit_log'),
    'báo cáo dọn dẹp không hề nhắc tới audit_log');
} catch (e) {
  ok(false, e.message);
} finally {
  summary();
}
