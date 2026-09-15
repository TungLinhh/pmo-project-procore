// Schedule compression full loop (v0.6.0 Phase 2): plan gate, preview honesty,
// apply writes, double-apply 409, rollback restores, infeasible preview.
// Scratch HBG project, fully cleaned in finally (goldens never see it).
// Run: node tests/e2e/schedule-compress.mjs (spawns its own server, needs dev DB)
import { spawn } from 'node:child_process';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3112';
const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3112' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 3500));

const todayPlus = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
let scratchPid = null;
try {
  const loginAs = async (email) => fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'admin123' }) }).then(r => r.json()).then(j => j.token);
  const adminT = await loginAs('admin@hbg.com');
  const pilotT = await loginAs('admin@pilot.test');
  const siteT = await loginAs('site@hbg.com');
  ok(!!adminT && !!pilotT && !!siteT, 'three logins');
  const H = (t) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });
  const call = (t, m, p, b) => fetch(BASE + p, { method: m, headers: H(t), body: b ? JSON.stringify(b) : undefined }).then(async r => ({ s: r.status, j: await r.json().catch(() => null) }));

  const { getDb } = await import('../../backend/src/db/index.js');
  const db = getDb();
  const pilot = await db.prepare(`SELECT id FROM projects WHERE code = 'PILOT-001'`).getAsync();

  // 1. Gates: Small plan and SITE role both 403.
  const g1 = await call(pilotT, 'POST', `/api/projects/${pilot.id}/schedule-compress/preview`, { target_end_date: todayPlus(30) });
  ok(g1.s === 403, `small plan preview → 403 (got ${g1.s})`);
  const hbg = await db.prepare(`SELECT id FROM projects WHERE code = 'BTE-WP4-HBC'`).getAsync();
  const g2 = await call(siteT, 'POST', `/api/projects/${hbg.id}/schedule-compress/preview`, { target_end_date: todayPlus(30) });
  ok(g2.s === 403, `site role preview → 403 (got ${g2.s})`);
  // 2. Bad input → 400.
  const g3 = await call(adminT, 'POST', `/api/projects/${hbg.id}/schedule-compress/preview`, { target_end_date: 'not-a-date' });
  ok(g3.s === 400, `bad date → 400 (got ${g3.s})`);

  // 3. Scratch project: 1 zone + 3 chained pending items (4+5+3=12d).
  const code = `CMP-${Date.now()}`;
  const created = await call(adminT, 'POST', '/api/projects', { code });
  ok(created.s === 201, `scratch project (got ${created.s})`);
  scratchPid = created.j.id;
  const z = await call(adminT, 'POST', `/api/projects/${scratchPid}/zones`, { code: 'Z1' });
  const zid = z.j.id;
  await db.prepare(
    `INSERT INTO construction_schedule_items (project_id, zone_id, source_sheet, ordinal, name_vi, progress_pct, status, plan_start_date, plan_end_date)
     VALUES (?, ?, 'CMP', 1, 'A', 0, 'PENDING', CURRENT_DATE, CURRENT_DATE + 4),
            (?, ?, 'CMP', 2, 'B', 0, 'PENDING', CURRENT_DATE + 4, CURRENT_DATE + 9),
            (?, ?, 'CMP', 3, 'C', 0, 'PENDING', CURRENT_DATE + 9, CURRENT_DATE + 12)`
  ).runAsync(scratchPid, zid, scratchPid, zid, scratchPid, zid);
  const chained = await call(adminT, 'POST', `/api/projects/${scratchPid}/schedule-links/auto-chain`, { confirm: true });
  ok(chained.j?.created === 2, `auto-chain 2 links (got ${JSON.stringify(chained.j)})`);

  // 4. Preview feasible: 12d → 8d.
  const pv = await call(adminT, 'POST', `/api/projects/${scratchPid}/schedule-compress/preview`, { target_end_date: todayPlus(8) });
  ok(pv.s === 201 && pv.j.feasible === true, `preview feasible (got ${pv.s}/${pv.j?.feasible})`);
  ok(pv.j.before_days === 12 && pv.j.after_days <= 8, `12→≤8d (got ${pv.j?.before_days}→${pv.j?.after_days})`);
  ok(pv.j.per_item.length === 3 && pv.j.per_item.every((p) => p.new_start && p.new_end && p.name), 'per-item diff complete');
  ok(pv.j.scenario_id > 0, 'scenario stored');
  const scid = pv.j.scenario_id;
  const listed = await call(adminT, 'GET', `/api/projects/${scratchPid}/schedule-scenarios`);
  ok(listed.j.some((s) => s.id === scid && s.status === 'DRAFT'), 'scenario listed as DRAFT');

  // 5. Apply writes dates; re-apply 409s.
  const before = await db.prepare('SELECT id, plan_start_date AS s, plan_end_date AS e FROM construction_schedule_items WHERE project_id = ? ORDER BY ordinal').allAsync(scratchPid);
  const ap = await call(adminT, 'POST', `/api/schedule-scenarios/${scid}/apply`);
  ok(ap.s === 200 && ap.j.changed === 3, `apply changes 3 (got ${ap.s}/${ap.j?.changed})`);
  const after = await db.prepare('SELECT id, plan_start_date AS s, plan_end_date AS e FROM construction_schedule_items WHERE project_id = ? ORDER BY ordinal').allAsync(scratchPid);
  ok(JSON.stringify(before) !== JSON.stringify(after), 'dates actually moved');
  const ap2 = await call(adminT, 'POST', `/api/schedule-scenarios/${scid}/apply`);
  ok(ap2.s === 409, `re-apply → 409 (got ${ap2.s})`);

  // 6. Rollback restores exactly; re-rollback 409s.
  const rb = await call(adminT, 'POST', `/api/schedule-scenarios/${scid}/rollback`);
  ok(rb.s === 200 && rb.j.restored === 3, `rollback restores 3 (got ${rb.s})`);
  const restored = await db.prepare('SELECT id, plan_start_date AS s, plan_end_date AS e FROM construction_schedule_items WHERE project_id = ? ORDER BY ordinal').allAsync(scratchPid);
  const norm = (rows) => JSON.stringify(rows.map((r) => ({ ...r, s: String(r.s).slice(0, 10), e: String(r.e).slice(0, 10) })));
  ok(norm(restored) === norm(before), 'dates byte-identical after rollback');
  const rb2 = await call(adminT, 'POST', `/api/schedule-scenarios/${scid}/rollback`);
  ok(rb2.s === 409, `re-rollback → 409 (got ${rb2.s})`);

  // 7. Infeasible preview: target yesterday → 201 with feasible:false + bottleneck.
  const inf = await call(adminT, 'POST', `/api/projects/${scratchPid}/schedule-compress/preview`, { target_end_date: todayPlus(-1) });
  ok(inf.s === 201 && inf.j.feasible === false && inf.j.bottleneck.length > 0 && inf.j.bottleneck.every((b) => b.id && b.locked === false), `infeasible honest (got ${inf.s}/${inf.j?.feasible})`);
} finally {
  if (scratchPid) {
    const { getDb } = await import('../../backend/src/db/index.js');
    const db = getDb();
    await db.prepare('DELETE FROM construction_schedule_items WHERE project_id = ?').runAsync(scratchPid).catch(() => {});
    await db.prepare('DELETE FROM zones WHERE project_id = ?').runAsync(scratchPid).catch(() => {});
    await db.prepare('DELETE FROM project_members WHERE project_id = ?').runAsync(scratchPid).catch(() => {});
    await db.prepare('DELETE FROM projects WHERE id = ?').runAsync(scratchPid).catch(() => {});
  }
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
