// Schedule graph + CPM engine (v0.6.0).
// Pure functions over plain {items, links} — no db import, unit-testable.
// Phase 0 ships: graph building, link validation, cycle detection, topo sort.
// Phase 1 adds: forward/backward pass (early/late dates, float, critical path).
//
// Conventions:
//   - item: { id, duration_days (>=0 number), locked?: boolean }
//   - link: { predecessor_id, successor_id, link_type: 'FS'|'SS'|'FF', lag_days }
//   - durations are working-day-agnostic day counts (v1 treats all days working).
//   - locked items (DONE / progress>=1) are fixed anchors, never moved.

export const LINK_TYPES = ['FS', 'SS', 'FF'];

export function buildGraph(items, links) {
  const ids = new Set(items.map((i) => i.id));
  const succ = new Map(); // id -> [{ to, type, lag }]
  const pred = new Map(); // id -> [{ from, type, lag }]
  for (const i of items) { succ.set(i.id, []); pred.set(i.id, []); }
  for (const l of links) {
    if (!ids.has(l.predecessor_id) || !ids.has(l.successor_id)) {
      throw new Error(`link references unknown item (${l.predecessor_id}→${l.successor_id})`);
    }
    if (!LINK_TYPES.includes(l.link_type)) throw new Error(`bad link_type ${l.link_type}`);
    succ.get(l.predecessor_id).push({ to: l.successor_id, type: l.link_type, lag: l.lag_days || 0 });
    pred.get(l.successor_id).push({ from: l.predecessor_id, type: l.link_type, lag: l.lag_days || 0 });
  }
  return { succ, pred };
}

// Validate a PROPOSED link against existing items+links. Returns {ok} or
// {ok:false, error, cycle?}. Pure — the route loads rows, calls this, then writes.
export function validateNewLink(items, links, predecessorId, successorId, linkType = 'FS', lagDays = 0) {
  if (predecessorId === successorId) return { ok: false, error: 'self-link forbidden' };
  if (!LINK_TYPES.includes(linkType)) return { ok: false, error: `link_type must be ${LINK_TYPES.join('|')}` };
  if (!Number.isInteger(lagDays) || lagDays < 0) return { ok: false, error: 'lag_days must be integer >= 0' };
  const ids = new Set(items.map((i) => i.id));
  if (!ids.has(predecessorId) || !ids.has(successorId)) return { ok: false, error: 'unknown item id' };
  if (links.some((l) => l.predecessor_id === predecessorId && l.successor_id === successorId)) {
    return { ok: false, error: 'duplicate link' };
  }
  const cycle = findCycle(items, [...links, { predecessor_id: predecessorId, successor_id: successorId, link_type: linkType, lag_days: lagDays }]);
  if (cycle) return { ok: false, error: `link would create a cycle: ${cycle.join(' → ')}`, cycle };
  return { ok: true };
}

// findCycle: iterative DFS over successor edges. Returns the cycle path or null.
// Edge direction (not type) is what matters for cyclicity.
export function findCycle(items, links) {
  const { succ } = buildGraph(items, links.map((l) => ({ ...l, link_type: 'FS', lag_days: 0 })));
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map(items.map((i) => [i.id, WHITE]));
  const stack = [];
  const dfs = (u) => {
    color.set(u, GRAY);
    stack.push(u);
    for (const e of succ.get(u)) {
      if (color.get(e.to) === GRAY) return [...stack.slice(stack.indexOf(e.to)), e.to];
      if (color.get(e.to) === WHITE) {
        const c = dfs(e.to);
        if (c) return c;
      }
    }
    stack.pop();
    color.set(u, BLACK);
    return null;
  };
  for (const i of items) {
    if (color.get(i.id) === WHITE) {
      const c = dfs(i.id);
      if (c) return c;
    }
  }
  return null;
}

// Kahn's topological order (successor-edge direction). Throws on cycle.
export function topoSort(items, links) {  const { succ, pred } = buildGraph(items, links);
  const indeg = new Map(items.map((i) => [i.id, pred.get(i.id).length]));
  const queue = items.filter((i) => indeg.get(i.id) === 0).map((i) => i.id);
  const order = [];
  while (queue.length) {
    const u = queue.shift();
    order.push(u);
    for (const e of succ.get(u)) {
      indeg.set(e.to, indeg.get(e.to) - 1);
      if (indeg.get(e.to) === 0) queue.push(e.to);
    }
  }
  if (order.length !== items.length) {
    const c = findCycle(items, links);
    throw new Error(`cyclic schedule graph${c ? `: ${c.join(' → ')}` : ''}`);
  }
  return order;
}

// =====================================================================
// CPM time computation (Phase 1). Pure. Day-indexed (day 0 = project start):
//   forward:  ES(s) ≥ EF(u)+lag (FS) | ES(u)+lag (SS) | EF(u)+lag−dur(s) (FF)
//   backward: LF(u) ≤ LS(s)−lag (FS) | LS(s)−lag+dur(u) (SS) | LF(s)−lag (FF)
//   float(u) = LS(u) − ES(u); critical ⟺ float == 0.
// Locked items (DONE) participate with fixed duration; the COMPRESSION phase
// (not CPM) refuses to shorten them. Zero-duration milestones allowed.
// =====================================================================

