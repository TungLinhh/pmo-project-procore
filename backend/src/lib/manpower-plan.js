// Manpower plan helpers — SRS FR-1.3 (kế hoạch vs. thực tế theo tuần).
// week_start luôn chuẩn hóa về thứ Hai (giống date_trunc('week')) để plan
// khớp đúng bucket actual từ daily_manpower.
import { getDb } from '../db/index.js';
export function toMonday(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) return null;
  const d = new Date(String(dateStr) + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return null;
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  return new Date(d.getTime() - dow * 86400000).toISOString().slice(0, 10);
}

export function validatePlanRow(r) {
  if (!r || typeof r.role_name_vi !== 'string' || !r.role_name_vi.trim()) {
    return 'role_name_vi required';
  }
  const kind = r.kind == null || r.kind === '' ? 'labor' : String(r.kind);
  if (kind !== 'labor' && kind !== 'equipment') return "kind must be 'labor'|'equipment'";
  if (!toMonday(r.week_start)) return 'week_start must be YYYY-MM-DD';
  const h = Number(r.planned_headcount);
  if (!Number.isInteger(h) || h < 0 || h > 100000) return 'planned_headcount must be integer 0..100000';
  return null;
}

export function loadingPct(planned, actual) {
  if (!planned) return actual > 0 ? 100 : 0; // có người mà không có kế hoạch
  return Math.round((actual / planned) * 1000) / 10;
}

// Loading curve dùng chung cho GET /projects/:id/manpower-loading và
// GET /projects/:id/control-summary. Labor and equipment have separate curves;
// their units are never added together.
export async function getManpowerLoading(projectId, weeks = 8) {
  const db = getDb();
  const w = Math.min(Math.max(parseInt(weeks) || 8, 1), 26);
  const [plans, actuals] = await Promise.all([
    db.prepare(
      `SELECT kind, week_start, role_name_vi, planned_headcount FROM manpower_plans
       WHERE project_id = ? ORDER BY week_start`
    ).allAsync(projectId),
    db.prepare(
      `SELECT date_trunc('week', dr.report_date)::date AS week_start,
              COALESCE(dm.kind, 'labor') AS kind, dm.role_name_vi,
              COALESCE(SUM(dm.headcount), 0) AS actual
       FROM daily_manpower dm JOIN daily_reports dr ON dr.id = dm.daily_report_id
       WHERE dr.project_id = ? GROUP BY 1, 2, 3 ORDER BY 1`
    ).allAsync(projectId),
  ]);
  const norm = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
  const build = (kind) => {
    const byWeek = new Map();
    const ensure = (key) => {
      if (!byWeek.has(key)) byWeek.set(key, { week_start: key, planned: 0, actual: 0, roles: {} });
      return byWeek.get(key);
    };
    for (const p of plans.filter((row) => (row.kind || 'labor') === kind)) {
      const entry = ensure(norm(p.week_start));
      entry.planned += Number(p.planned_headcount) || 0;
      entry.roles[p.role_name_vi] = { ...(entry.roles[p.role_name_vi] || { actual: 0 }), planned: Number(p.planned_headcount) || 0 };
    }
    for (const a of actuals.filter((row) => (row.kind || 'labor') === kind)) {
      const entry = ensure(norm(a.week_start));
      entry.actual += Number(a.actual) || 0;
      const role = a.role_name_vi || '—';
      entry.roles[role] = { planned: entry.roles[role]?.planned || 0, actual: Number(a.actual) || 0 };
    }
    const rows = [...byWeek.values()].sort((x, y) => (x.week_start < y.week_start ? -1 : 1)).slice(-w)
      .map((entry) => ({ ...entry, pct: loadingPct(entry.planned, entry.actual) }));
    const planned = rows.reduce((sum, entry) => sum + entry.planned, 0);
    const actual = rows.reduce((sum, entry) => sum + entry.actual, 0);
    return { weeks: rows, total: { planned, actual, pct: loadingPct(planned, actual) } };
  };
  const labor = build('labor');
  const equipment = build('equipment');
  return {
    project_id: Number(projectId),
    weeks: labor.weeks,
    total: labor.total,
    equipment_weeks: equipment.weeks,
    equipment_total: equipment.total,
  };
}
