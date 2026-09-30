// Dashboard — portfolio KPI rollup

import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { permissionMiddleware } from '../lib/permission-middleware.js';
import { getDb } from '../db/index.js';
import { requireFeature, requireAnyFeature } from '../lib/entitlements.js';
import { checkProjectAccess } from '../lib/project-access.js';
import { getProjectHealth } from '../lib/health.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(permissionMiddleware);

// Roll-up đa dự án: cache ngắn theo tenant (10s). NFR cho phép KPI trễ nên
// cache trong-memory là hợp lệ; key gồm tenant, user, role nên PM/PMO không nhận dữ liệu của người khác.
// Evict thủ công không cần — TTL expiry + ?fresh=1 cho test/assert nội dung.
const _portfolioCache = new Map();
const PORTFOLIO_TTL_MS = 10_000;

async function visibleProjects(db, user) {
  const projects = await db.prepare(
    "SELECT * FROM projects WHERE tenant_id = ? AND status = 'ACTIVE' ORDER BY id",
  ).allAsync(user.tenant_id);
  const visible = [];
  for (const project of projects) {
    if (await checkProjectAccess(user, project.id)) visible.push(project);
  }
  return visible;
}

function healthRollup(rows) {
  const counts = { green: 0, yellow: 0, red: 0, unknown: 0 };
  for (const row of rows) {
    const level = row?.overall || 'unknown';
    if (counts[level] != null) counts[level] += 1;
    else counts.unknown += 1;
  }
  return { ...counts, total: rows.length };
}

// GET /api/dashboard — tổng hợp nhanh (portrait toàn tenant)
// Every count is tenant-scoped (joins projects where the table has no
// tenant_id). Unscoped counts leaked cross-tenant rows — fixed Phase A.
router.get('/', async (req, res) => {
  const db = getDb();
  const visible = await visibleProjects(db, req.user);
  const ids = visible.map((project) => project.id);
  const scope = 'project_id = ANY($1)';
  const [kpiActive, materialsPending, submittalsOverdue, sdPending, manpowerToday, issuesOpen, highIssues, healthRows] = await Promise.all([
    db.prepare(`SELECT COUNT(*) as c FROM kpi_targets WHERE ${scope} AND effective_to IS NULL`).getAsync(ids),
    db.prepare(`SELECT COUNT(*) as c FROM material_submittals WHERE ${scope} AND status NOT IN ('APPROVED', 'CLOSED')`).getAsync(ids),
    db.prepare(`SELECT COUNT(*) as c FROM material_submittals WHERE ${scope} AND status NOT IN ('APPROVED', 'CLOSED') AND (sla_deadline < CURRENT_DATE OR supervisor_deadline < CURRENT_DATE)`).getAsync(ids),
    db.prepare(`SELECT COUNT(*) as c FROM shop_drawings WHERE ${scope} AND status IN ('SUBMITTED', 'DRAFT')`).getAsync(ids),
    db.prepare(`SELECT COALESCE(SUM(dm.headcount), 0) as c FROM daily_manpower dm JOIN daily_reports dr ON dr.id = dm.daily_report_id WHERE dr.project_id = ANY($1) AND dr.report_date = CURRENT_DATE`).getAsync(ids),
    db.prepare(`SELECT COUNT(*) as c FROM issues WHERE ${scope} AND status NOT IN ('CLOSED', 'RESOLVED')`).getAsync(ids),
    db.prepare(`SELECT COUNT(*) as c FROM issues WHERE ${scope} AND severity = 'HIGH' AND status NOT IN ('CLOSED', 'RESOLVED')`).getAsync(ids),
    Promise.all(visible.map((project) => getProjectHealth(req.user.tenant_id, project.id))),
  ]);
  res.json({
    tenant_id: req.user.tenant_id,
    projects_active: visible.length,
    project_codes: visible.map((project) => project.code),
    kpi_active: kpiActive.c,
    materials_pending: materialsPending.c,
    submittals_overdue: submittalsOverdue.c,
    shop_drawings_pending: sdPending.c,
    manpower_today: manpowerToday.c,
    issues_open: issuesOpen.c,
    issues_high: highIssues.c,
    health_rollup: healthRollup(healthRows),
    timestamp: new Date().toISOString(),
  });
});