export function resolveDurationDays(item) {
  if (Number.isFinite(item.duration_days) && item.duration_days >= 0) return item.duration_days;
  return 1;
}

// Day offset between two dates (accepts 'YYYY-MM-DD' strings or JS Dates —
// pg returns DATE columns as Date objects, so never assume strings).
export function dateDiffDays(a, b) {
  if (a == null || b == null) return null;
  const s = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
  const ms = new Date(s(b)) - new Date(s(a));
  return Number.isFinite(ms) ? Math.round(ms / 864e5) : null;
}

// Duration for a DB schedule row: explicit days → plan dates → 1-day floor.
export function rowDurationDays(row) {
  if (Number.isFinite(Number(row.plan_duration_days)) && Number(row.plan_duration_days) > 0) {
    return Number(row.plan_duration_days);
  }
  const d = dateDiffDays(row.plan_start_date, row.plan_end_date);
  if (d != null && d > 0) return d;
  return 1;
}

export function computeCpm(items, links) {  if (!items.length) return { order: [], es: {}, ef: {}, ls: {}, lf: {}, float: {}, critical: [], projectDuration: 0 };
  const order = topoSort(items, links); // throws on cycle
  const { succ, pred } = buildGraph(items, links);
  const dur = new Map(items.map((i) => [i.id, resolveDurationDays(i)]));
  const es = new Map(), ef = new Map();
  for (const id of order) {
    let start = 0;
    for (const p of pred.get(id)) {
      if (p.type === 'FS') start = Math.max(start, ef.get(p.from) + p.lag);
      else if (p.type === 'SS') start = Math.max(start, es.get(p.from) + p.lag);
      else start = Math.max(start, ef.get(p.from) + p.lag - dur.get(id)); // FF
    }
    es.set(id, start);
    ef.set(id, start + dur.get(id));
  }
  const projectDuration = Math.max(...ef.values());
  const lf = new Map(), ls = new Map();
  for (const id of [...order].reverse()) {
    let finish = projectDuration;
    for (const e of succ.get(id)) {
      if (e.type === 'FS') finish = Math.min(finish, ls.get(e.to) - e.lag);
      else if (e.type === 'SS') finish = Math.min(finish, ls.get(e.to) - e.lag + dur.get(id));
      else finish = Math.min(finish, lf.get(e.to) - e.lag); // FF
    }
    finish = Math.max(finish, ef.get(id)); // never earlier than own early finish
    lf.set(id, finish);
    ls.set(id, finish - dur.get(id));
  }
  const float = new Map(items.map((i) => [i.id, ls.get(i.id) - es.get(i.id)]));
  const critical = items.filter((i) => float.get(i.id) === 0).map((i) => i.id);
  const pack = (m) => Object.fromEntries(m);
  return { order, es: pack(es), ef: pack(ef), ls: pack(ls), lf: pack(lf), float: pack(float), critical, projectDuration };
}

// =====================================================================
// Compression (Phase 2). Crash the schedule to fit targetDays day-index
// duration by shortening CRITICAL compressible items round-robin, 1 day per
// round, recomputing CPM every round (the path shifts — correct crashing).
//   item: { id, duration_days, locked?: boolean, elapsed_days?: number }
//   policy: { min_days_floor=1, min_pct=0.5 }
//   floor(id) = max(min_days_floor, ceil(orig * min_pct), elapsed)
// Locked items (DONE) are never shortened. Started items keep elapsed days
// (compress_remainder emerges: only the unspent remainder can shrink).
// Whole-day granularity; iterations bounded by total compressible days + 1.
// Returns { feasible, before, after, durations, perItem, bottleneck, rounds }.
// =====================================================================

export function compressSchedule(items, links, targetDays, policy = {}) {
  const minFloor = Math.max(0, policy.min_days_floor ?? 1);
  const minPct = Math.min(1, Math.max(0, policy.min_pct ?? 0.5));
  const candidateIds = policy.candidate_ids == null ? null : new Set((policy.candidate_ids || []).map(Number));
  const orig = new Map(items.map((i) => [i.id, resolveDurationDays(i)]));
  const locked = new Set(items.filter((i) => i.locked).map((i) => i.id));
  const floor = new Map(items.map((i) => {
    const elapsed = Math.max(0, i.elapsed_days || 0);
    return [i.id, Math.max(minFloor, Math.ceil(orig.get(i.id) * minPct), Math.min(elapsed, orig.get(i.id)))];
  }));
  const withDurs = (durs) => items.map((i) => ({ id: i.id, duration_days: durs.get(i.id) }));
  const durs = new Map(orig);
  const first = computeCpm(withDurs(durs), links);
  const before = first.projectDuration;
  if (before <= targetDays) {
    return { feasible: true, before, after: before, durations: Object.fromEntries(durs), perItem: [], bottleneck: [], rounds: 0 };
  }
  const firstCritical = new Set(first.critical);
  let rounds = 0;
  const maxRounds = [...durs.values()].reduce((a, b) => a + b, 0) + 1;
  for (;;) {
    const cpm = computeCpm(withDurs(durs), links);
    if (cpm.projectDuration <= targetDays) {
      return {
        feasible: true, before, after: cpm.projectDuration,
        durations: Object.fromEntries(durs),
        perItem: items.map((i) => ({
          id: i.id, old_dur: orig.get(i.id), new_dur: durs.get(i.id),
          saved: orig.get(i.id) - durs.get(i.id),
          was_critical: firstCritical.has(i.id),
          at_floor: durs.get(i.id) <= floor.get(i.id),
        })).filter((p) => p.saved > 0),
        bottleneck: [], rounds,
      };
    }
    const candidates = cpm.critical.filter((id) => !locked.has(id) && (!candidateIds || candidateIds.has(id)) && durs.get(id) > floor.get(id));
    if (!candidates.length || ++rounds > maxRounds) {
      const stuck = computeCpm(withDurs(durs), links);
      return {
        feasible: false, before, after: stuck.projectDuration,
        durations: Object.fromEntries(durs),
        perItem: [],
        bottleneck: stuck.critical.map((id) => ({ id, locked: locked.has(id) })),
        rounds,
      };
    }
    for (const id of candidates) durs.set(id, Math.max(floor.get(id), durs.get(id) - 1));
  }
}

