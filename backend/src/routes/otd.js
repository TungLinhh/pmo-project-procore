// OTD (On-Time Delivery) calculation endpoint
// Decision 2026-09-05: OTD threshold = bám sát kế hoạch (plan_end_date ≤ actual_end_date ≤ plan_end_date + grace_days)
// Returns: { otd_pct, total_items, on_time, late, by_zone, trend }
// Mount: /api/projects/:id/otd

import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { permissionMiddleware } from '../lib/permission-middleware.js';
import { getDb } from '../db/index.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(permissionMiddleware);

// GET OTD for a project
// Query params:
//   - grace_days: cho phép trễ tối đa (default 0 = bám sát tuyệt đối)
//   - from, to: date range (default: từ đầu tháng đến hôm nay)
router.get('/', async (req, res) => {
  const db = getDb();
  const graceDays = parseInt(req.query.grace_days) || 0;
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  const from = req.query.from || (() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  })();

  // OTD = số work item hoàn thành ON-TIME / tổng số work item có planned
  //  - on-time: actual_end_date IS NOT NULL AND actual_end_date <= plan_end_date + grace_days
  //  - on-time: actual_end_date IS NULL AND CURRENT_DATE <= plan_end_date + grace_days (vẫn trong hạn)
  const total = await db.prepare(`
    SELECT COUNT(*) as c FROM construction_schedule_items
    WHERE project_id = $1 AND plan_end_date IS NOT NULL
      AND plan_end_date BETWEEN $2 AND $3
  `).getAsync(req.params.id, from, to);

  const onTime = await db.prepare(`
    SELECT COUNT(*) as c FROM construction_schedule_items
    WHERE project_id = $1 AND plan_end_date IS NOT NULL
      AND plan_end_date BETWEEN $2 AND $3
      AND (
        (actual_end_date IS NOT NULL AND actual_end_date <= plan_end_date + ($4 || ' days')::INTERVAL)
        OR (actual_end_date IS NULL AND CURRENT_DATE <= plan_end_date + ($4 || ' days')::INTERVAL)
      )
  `).getAsync(req.params.id, from, to, String(graceDays));

  const late = await db.prepare(`
    SELECT COUNT(*) as c FROM construction_schedule_items
    WHERE project_id = $1 AND plan_end_date IS NOT NULL
      AND plan_end_date BETWEEN $2 AND $3
      AND (actual_end_date IS NOT NULL AND actual_end_date > plan_end_date + ($4 || ' days')::INTERVAL)
  `).getAsync(req.params.id, from, to, String(graceDays));

  // By zone breakdown
  const byZone = await db.prepare(`
    SELECT zone_id, z.code AS zone_code,
      COUNT(*) as total,
      SUM(CASE WHEN (actual_end_date IS NOT NULL AND actual_end_date <= plan_end_date + ($4 || ' days')::INTERVAL)
                OR (actual_end_date IS NULL AND CURRENT_DATE <= plan_end_date + ($4 || ' days')::INTERVAL)
              THEN 1 ELSE 0 END) as on_time
    FROM construction_schedule_items csi
    LEFT JOIN zones z ON z.id = csi.zone_id
    WHERE csi.project_id = $1 AND csi.plan_end_date IS NOT NULL
      AND csi.plan_end_date BETWEEN $2 AND $3
    GROUP BY zone_id, z.code
    ORDER BY z.code
  `).allAsync(req.params.id, from, to, String(graceDays));

  // Trend (last 6 months, monthly)
  const trend = await db.prepare(`
    SELECT date_trunc('month', plan_end_date) as month,
      COUNT(*) as total,
      SUM(CASE WHEN (actual_end_date IS NOT NULL AND actual_end_date <= plan_end_date + ($2 || ' days')::INTERVAL)
                OR (actual_end_date IS NULL AND CURRENT_DATE <= plan_end_date + ($2 || ' days')::INTERVAL)
              THEN 1 ELSE 0 END) as on_time
    FROM construction_schedule_items
    WHERE project_id = $1 AND plan_end_date IS NOT NULL
      AND plan_end_date >= CURRENT_DATE - INTERVAL '6 months'
    GROUP BY 1
    ORDER BY 1
  `).allAsync(req.params.id, String(graceDays));

  const totalC = Number(total.c);
  const onTimeC = Number(onTime.c);
  const lateC = Number(late.c);
  const otdPct = totalC > 0 ? Math.round((onTimeC / totalC) * 1000) / 10 : 0;

  res.json({
    project_id: Number(req.params.id),
    from, to, grace_days: graceDays,
    otd_pct: otdPct,
    total: totalC,
    on_time: onTimeC,
    late: lateC,
    by_zone: byZone.map(z => ({
      zone_id: z.zone_id,
      zone_code: z.zone_code,
      total: Number(z.total),
      on_time: Number(z.on_time),
      otd_pct: Number(z.total) > 0 ? Math.round((Number(z.on_time) / Number(z.total)) * 1000) / 10 : 0,
    })),
    trend: trend.map(t => ({
      month: t.month,
      total: Number(t.total),
      on_time: Number(t.on_time),
      otd_pct: Number(t.total) > 0 ? Math.round((Number(t.on_time) / Number(t.total)) * 1000) / 10 : 0,
    })),
  });
});

export default router;
