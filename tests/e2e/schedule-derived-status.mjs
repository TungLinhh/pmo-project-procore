// Schedule derived status: status comes from progress_pct/actual_end_date, never from
// the raw source "Tình trạng" text (which mapped stray 'x'/'1' marks to DONE — 160 bogus rows on BTE).
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/schedule-derived-status.mjs
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const XLSX = (await import('xlsx')).default;
const { parse, commit } = await import('../../backend/src/services/ingest/construction_schedule.js');
const { getDb, closeDb } = await import('../../backend/src/db/index.js');

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };

// synthetic CSP-shape file: header band + tricky status marks
const FP = '/tmp/sched-status-test.xlsx';
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
  ['STT', 'Công việc', '% hoàn thành', 'Tình trạng'],
  [1, 'Alpha', 1, 'x'],        // full + stray mark → DONE (raw kept in source_status)
  [2, 'Beta', 0.4, 'x'],       // half + stray mark → IN_PROGRESS (the BTE killer case)
  [3, 'Gamma', null, ''],      // zero + blank → PENDING
  [4, 'Delta', 1, ''],         // full + blank → DONE
  [5, 'Epsilon', 0, 'yes'],    // zero + 'yes' must NOT force DONE → PENDING
  [null, 'BOH', null, ''],     // zone-title label row → skipped
]), 'TD');
XLSX.writeFile(wb, FP);

const parsed = await parse(FP, 1, 'T1');
const rows = parsed.sheets[0]?.rows || [];
const byName = Object.fromEntries(rows.map(r => [r.name_vi, r]));
ok(rows.length === 5, `zone-title row skipped (got ${rows.length} rows)`);
ok(byName.Alpha?.status === 'DONE' && byName.Alpha?.source_status === 'x', `Alpha DONE, raw kept (got ${byName.Alpha?.status}/${byName.Alpha?.source_status})`);
ok(byName.Beta?.status === 'IN_PROGRESS', `Beta IN_PROGRESS despite 'x' (got ${byName.Beta?.status})`);
ok(byName.Gamma?.status === 'PENDING', `Gamma PENDING (got ${byName.Gamma?.status})`);
ok(byName.Delta?.status === 'DONE', `Delta DONE (got ${byName.Delta?.status})`);
ok(byName.Epsilon?.status === 'PENDING', `'yes' with 0% stays PENDING (got ${byName.Epsilon?.status})`);

// commit: derived status persisted; actual_end_date forces DONE even at 0%
const db = getDb();
const proj = await db.prepare(`INSERT INTO projects (tenant_id, code, name_vi) VALUES (1, 'SCHED-ST-${Date.now()}', 'x') RETURNING id`).getAsync();
const rep = await commit({ zone: { code: 'T1', name: 't1' }, sheets: [{ sheet: 'TD', rows: [
  ...rows,
  { ordinal: 7, name_vi: 'Zeta', progress_pct: 0, status: 'PENDING', source_status: null, actual_end_date: '2026-01-01', plan_start_date: null, actual_start_date: null, plan_end_date: null, plan_duration_days: null, level_roman: null, level_arabic: 7, sublevel: null, name_en: null },
] }] }, proj.id, 'T1');
ok(rep.ok === 6, `commit ok=6 (got ${rep.ok})`);
const saved = await db.prepare(`SELECT name_vi, status, source_status FROM construction_schedule_items WHERE project_id = ? ORDER BY ordinal`).allAsync(proj.id);
const sByName = Object.fromEntries(saved.map(r => [r.name_vi, r]));
ok(sByName.Beta?.status === 'IN_PROGRESS' && sByName.Alpha?.status === 'DONE', 'derived statuses persisted');
ok(sByName.Alpha?.source_status === 'x', 'source_status persisted');
ok(sByName.Zeta?.status === 'DONE', 'actual_end_date forces DONE at 0%');
// note: commit() trusts caller-provided status; derivation lives in parseRow (single place).

// cleanup
await db.prepare('DELETE FROM construction_schedule_items WHERE project_id = ?').runAsync(proj.id);
await db.prepare('DELETE FROM zones WHERE project_id = ?').runAsync(proj.id);
await db.prepare('DELETE FROM projects WHERE id = ?').runAsync(proj.id);
await closeDb();

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