// --- Summary-row detection (v0.6.1) ---
// Header/summary rows ("TỔNG TIẾN ĐỘ...") carry huge spans that dominate the
// project duration but represent no real work. They poison compression
// (see BTE: one 297-day locked summary). Detected by name pattern or duration
// outlier (>3× project median). Exclusion is explicit (policy.exclude_ids) —
// never automatic.
export function detectSummaryRows(rows) {
  const durs = rows.map((r) => ({ r, d: rowDurationDays(r) })).filter((x) => x.d > 0);
  const sorted = durs.map((x) => x.d).sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const out = [];
  for (const { r, d } of durs) {
    const name = String(r.name_vi || '');
    if (/TỔNG|TONG|SUMMARY|TOTAL|CỘNG/i.test(name)) out.push({ id: r.id, name: r.name_vi, reason: 'name' });
    else if (median > 0 && d > 3 * median) out.push({ id: r.id, name: r.name_vi, reason: `outlier (${d}d > 3× median ${median}d)` });
  }
  return out;
}

// --- Working calendar + suspensions (v0.6.1) ---
// gaps: [{ from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }] inclusive suspension spans
// (Tết shutdowns, site suspensions). No work starts/ends inside a gap:
// addWorkingDays jumps over them. Invalid spans are ignored (fail-open on
// display math only — the API validates strictly before storing policy).
export function normalizeGaps(gaps) {
  if (!Array.isArray(gaps)) return [];
  const out = [];
  for (const g of gaps.slice(0, 10)) {
    if (!g || typeof g.from !== 'string' || typeof g.to !== 'string') continue;
    const f = g.from.slice(0, 10), t = g.to.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || !/^\d{4}-\d{2}-\d{2}$/.test(t) || f > t) continue;
    out.push({ from: f, to: t });
  }
  return out.sort((a, b) => (a.from < b.from ? -1 : 1));
}

export function isSuspended(dateStr, gaps) {
  const d = dateStr.slice(0, 10);
  return gaps.some((g) => d >= g.from && d <= g.to);
}

// Add n working (non-suspended) days to a date. n=0 snaps FORWARD out of a gap.
export function addWorkingDays(dateStr, n, gaps = []) {
  let d = dateStr.slice(0, 10);
  if (n <= 0) {
    while (isSuspended(d, gaps)) d = shiftDate(d, 1);
    return d;
  }
  let left = n;
  while (left > 0) {
    d = shiftDate(d, 1);
    if (!isSuspended(d, gaps)) left--;
  }
  return d;
}

function shiftDate(dateStr, n) {
  const d = new Date(dateStr.slice(0, 10) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Map compressed durations back to calendar dates (pure).
//   rows: DB items {id, plan_start_date, actual_start_date, progress_pct, status}
//   es: day-index early starts from the FINAL cpm run
//   anchor: 'YYYY-MM-DD' project day-0 (min plan_start or today)
// Rules: locked/started keep their real start (actual || plan || anchor+es);
// pending start = max(anchor+es, today) — never schedule pending work in the past.
 export function mapToCalendar(rows, durations, es, anchor, todayStr, gaps = []) {
  const G = normalizeGaps(gaps);
  const ds = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
  const out = {};
  for (const r of rows) {
    const started = (r.progress_pct ?? 0) > 0 || r.actual_start_date != null;
    const locked = (r.progress_pct ?? 0) >= 1 || r.status === 'DONE';
    let start;
    if (locked || started) start = addWorkingDays(ds(r.actual_start_date || r.plan_start_date || anchor), 0, G);
    else {
      const cand = addWorkingDays(ds(anchor), es[r.id] ?? 0, G);
      start = cand < todayStr ? addWorkingDays(todayStr, 0, G) : cand;
    }
    out[r.id] = { new_start: start, new_end: addWorkingDays(start, durations[r.id] ?? rowDurationDays(r), G) };
  }
  return out;
}