router.get('/portfolio-kpi', requireAnyFeature('portfolio-read', 'portfolio'), async (req, res) => {
  const db = getDb();
  const fresh = req.query.fresh === '1';
  const key = `t:${req.user.tenant_id}:u:${req.user.id}:r:${req.user.is_ceo ? 'ceo' : req.user.role}`;
  const now = Date.now();
  const hit = _portfolioCache.get(key);
  // NFR cho phép KPI trễ (tối thiểu 24h GĐ1) — cache 10s/tenant cắt toàn bộ
  // truy vấn lặp khi CEO/PMO mở roll-up đa dự án liên tục. ?fresh=1 bỏ qua
  // cache (cho test/assert nội dung). Key theo tenant nên không leak chéo.
  if (!fresh && hit && now - hit.at < PORTFOLIO_TTL_MS) {
    res.set('X-Cache', 'HIT');
    res.set('Cache-Control', 'private, max-age=10');
    return res.json(hit.data);
  }
  const projs = await visibleProjects(db, req.user);
  const ids = projs.map((p) => p.id);
  // Gộp N×12 query (N dự án) thành 6 query GROUP BY — shape trả về giữ nguyên
  // byte-for-byte so với bản N+1 (kể cả tên field materials.pending đếm trên
  // material_submittals — quirk cũ, giữ để UI khỏi đổi).
  const byId = (rows, key = 'project_id') => {
    const m = new Map();
    for (const r of rows) m.set(Number(r[key]), r);
    return m;
  };
  const num = (v) => Number(v) || 0;
  const [kpis, mats, subs, shops, men, iss] = await Promise.all([
    ids.length ? db.prepare(
      `SELECT project_id, COUNT(*) AS total,
              COUNT(*) FILTER (WHERE effective_to IS NULL AND kpi_code LIKE 'OTD%') AS on_time,
              COUNT(*) FILTER (WHERE effective_to IS NULL) AS eff_total
       FROM kpi_targets WHERE project_id = ANY($1) GROUP BY project_id`
    ).allAsync(ids) : [],
    ids.length ? db.prepare(
      `SELECT project_id, COUNT(*) AS total FROM materials
       WHERE project_id = ANY($1) GROUP BY project_id`
    ).allAsync(ids) : [],
    ids.length ? db.prepare(
      `SELECT project_id, COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status = 'SUBMITTED') AS pending,
              COUNT(*) FILTER (WHERE status NOT IN ('APPROVED', 'CLOSED')) AS active,
              COUNT(*) FILTER (WHERE status NOT IN ('APPROVED', 'CLOSED')
                AND (sla_deadline < CURRENT_DATE OR supervisor_deadline < CURRENT_DATE)) AS overdue
       FROM material_submittals WHERE project_id = ANY($1) GROUP BY project_id`
    ).allAsync(ids) : [],
    ids.length ? db.prepare(
      `SELECT project_id, COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status = 'APPROVED') AS approved
       FROM shop_drawings WHERE project_id = ANY($1) GROUP BY project_id`
    ).allAsync(ids) : [],
    ids.length ? db.prepare(
      `SELECT dr.project_id AS project_id, COALESCE(SUM(dm.headcount), 0) AS c
       FROM daily_manpower dm JOIN daily_reports dr ON dr.id = dm.daily_report_id
       WHERE dr.project_id = ANY($1) AND dr.report_date = CURRENT_DATE GROUP BY dr.project_id`
    ).allAsync(ids) : [],
    ids.length ? db.prepare(
      `SELECT project_id,
              COUNT(*) FILTER (WHERE status NOT IN ('CLOSED', 'RESOLVED')) AS open,
              COUNT(*) FILTER (WHERE severity = 'HIGH' AND status NOT IN ('CLOSED', 'RESOLVED')) AS high
       FROM issues WHERE project_id = ANY($1) GROUP BY project_id`
    ).allAsync(ids) : [],
  ]);
  const kpiM = byId(kpis), matM = byId(mats), subM = byId(subs),
        shopM = byId(shops), menM = byId(men), issM = byId(iss);
  const healthRows = await Promise.all(projs.map((project) =>
    getProjectHealth(req.user.tenant_id, project.id).catch(() => ({ overall: 'unknown' })),
  ));
  const healthById = new Map(projs.map((project, index) => [Number(project.id), healthRows[index]]));
  const out = projs.map((p) => {
    const k = kpiM.get(p.id) || {}, m = matM.get(p.id) || {}, s = subM.get(p.id) || {},
          d = shopM.get(p.id) || {}, w = menM.get(p.id) || {}, o = issM.get(p.id) || {};
    return {
      project: p,
      kpi: { on_time: num(k.on_time), total: num(k.eff_total) },
      materials: { total: num(m.total), pending: num(s.active), overdue: num(s.overdue) },
      submittals: { total: num(s.total), pending: num(s.pending) },
      shop_drawings: { total: num(d.total), approved: num(d.approved) },
      manpower_today: num(w.c),
      issues: { open: num(o.open), high: num(o.high) },
      health: healthById.get(Number(p.id)) || { overall: 'unknown' },
    };
  });
  _portfolioCache.set(key, { at: now, data: out });
  res.set('X-Cache', 'MISS');
  res.set('Cache-Control', 'private, max-age=10');
  res.json(out);
});

export default router;
