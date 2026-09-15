// CPM engine unit tests (v0.6.0 Phase 1). Pure lib, no server, no DB.
// Run: node tests/e2e/cpm.mjs
import { computeCpm, topoSort, findCycle, resolveDurationDays, dateDiffDays, rowDurationDays, compressSchedule, mapToCalendar, normalizeGaps, isSuspended, addWorkingDays, detectSummaryRows } from '../../backend/src/lib/cpm.js';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const I = (id, d) => ({ id, duration_days: d });

// 1. Linear A(3)→B(2)→C(4): duration 9, all critical.
{
  const r = computeCpm([I('A', 3), I('B', 2), I('C', 4)], [
    { predecessor_id: 'A', successor_id: 'B', link_type: 'FS', lag_days: 0 },
    { predecessor_id: 'B', successor_id: 'C', link_type: 'FS', lag_days: 0 },
  ]);
  ok(r.projectDuration === 9, `linear duration 9 (got ${r.projectDuration})`);
  ok(JSON.stringify(r.critical) === JSON.stringify(['A', 'B', 'C']), `all critical (got ${r.critical})`);
  ok(r.es.B === 3 && r.ef.C === 9, `early dates propagate (es.B=${r.es.B}, ef.C=${r.ef.C})`);
}

// 2. Parallel: A(2)→D, B(5)→D, D(1): duration 6, critical B,D; float A=3.
{
  const r = computeCpm([I('A', 2), I('B', 5), I('D', 1)], [
    { predecessor_id: 'A', successor_id: 'D', link_type: 'FS', lag_days: 0 },
    { predecessor_id: 'B', successor_id: 'D', link_type: 'FS', lag_days: 0 },
  ]);
  ok(r.projectDuration === 6, `parallel duration 6 (got ${r.projectDuration})`);
  ok(r.float.A === 3 && r.float.B === 0 && r.float.D === 0, `floats A=3,B=0,D=0 (got A=${r.float.A},B=${r.float.B},D=${r.float.D})`);
  ok(JSON.stringify(r.critical) === JSON.stringify(['B', 'D']), `critical B,D (got ${r.critical})`);
}

// 3. Lag: A(2)→B(3) FS lag 2: duration 7, ES(B)=4.
{
  const r = computeCpm([I('A', 2), I('B', 3)], [
    { predecessor_id: 'A', successor_id: 'B', link_type: 'FS', lag_days: 2 },
  ]);
  ok(r.projectDuration === 7 && r.es.B === 4, `lag honored (dur=${r.projectDuration}, es.B=${r.es.B})`);
}

// 4. SS: A(4), B(2), SS A→B lag 1: ES(B)=1, duration 4, A critical, float B=1.
{
  const r = computeCpm([I('A', 4), I('B', 2)], [
    { predecessor_id: 'A', successor_id: 'B', link_type: 'SS', lag_days: 1 },
  ]);
  ok(r.projectDuration === 4 && r.es.B === 1, `SS start (dur=${r.projectDuration}, es.B=${r.es.B})`);
  ok(r.float.A === 0 && r.float.B === 1, `SS floats A=0,B=1 (got A=${r.float.A},B=${r.float.B})`);
}

// 5. FF: A(3), B(5), FF A→B: duration 5, B critical, float A=2.
{
  const r = computeCpm([I('A', 3), I('B', 5)], [
    { predecessor_id: 'A', successor_id: 'B', link_type: 'FF', lag_days: 0 },
  ]);
  ok(r.projectDuration === 5, `FF duration 5 (got ${r.projectDuration})`);
  ok(r.float.B === 0 && r.float.A === 2, `FF floats A=2,B=0 (got A=${r.float.A},B=${r.float.B})`);
}

// 6. Mixed: A(2)→B(3) FS, A→C(4) SS, B→D(1) FS, C→D FF: duration 6.
{
  const r = computeCpm([I('A', 2), I('B', 3), I('C', 4), I('D', 1)], [
    { predecessor_id: 'A', successor_id: 'B', link_type: 'FS', lag_days: 0 },
    { predecessor_id: 'A', successor_id: 'C', link_type: 'SS', lag_days: 0 },
    { predecessor_id: 'B', successor_id: 'D', link_type: 'FS', lag_days: 0 },
    { predecessor_id: 'C', successor_id: 'D', link_type: 'FF', lag_days: 0 },
  ]);
  // forward: esA=0 efA=2; esB=2 efB=5; esC=0 efC=4; esD=max(efB=5, efC−durD=3)=5 efD=6.
  ok(r.projectDuration === 6, `mixed duration 6 (got ${r.projectDuration})`);
  ok(r.es.D === 5 && r.ef.D === 6, `mixed D dates (es=${r.es.D}, ef=${r.ef.D})`);
  ok(r.critical.includes('A') && r.critical.includes('B') && r.critical.includes('D'), `critical A,B,D (got ${r.critical})`);
}

