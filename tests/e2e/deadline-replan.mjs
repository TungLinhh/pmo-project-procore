// Deadline replan e2e: CEO/PM/PMO change projects.end_date → AI proposes
// CPM timeline (scenario DRAFT + ai_drafts schedule_replan) → CEO/Admin
// approves (apply) → rollback restores.
// Run: AI_MOCK=1 node tests/e2e/deadline-replan.mjs (spawns own server, needs dev DB)
process.env.AI_MOCK = '1';
import { waitForServer } from './lib.mjs';
import { spawn } from 'node:child_process';
import { cleanupProjectsOnExit } from './lib-cleanup.mjs';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3115';
const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3115', AI_MOCK: '1' }, stdio: 'ignore' });
await waitForServer(BASE);


// Dọn dự án thử nghiệm nếu bài dừng giữa chừng — xem `lib-cleanup.mjs`.
cleanupProjectsOnExit(['DL-%'], { label: 'deadline-replan' });
const todayPlus = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
let scratchPid = null;
const createdDrafts = [];
const createdScenarios = [];
try {
  const loginAs = async (email) => fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'admin123' }) }).then(r => r.json()).then(j => j.token);
  const adminT = await loginAs('admin@hbg.com');
  const ceoT = await loginAs('ceo@hbg.com');
  const pmT = await loginAs('pm@hbg.com');
  const pmoT = await loginAs('pmo@hbg.com');
  const siteT = await loginAs('site@hbg.com');
  const pilotT = await loginAs('admin@pilot.test');
  ok(!!adminT && !!ceoT && !!pmT && !!pmoT && !!siteT && !!pilotT, 'six logins (admin/ceo/pm/pmo/site/pilot)');
  const H = (t) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });
  const call = (t, m, p, b) => fetch(BASE + p, { method: m, headers: H(t), body: b ? JSON.stringify(b) : undefined }).then(async r => ({ s: r.status, j: await r.json().catch(() => null) }));

  const { getDb } = await import('../../backend/src/db/index.js');
  const db = getDb();
  const userId = async (email, tenantCode = 'hbg') => db.prepare(
    `SELECT u.id FROM users u JOIN tenants t ON t.id = u.tenant_id WHERE u.email = ? AND t.code = ?`
  ).getAsync(email, tenantCode).then(r => r?.id);
  const pmId = await userId('pm@hbg.com');
  const pmoId = await userId('pmo@hbg.com');

  // 1. Scratch project: 1 zone + 3 chained pending items (4+5+3=12d).
  const code = `DL-${Date.now()}`;
  const created = await call(adminT, 'POST', '/api/projects', { code });
  ok(created.s === 201, `scratch project (got ${created.s})`);
  scratchPid = created.j.id;
  // PM + PMO need membership (admin/CEO bypass, others require project_members).
  const m1 = await call(adminT, 'POST', `/api/projects/${scratchPid}/members`, { user_id: pmId });
  const m2 = await call(adminT, 'POST', `/api/projects/${scratchPid}/members`, { user_id: pmoId });
  ok(m1.s === 201 && m2.s === 201, 'pm+pmo added as members');
  const z = await call(adminT, 'POST', `/api/projects/${scratchPid}/zones`, { code: 'Z1' });
  const zid = z.j.id;
  await db.prepare(
    `INSERT INTO construction_schedule_items (project_id, zone_id, source_sheet, ordinal, name_vi, progress_pct, status, plan_start_date, plan_end_date)
     VALUES (?, ?, 'DL', 1, 'A', 0, 'PENDING', CURRENT_DATE, CURRENT_DATE + 4),
            (?, ?, 'DL', 2, 'B', 0, 'PENDING', CURRENT_DATE + 4, CURRENT_DATE + 9),
            (?, ?, 'DL', 3, 'C', 0, 'PENDING', CURRENT_DATE + 9, CURRENT_DATE + 12)`
  ).runAsync(scratchPid, zid, scratchPid, zid, scratchPid, zid);
  const chained = await call(adminT, 'POST', `/api/projects/${scratchPid}/schedule-links/auto-chain`, { confirm: true });
  ok(chained.j?.created === 2, `auto-chain 2 links (got ${JSON.stringify(chained.j)})`);

  // 1b. PMO link management (proposal-level, like PM): create + delete + preview.
  const itemIds = (await db.prepare('SELECT id FROM construction_schedule_items WHERE project_id = ? ORDER BY ordinal').allAsync(scratchPid)).map(r => r.id);
  const mkLink = await call(pmoT, 'POST', `/api/projects/${scratchPid}/schedule-links`, { predecessor_id: itemIds[0], successor_id: itemIds[2], link_type: 'FS', lag_days: 0 });
  ok(mkLink.s === 201, `pmo create link A→C → 201 (got ${mkLink.s})`);
  const siteLink = await call(siteT, 'POST', `/api/projects/${scratchPid}/schedule-links`, { predecessor_id: itemIds[0], successor_id: itemIds[2] });
  ok(siteLink.s === 404, `site create link (non-member) → 404 (got ${siteLink.s})`);
  if (mkLink.s === 201) {
    const delLink = await call(pmoT, 'DELETE', `/api/schedule-links/${mkLink.j.id}`);
    ok(delLink.s === 200, `pmo delete link → 200 (got ${delLink.s})`);
  }
  const pmoChainPrev = await call(pmoT, 'POST', `/api/projects/${scratchPid}/schedule-links/auto-chain`, {});
  ok(pmoChainPrev.s === 200 && Array.isArray(pmoChainPrev.j?.proposed), `pmo auto-chain preview → 200 (got ${pmoChainPrev.s})`);

  // 2. Role gates on PATCH deadline.
  const badDate = await call(pmT, 'PATCH', `/api/projects/${scratchPid}`, { end_date: 'not-a-date' });
  ok(badDate.s === 400, `bad date → 400 (got ${badDate.s})`);
  const badRange = await call(pmT, 'PATCH', `/api/projects/${scratchPid}`, { start_date: todayPlus(10), end_date: todayPlus(5) });
  ok(badRange.s === 400, `start>end → 400 (got ${badRange.s})`);
  const sitePatch = await call(siteT, 'PATCH', `/api/projects/${scratchPid}`, { end_date: todayPlus(30) });
  ok(sitePatch.s === 404, `site PATCH (non-member) → 404 no-leak (got ${sitePatch.s})`);

  // 3. PM proposes: PATCH end_date → auto AI replan (scenario DRAFT + draft pending).
  const target = todayPlus(8); // 12d work → 8d target: feasible compression
  const prop = await call(pmT, 'PATCH', `/api/projects/${scratchPid}`, { end_date: target });
  ok(prop.s === 200 && (prop.j.end_date || '').slice(0, 10) === target, `pm PATCH deadline 200 + end_date=${target} (got ${prop.s}/${prop.j?.end_date})`);
  ok(prop.j.replan && !prop.j.replan.skipped, `replan auto-proposed (got ${JSON.stringify(prop.j?.replan)?.slice(0, 120)})`);
  const scId = prop.j?.replan?.scenario?.id;
  const draftId = prop.j?.replan?.draft?.id;
  ok(Number.isInteger(scId) && Number.isInteger(draftId), `scenario #${scId} + draft #${draftId} created`);
  if (scId) createdScenarios.push(scId);
  if (draftId) createdDrafts.push(draftId);
  ok(prop.j?.replan?.out?.feasible === true, `proposal feasible (saved ${prop.j?.replan?.out?.days_saved}d)`);
  ok(typeof prop.j?.replan?.draft?.body === 'string' && prop.j.replan.draft.body.length > 20, 'AI body non-empty (mock/template)');
  const payload = (() => { try { return typeof prop.j.replan.draft.payload === 'string' ? JSON.parse(prop.j.replan.draft.payload) : prop.j.replan.draft.payload; } catch { return null; } })();
  ok(payload?.scenario_id === scId && payload?.target_end_date === target, 'draft payload links scenario+target');

  // 4. PMO can also propose (no longer 403 like the old compress gate).
  const target2 = todayPlus(9);
  const prop2 = await call(pmoT, 'PATCH', `/api/projects/${scratchPid}`, { end_date: target2 });
  ok(prop2.s === 200 && prop2.j?.replan?.scenario?.id > 0, `pmo PATCH proposes (got ${prop2.s})`);
  if (prop2.j?.replan?.scenario?.id) createdScenarios.push(prop2.j.replan.scenario.id);
  if (prop2.j?.replan?.draft?.id) createdDrafts.push(prop2.j.replan.draft.id);
  const pmoPreview = await call(pmoT, 'POST', `/api/projects/${scratchPid}/schedule-compress/preview`, { target_end_date: target2 });
  ok(pmoPreview.s === 201, `pmo manual preview → 201 (got ${pmoPreview.s})`);
  if (pmoPreview.j?.scenario_id) createdScenarios.push(pmoPreview.j.scenario_id);

  // 5. Split approval: PM/PMO apply → 403; CEO apply → 200; re-apply → 409.
  const denyPm = await call(pmT, 'POST', `/api/schedule-scenarios/${scId}/apply`);
  ok(denyPm.s === 403, `pm apply → 403 (got ${denyPm.s})`);
  const denyPmo = await call(pmoT, 'POST', `/api/schedule-scenarios/${scId}/apply`);
  ok(denyPmo.s === 403, `pmo apply → 403 (got ${denyPmo.s})`);
  const denyDraftPm = await call(pmT, 'POST', `/api/ai/drafts/${draftId}/approve`);
  ok(denyDraftPm.s === 403, `pm approve schedule_replan draft → 403 (got ${denyDraftPm.s})`);
  // Dismiss is locked too: PM cannot kill a CEO-pending proposal.
  const draft2Id = prop2.j?.replan?.draft?.id;
  const denyDismissPm = await call(pmT, 'POST', `/api/ai/drafts/${draft2Id}/dismiss`);
  ok(denyDismissPm.s === 403, `pm dismiss schedule_replan draft → 403 (got ${denyDismissPm.s})`);
  const okDismissCeo = await call(ceoT, 'POST', `/api/ai/drafts/${draft2Id}/dismiss`);
  ok(okDismissCeo.s === 200, `ceo dismiss second draft (got ${okDismissCeo.s})`);
  const before = await db.prepare('SELECT id, plan_start_date AS s, plan_end_date AS e FROM construction_schedule_items WHERE project_id = ? ORDER BY ordinal').allAsync(scratchPid);
  const ap = await call(ceoT, 'POST', `/api/schedule-scenarios/${scId}/apply`);
  ok(ap.s === 200 && ap.j.changed === 3, `ceo apply changes 3 (got ${ap.s}/${ap.j?.changed})`);
  const after = await db.prepare('SELECT id, plan_start_date AS s, plan_end_date AS e FROM construction_schedule_items WHERE project_id = ? ORDER BY ordinal').allAsync(scratchPid);
  ok(JSON.stringify(before) !== JSON.stringify(after), 'dates actually moved after CEO apply');
  const ap2 = await call(ceoT, 'POST', `/api/schedule-scenarios/${scId}/apply`);
  ok(ap2.s === 409, `re-apply → 409 (got ${ap2.s})`);

  // 6. CEO approves the AI draft (allowed), then rollback restores.
  const okDraft = await call(ceoT, 'POST', `/api/ai/drafts/${draftId}/approve`);
  ok(okDraft.s === 200, `ceo approve draft (got ${okDraft.s})`);
  const rbDeny = await call(pmT, 'POST', `/api/schedule-scenarios/${scId}/rollback`);
  ok(rbDeny.s === 403, `pm rollback → 403 (got ${rbDeny.s})`);
  const rb = await call(ceoT, 'POST', `/api/schedule-scenarios/${scId}/rollback`);
  ok(rb.s === 200 && rb.j.restored === 3, `ceo rollback restores 3 (got ${rb.s})`);
  const restored = await db.prepare('SELECT id, plan_start_date AS s, plan_end_date AS e FROM construction_schedule_items WHERE project_id = ? ORDER BY ordinal').allAsync(scratchPid);
  const norm = (rows) => JSON.stringify(rows.map((r) => ({ ...r, s: String(r.s).slice(0, 10), e: String(r.e).slice(0, 10) })));
  ok(norm(restored) === norm(before), 'dates byte-identical after rollback');

  // 7. Infeasible deadline still proposes honestly (no crash).
  const inf = await call(pmT, 'PATCH', `/api/projects/${scratchPid}`, { end_date: todayPlus(-1) });
  ok(inf.s === 200 && inf.j?.replan?.out?.feasible === false && (inf.j?.replan?.out?.bottleneck || []).length > 0, 'impossible deadline → honest infeasible proposal');
  if (inf.j?.replan?.scenario?.id) createdScenarios.push(inf.j.replan.scenario.id);
  if (inf.j?.replan?.draft?.id) createdDrafts.push(inf.j.replan.draft.id);

  // 7b. Auto-exclude (scenario-#16 fix): locked TỔNG summary row must NOT poison
  // a generous deadline — proposal auto-excludes it and stays feasible.
  await db.prepare(
    `INSERT INTO construction_schedule_items (project_id, zone_id, source_sheet, ordinal, name_vi, progress_pct, status, plan_start_date, plan_end_date)
     VALUES (?, ?, 'DL', 9, 'TỔNG AUTO TEST', 1, 'DONE', CURRENT_DATE - 100, CURRENT_DATE)`
  ).runAsync(scratchPid, zid);
  const sumRow = await db.prepare(`SELECT id FROM construction_schedule_items WHERE project_id = ? AND ordinal = 9`).getAsync(scratchPid);
  const gen = await call(pmT, 'PATCH', `/api/projects/${scratchPid}`, { end_date: todayPlus(60) });
  const autoEx = gen.j?.replan?.out?.excluded_ids || [];
  ok(gen.s === 200 && gen.j?.replan?.out?.feasible === true && autoEx.includes(sumRow.id),
    `generous deadline feasible despite locked summary (excluded ${JSON.stringify(autoEx)})`);
  if (gen.j?.replan?.scenario?.id) createdScenarios.push(gen.j.replan.scenario.id);
  if (gen.j?.replan?.draft?.id) createdDrafts.push(gen.j.replan.draft.id);
  await db.prepare('DELETE FROM construction_schedule_items WHERE id = ?').runAsync(sumRow.id);

  // 7c. Scenario management (admin/CEO): rename + retarget + delete; PM locked out.
  const mgr = await call(pmT, 'PATCH', `/api/projects/${scratchPid}`, { end_date: todayPlus(12) });
  const mgrSc = mgr.j?.replan?.scenario?.id;
  const mgrDr = mgr.j?.replan?.draft?.id;
  ok(mgr.s === 200 && mgrSc, 'fresh DRAFT scenario for management tests');
  if (mgrSc) createdScenarios.push(mgrSc);
  if (mgrDr) createdDrafts.push(mgrDr);
  const pmPatch = await call(pmT, 'PATCH', `/api/schedule-scenarios/${mgrSc}`, { name: 'PM edit' });
  ok(pmPatch.s === 403, `pm scenario PATCH → 403 (got ${pmPatch.s})`);
  const pmDel = await call(pmT, 'DELETE', `/api/schedule-scenarios/${mgrSc}`);
  ok(pmDel.s === 403, `pm scenario DELETE → 403 (got ${pmDel.s})`);
  const badRetarget = await call(ceoT, 'PATCH', `/api/schedule-scenarios/${mgrSc}`, { target_end_date: 'nope' });
  ok(badRetarget.s === 400, `bad retarget → 400 (got ${badRetarget.s})`);
  const renamed = await call(ceoT, 'PATCH', `/api/schedule-scenarios/${mgrSc}`, { name: 'Kế hoạch đẩy nhanh T6' });
  ok(renamed.s === 200 && renamed.j?.name === 'Kế hoạch đẩy nhanh T6', 'ceo rename → 200');
  const retarget = await call(ceoT, 'PATCH', `/api/schedule-scenarios/${mgrSc}`, { target_end_date: todayPlus(10) });
  ok(retarget.s === 200 && (retarget.j?.target_end_date || '').slice(0, 10) === todayPlus(10) && retarget.j?.status === 'DRAFT',
    `ceo retarget recomputes → DRAFT (got ${retarget.s})`);
  const apMgr = await call(ceoT, 'POST', `/api/schedule-scenarios/${mgrSc}/apply`);
  ok(apMgr.s === 200, `ceo apply managed scenario (got ${apMgr.s})`);
  const lockRetarget = await call(ceoT, 'PATCH', `/api/schedule-scenarios/${mgrSc}`, { target_end_date: todayPlus(11) });
  ok(lockRetarget.s === 409, `retarget APPLIED → 409 (got ${lockRetarget.s})`);
  const lockDel = await call(ceoT, 'DELETE', `/api/schedule-scenarios/${mgrSc}`);
  ok(lockDel.s === 409, `delete APPLIED → 409 (got ${lockDel.s})`);
  await call(ceoT, 'POST', `/api/schedule-scenarios/${mgrSc}/rollback`);
  // DELETE a DRAFT auto-dismisses its linked pending AI draft.
  const mgr2 = await call(pmT, 'PATCH', `/api/projects/${scratchPid}`, { end_date: todayPlus(14) });
  const mgr2Sc = mgr2.j?.replan?.scenario?.id;
  const mgr2Dr = mgr2.j?.replan?.draft?.id;
  const del = await call(ceoT, 'DELETE', `/api/schedule-scenarios/${mgr2Sc}`);
  const drAfter = await db.prepare('SELECT status FROM ai_drafts WHERE id = ?').getAsync(mgr2Dr);
  ok(del.s === 200 && del.j?.dismissed_drafts >= 1 && drAfter?.status === 'dismissed',
    `ceo delete DRAFT dismisses linked draft (got ${del.s})`);

  // 7d. Auto-notifications: approvers pinged on propose, crew pinged on apply.
  const adminId = await db.prepare(`SELECT u.id FROM users u JOIN tenants t ON t.id = u.tenant_id WHERE u.email = 'admin@hbg.com' AND t.code = 'hbg'`).getAsync().then(r => r?.id);
  const adminNotifs = await db.prepare(
    `SELECT title FROM notifications WHERE user_id = ? AND created_at > now() - interval '15 minutes' ORDER BY id DESC LIMIT 20`
  ).allAsync(adminId);
  ok(/Đề xuất timeline|KHÔNG khả thi/.test(adminNotifs.map(n => n.title).join(' | ')), 'admin notified on proposal');
  const pmNotifs = await db.prepare(
    `SELECT title FROM notifications WHERE user_id = ? AND created_at > now() - interval '15 minutes' ORDER BY id DESC LIMIT 20`
  ).allAsync(pmId);
  ok(/Apply timeline|Rollback timeline/.test(pmNotifs.map(n => n.title).join(' | ')), 'crew (PM member) notified on apply/rollback');

  // 8. Audit trail has the deadline UPDATE + scenario + draft events.
  const audits = await db.prepare(
    `SELECT action, resource_type FROM audit_log WHERE resource_type IN ('project','schedule_scenario','ai_draft') AND created_at > now() - interval '10 minutes' ORDER BY id DESC LIMIT 50`
  ).allAsync();
  const acts = audits.map(a => `${a.action} ${a.resource_type}`);
  ok(acts.includes('UPDATE project'), 'audit UPDATE project present');
  ok(acts.includes('PREVIEW schedule_scenario'), 'audit PREVIEW schedule_scenario present');

  // 9. Small plan: pilot PATCH shape still validates (404 cross-tenant, not leak).
  const pilotProj = await db.prepare(`SELECT id FROM projects WHERE code = 'PILOT-001'`).getAsync();
  const cross = await call(pmT, 'PATCH', `/api/projects/${pilotProj.id}`, { end_date: todayPlus(30) });
  ok(cross.s === 404, `cross-tenant PATCH → 404 (got ${cross.s})`);
} finally {
  if (scratchPid || createdDrafts.length || createdScenarios.length) {
    const { getDb } = await import('../../backend/src/db/index.js');
    const db = getDb();
    for (const id of createdDrafts) await db.prepare('DELETE FROM ai_drafts WHERE id = ?').runAsync(id).catch(() => {});
    for (const id of createdScenarios) await db.prepare('DELETE FROM schedule_scenarios WHERE id = ?').runAsync(id).catch(() => {});
    if (scratchPid) {
      await db.prepare('DELETE FROM notifications WHERE project_id = ?').runAsync(scratchPid).catch(() => {});
      await db.prepare('DELETE FROM construction_schedule_items WHERE project_id = ?').runAsync(scratchPid).catch(() => {});
      await db.prepare('DELETE FROM schedule_links WHERE project_id = ?').runAsync(scratchPid).catch(() => {});
      await db.prepare('DELETE FROM zones WHERE project_id = ?').runAsync(scratchPid).catch(() => {});
      await db.prepare('DELETE FROM project_members WHERE project_id = ?').runAsync(scratchPid).catch(() => {});
      await db.prepare('DELETE FROM projects WHERE id = ?').runAsync(scratchPid).catch(() => {});
    }
  }
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
