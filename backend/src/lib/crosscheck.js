// TĐ TỔNG cross-check: rollup % (master files) vs ingested zone-detail aggregates.
// Rollups are RECOMPUTED, never committed — this module only READS a staged
// rollup workbook and compares it against DB aggregates, reporting deltas so
// reviewers can see whether zone-detail ingestion lines up with the site
// team's own totals before trusting the dashboard.
import { matchZoneCode } from './zone_matcher.js';
import { norm } from './classify.js';
import { readSheet } from './excel.js';

// Rows of the TĐ TỔNG sheet shaped {zone, pct, rowIndex}: first cell in the
// row that maps to a zone code + first 0..1.5 number in the following cols.
export async function readRollupPercents(filePath, sheetHint = 'TĐ TỔNG') {
  const XLSX = (await import('xlsx')).default;
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const sheetName = wb.SheetNames.find(n => norm(n).includes(norm(sheetHint))) || wb.SheetNames.find(n => !/^(foxz|sheet\d*)$/i.test(n.trim()));
  if (!sheetName) return { sheet: null, rows: [] };
  const rows = readSheet(filePath, sheetName);
  const out = [];
  const seen = new Set();
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const zone = matchZoneCode(row[c]);
      if (!zone || seen.has(zone)) continue;
      for (let k = c + 1; k < Math.min(c + 6, row.length); k++) {
        const v = row[k];
        if (typeof v === 'number' && v >= 0 && v <= 1.5) {
          out.push({ zone, pct: Math.round(v * 1000) / 10, rowIndex: r + 1 });
          seen.add(zone);
          break;
        }
      }
    }
  }
  return { sheet: sheetName, rows: out };
}

export async function crossCheckProject(db, projectId, kind = 'shop') {
  const table = kind === 'schedule' ? 'construction_schedule_items' : 'shop_drawings';
  const agg = await db.prepare(`
    SELECT z.code AS zone, AVG(t.progress_pct)::float AS db_pct, COUNT(*)::int AS n
    FROM ${table} t JOIN zones z ON z.id = t.zone_id
    WHERE t.project_id = $1 AND t.progress_pct IS NOT NULL
    GROUP BY z.code
  `).allAsync(projectId);
  return agg;
}

// Merge rollup rows + db aggregates. Tolerance in percentage points.
export function compareRollup(rollupRows, dbAgg, tolerance = 20) {
  const dbByZone = Object.fromEntries(dbAgg.map(r => [r.zone, r]));
  const out = [];
  for (const rr of rollupRows) {
    const db = dbByZone[rr.zone];
    const delta = db ? Math.round(Math.abs(db.db_pct * 100 - rr.pct) * 10) / 10 : null;
    out.push({
      zone: rr.zone, rollup_pct: rr.pct,
      db_pct: db ? Math.round(db.db_pct * 1000) / 10 : null,
      db_rows: db?.n ?? 0, delta, ok: delta == null ? null : delta <= tolerance,
    });
  }
  for (const r of dbAgg) {
    if (!rollupRows.some(x => x.zone === r.zone)) {
      out.push({ zone: r.zone, rollup_pct: null, db_pct: Math.round(r.db_pct * 1000) / 10, db_rows: r.n, delta: null, ok: null });
    }
  }
  return out;
}