// 7. Cycle throws with path.
{
  let err = null;
  try {
    computeCpm([I('A', 1), I('B', 1)], [
      { predecessor_id: 'A', successor_id: 'B', link_type: 'FS', lag_days: 0 },
      { predecessor_id: 'B', successor_id: 'A', link_type: 'FS', lag_days: 0 },
    ]);
  } catch (e) { err = e.message; }
  ok(!!err && err.includes('A → B → A'), `cycle throws with path (got ${err})`);
}

// 8. Helpers: duration resolution + date math.
{
  ok(resolveDurationDays({ duration_days: 5 }) === 5, 'explicit duration wins');
  ok(resolveDurationDays({}) === 1, 'missing duration → 1-day floor');
  ok(resolveDurationDays({ duration_days: 0 }) === 0, 'zero-duration milestone allowed');
  ok(dateDiffDays('2026-09-01', '2026-09-06') === 5, 'date diff 5');
  ok(dateDiffDays(null, '2026-09-06') === null, 'null-safe diff');
  ok(rowDurationDays({ plan_duration_days: 7 }) === 7, 'row explicit days');
  ok(rowDurationDays({ plan_start_date: '2026-09-01', plan_end_date: '2026-09-04' }) === 3, 'row date-derived');
  ok(rowDurationDays({}) === 1, 'row floor');
}

// 9. Empty + single node.
{
  const r0 = computeCpm([], []);
  ok(r0.projectDuration === 0 && r0.critical.length === 0, 'empty graph');
  const r1 = computeCpm([I('A', 4)], []);
  ok(r1.projectDuration === 4 && r1.critical.length === 1 && r1.float.A === 0, 'single node critical');
}

// 10. topoSort + findCycle basics.
{
  const items = [I('A', 1), I('B', 1), I('C', 1)];
  const o = topoSort(items, [{ predecessor_id: 'A', successor_id: 'B', link_type: 'FS', lag_days: 0 }]);
  ok(o.indexOf('A') < o.indexOf('B'), 'topo respects edge');
  ok(findCycle(items, []) === null, 'acyclic → null');
}

// 11. Compression feasible: linear 3+2+4=9 → 6 (floors: ceil(d*0.5), min 1).
{
  const items = [I('A', 3), I('B', 2), I('C', 4)];
  const links = [
    { predecessor_id: 'A', successor_id: 'B', link_type: 'FS', lag_days: 0 },
    { predecessor_id: 'B', successor_id: 'C', link_type: 'FS', lag_days: 0 },
  ];
  const r = compressSchedule(items, links, 6);
  ok(r.feasible && r.after <= 6, `compress 9→≤6 (got ${r.after}, rounds=${r.rounds})`);
  ok(r.before === 9, `before recorded (got ${r.before})`);
  const tot = r.perItem.reduce((s, p) => s + p.saved, 0);
  ok(tot === r.before - r.after, `saved adds up (${tot} === ${r.before - r.after})`);
  // floors: A≥2, B≥1, C≥2 → min total 5; target 4 must fail.
  const r2 = compressSchedule(items, links, 4);
  ok(!r2.feasible && r2.after === 5, `infeasible below floors (after=${r2.after})`);
  ok(r2.bottleneck.length === 3 && r2.bottleneck.every((b) => b.locked === false), `bottleneck names all critical unlocked (got ${JSON.stringify(r2.bottleneck)})`);
  // locked critical path → bottleneck flags locked:true (never empty).
  const r3 = compressSchedule([{ id: 'A', duration_days: 5, locked: true }], [], 3);
  ok(!r3.feasible && r3.bottleneck.length === 1 && r3.bottleneck[0].locked === true, `locked blocker flagged (got ${JSON.stringify(r3.bottleneck)})`);
}

