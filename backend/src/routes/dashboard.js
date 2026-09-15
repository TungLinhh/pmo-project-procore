// Dashboard — portfolio KPI rollup

import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { permissionMiddleware } from '../lib/permission-middleware.js';
import { getDb } from '../db/index.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(permissionMiddleware);

// GET /api/dashboard — tổng hợp nhanh (portrait toàn tenant)
router.get('/', async (req, res) => {
  const db = getDb();
  const tenantId = req.user.tenant_id || 1;
  const [projects, kpiActive, materialsPending, submittalsOverdue, sdPending, manpowerToday, issuesOpen, highIssues] = await Promise.all([
    db.prepare("SELECT COUNT(*) as c FROM projects WHERE tenant_id = $1 AND status = 'ACTIVE'").getAsync(tenantId),
    db.prepare("SELECT COUNT(*) as c FROM kpi_targets WHERE effective_to IS NULL").getAsync(),
    db.prepare("SELECT COUNT(*) as c FROM material_submittals WHERE status NOT IN ('APPROVED', 'CLOSED')").getAsync(),
    db.prepare("SELECT COUNT(*) as c FROM material_submittals WHERE status NOT IN ('APPROVED', 'CLOSED') AND (sla_deadline < CURRENT_DATE OR supervisor_deadline < CURRENT_DATE)").getAsync(),
    db.prepare("SELECT COUNT(*) as c FROM shop_drawings WHERE status IN ('SUBMITTED', 'DRAFT')").getAsync(),
    db.prepare("SELECT COALESCE(SUM(dm.headcount), 0) as c FROM daily_manpower dm JOIN daily_reports dr ON dr.id = dm.daily_report_id WHERE dr.report_date = CURRENT_DATE").getAsync(),
    db.prepare("SELECT COUNT(*) as c FROM issues WHERE status NOT IN ('CLOSED', 'RESOLVED')").getAsync(),
    db.prepare("SELECT COUNT(*) as c FROM issues WHERE severity = 'HIGH' AND status NOT IN ('CLOSED', 'RESOLVED')").getAsync(),
  ]);
  res.json({
    tenant_id: tenantId,
    projects_active: projects.c,
    kpi_active: kpiActive.c,
    materials_pending: materialsPending.c,
    submittals_overdue: submittalsOverdue.c,
    shop_drawings_pending: sdPending.c,
    manpower_today: manpowerToday.c,
    issues_open: issuesOpen.c,
    issues_high: highIssues.c,
    timestamp: new Date().toISOString(),
  });
});

router.get('/portfolio-kpi', async (req, res) => {
  const db = getDb();
  const projs = await db.prepare("SELECT * FROM projects WHERE tenant_id = ? AND status = 'ACTIVE' ORDER BY id").allAsync(req.user.tenant_id);
  const out = [];
  for (const p of projs) {
    const [kpiOnTime, kpiTotal, materialsTotal, materialsPending, materialsOverdue, submittalsTotal, submittalsPending, sdTotal, sdApproved, manpowerToday, issuesOpen, issuesHigh] = await Promise.all([
      db.prepare(`SELECT COUNT(*) as c FROM kpi_targets WHERE project_id = ? AND effective_to IS NULL AND kpi_code LIKE 'OTD%'`).getAsync(p.id),
      db.prepare(`SELECT COUNT(*) as c FROM kpi_targets WHERE project_id = ? AND effective_to IS NULL`).getAsync(p.id),
      db.prepare(`SELECT COUNT(*) as c FROM materials WHERE project_id = ?`).getAsync(p.id),
      db.prepare(`SELECT COUNT(*) as c FROM material_submittals WHERE project_id = ? AND status NOT IN ('APPROVED', 'CLOSED')`).getAsync(p.id),
      db.prepare(`SELECT COUNT(*) as c FROM material_submittals WHERE project_id = ? AND status NOT IN ('APPROVED', 'CLOSED') AND (sla_deadline < CURRENT_DATE OR supervisor_deadline < CURRENT_DATE)`).getAsync(p.id),
      db.prepare(`SELECT COUNT(*) as c FROM material_submittals WHERE project_id = ?`).getAsync(p.id),
      db.prepare(`SELECT COUNT(*) as c FROM material_submittals WHERE project_id = ? AND status = 'SUBMITTED'`).getAsync(p.id),
      db.prepare(`SELECT COUNT(*) as c FROM shop_drawings WHERE project_id = ?`).getAsync(p.id),
      db.prepare(`SELECT COUNT(*) as c FROM shop_drawings WHERE project_id = ? AND status = 'APPROVED'`).getAsync(p.id),
      db.prepare(`SELECT COALESCE(SUM(dm.headcount), 0) as c FROM daily_manpower dm JOIN daily_reports dr ON dr.id = dm.daily_report_id WHERE dr.project_id = ? AND dr.report_date = CURRENT_DATE`).getAsync(p.id),
      db.prepare(`SELECT COUNT(*) as c FROM issues WHERE project_id = ? AND status NOT IN ('CLOSED', 'RESOLVED')`).getAsync(p.id),
      db.prepare(`SELECT COUNT(*) as c FROM issues WHERE project_id = ? AND severity = 'HIGH' AND status NOT IN ('CLOSED', 'RESOLVED')`).getAsync(p.id),
    ]);
    out.push({
      project: p,
      kpi: { on_time: kpiOnTime.c, total: kpiTotal.c },
      materials: { total: materialsTotal.c, pending: materialsPending.c, overdue: materialsOverdue.c },
      submittals: { total: submittalsTotal.c, pending: submittalsPending.c },
      shop_drawings: { total: sdTotal.c, approved: sdApproved.c },
      manpower_today: manpowerToday.c,
      issues: { open: issuesOpen.c, high: issuesHigh.c },
    });
  }
  res.json(out);
});

export default router;