// 12. Locked items never shorten; started keep elapsed.
{
  const items = [
    { id: 'A', duration_days: 4, locked: true },
    { id: 'B', duration_days: 4, elapsed_days: 3 },
    { id: 'C', duration_days: 4 },
  ];
  const links = [
    { predecessor_id: 'A', successor_id: 'B', link_type: 'FS', lag_days: 0 },
    { predecessor_id: 'B', successor_id: 'C', link_type: 'FS', lag_days: 0 },
  ];
  const r = compressSchedule(items, links, 9, { min_days_floor: 1, min_pct: 0.5 });
  // floors: A locked (fixed 4), B max(1, 2, 3)=3, C max(1,2)=2 → min total 9.
  ok(r.feasible && r.after === 9, `locked+elapsed respected (after=${r.after})`);
  ok(r.durations.A === 4 && r.durations.B === 3 && r.durations.C === 2, `floors exact (got ${JSON.stringify(r.durations)})`);
}

// 13. Already fits → no-op, no perItem churn.
{
  const r = compressSchedule([I('A', 2)], [], 5);
  ok(r.feasible && r.after === 2 && r.perItem.length === 0 && r.rounds === 0, 'no-op when already fits');
}

// 14. mapToCalendar: pending clamped to today, started keep start.
{
  const rows = [
    { id: 1, plan_start_date: '2026-09-01', actual_start_date: null, progress_pct: 0, status: 'PENDING' },
    { id: 2, plan_start_date: '2026-09-03', actual_start_date: '2026-09-03', progress_pct: 0.5, status: 'IN_PROGRESS' },
  ];
  const m = mapToCalendar(rows, { 1: 4, 2: 6 }, { 1: 0, 2: 2 }, '2026-09-01', '2026-09-10');
  ok(m[1].new_start === '2026-09-10' && m[1].new_end === '2026-09-14', `pending clamped to today (got ${m[1].new_start}→${m[1].new_end})`);
  ok(m[2].new_start === '2026-09-03' && m[2].new_end === '2026-09-09', `started keeps start (got ${m[2].new_start}→${m[2].new_end})`);
}

// 15. Suspensions: gaps pause the calendar, snap starts out of gaps.
{
  const gaps = normalizeGaps([{ from: '2026-09-12', to: '2026-09-14' }, { from: 'bad', to: 'x' }, null, { from: '2026-09-20', to: '2026-09-18' }]);
  ok(gaps.length === 1 && gaps[0].from === '2026-09-12', `junk gaps filtered (got ${JSON.stringify(gaps)})`);
  ok(isSuspended('2026-09-13', gaps) && !isSuspended('2026-09-15', gaps), 'isSuspended');
  ok(addWorkingDays('2026-09-10', 2, gaps) === '2026-09-15', `2 working days skip gap (got ${addWorkingDays('2026-09-10', 2, gaps)})`);
  ok(addWorkingDays('2026-09-13', 0, gaps) === '2026-09-15', 'n=0 snaps forward out of gap');
  const rows = [{ id: 1, plan_start_date: '2026-09-10', actual_start_date: null, progress_pct: 0, status: 'PENDING' }];
  const m = mapToCalendar(rows, { 1: 4 }, { 1: 0 }, '2026-09-10', '2026-09-10', gaps);
  ok(m[1].new_start === '2026-09-10' && m[1].new_end === '2026-09-17', `duration spans gap (got ${m[1].new_start}→${m[1].new_end})`);
}

// 16. Summary detection: TỔNG-name or >3× median duration.
{
  const rows = [
    { id: 1, name_vi: 'TỔNG TIẾN ĐỘ THI CÔNG', plan_duration_days: 297 },
    { id: 2, name_vi: 'Ép cọc', plan_duration_days: 5 },
    { id: 3, name_vi: 'Đài móng', plan_duration_days: 6 },
    { id: 4, name_vi: 'Việc lạ kéo dài', plan_duration_days: 40 },
    { id: 5, name_vi: 'Cột', plan_duration_days: 4 },
  ];
  const cands = detectSummaryRows(rows);
  const byId = Object.fromEntries(cands.map((c) => [c.id, c.reason]));
  ok(byId[1] === 'name', 'TỔNG row flagged by name');
  ok(typeof byId[4] === 'string' && byId[4].startsWith('outlier'), `40d outlier flagged (got ${byId[4]})`);
  ok(!(2 in byId) && !(3 in byId) && !(5 in byId), 'normal rows clean');
  ok(detectSummaryRows([]).length === 0, 'empty → none');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
