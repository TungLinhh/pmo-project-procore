// REAL-model demo: deadline replan + cited ask + SLA watcher, all against
// OpenRouter (nvidia/nemotron-3-ultra-550b-a55b:free for chat, real embeddings).
// Real-life roles: PM proposes (PATCH deadline), CEO approves (apply).
// NO AI_MOCK anywhere in this file — every LLM byte comes from the provider.
// Self-cleaning scratch project (goldens never see it).
//
// Run from the repository root:
//   DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo \
//   OPENROUTER_API_KEY=... DEMO_PORT=3117 \
//   node tests/e2e/demo-real-ai.mjs
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (process.env.AI_MOCK === '1') {
  console.error('REFUSED: this demo must run against the real model (unset AI_MOCK).');
  process.exit(2);
}
if (!process.env.OPENROUTER_API_KEY) {
  console.error('REFUSED: OPENROUTER_API_KEY is required.');
  process.exit(2);
}

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const PORT = Number(process.env.DEMO_PORT || 3117);
const BASE = process.env.BASE_URL || `http://127.0.0.1:${PORT}`;
const root = fileURLToPath(new URL('../..', import.meta.url));
const external = process.env.DEMO_NO_SPAWN === '1';
const srv = external ? null : spawn('node', ['src/index.js'], {
  cwd: `${root}/backend`,
  env: { ...process.env, DATABASE_URL: DB, PORT: String(PORT), LOGIN_RATE_MAX: '1000' },
  stdio: 'ignore',
});
if (srv) await new Promise((resolve) => setTimeout(resolve, 3500));

const todayPlus = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
let scratchPid = null;
const created = { issues: [], submittals: [], drafts: [], scenarios: [], embeddings: [] };
let hbgTenant = null;
try {
  const loginAs = async (email) => fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'admin123' }) }).then(r => r.json()).then(j => j.token);
  const adminT = await loginAs('admin@hbg.com');
  const ceoT = await loginAs('ceo@hbg.com');
  const pmT = await loginAs('pm@hbg.com');
  const pmoT = await loginAs('pmo@hbg.com');
  ok(!!adminT && !!ceoT && !!pmT && !!pmoT, 'four logins (admin/ceo/pm/pmo)');
  const H = (t) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });
  const call = (t, m, p, b) => fetch(BASE + p, { method: m, headers: H(t), body: b ? JSON.stringify(b) : undefined }).then(async r => ({ s: r.status, j: await r.json().catch(() => null) }));

  // 0. Confirm live routing (no mock). Keep Nemotron first and Space Bunny as
  // the opt-in second route used only after primary retry fails.
  const wantChat = 'nvidia/nemotron-3-ultra-550b-a55b:free';
  const wantFallback = 'stealth/space-bunny-alpha';
  const wantEmbed = 'nvidia/nemotron-3-embed-1b:free';
  let cfg = await call(adminT, 'GET', '/api/ai/config');
  ok(cfg.j.mock === false, 'server NOT in mock mode');
  let chatCfg = (cfg.j.configs || []).find((c) => c.purpose === 'chat' && c.priority === 0);
  const fallbackCfg = (cfg.j.configs || []).find((c) => c.purpose === 'chat' && c.model === wantFallback);
  if (chatCfg?.provider !== 'openrouter' || chatCfg?.model !== wantChat || !fallbackCfg) {
    const put = await call(adminT, 'PUT', '/api/ai/config', { configs: [
      { purpose: 'chat', provider: 'openrouter', model: wantChat, priority: 0 },
      { purpose: 'chat', provider: 'openrouter', model: wantFallback, priority: 1 },
      { purpose: 'embed', provider: 'openrouter', model: wantEmbed, priority: 1 },
    ]});
    ok(put.s === 200, `self-heal routing → Nemotron + Space Bunny (got ${put.s})`);
    cfg = await call(adminT, 'GET', '/api/ai/config');
    chatCfg = (cfg.j.configs || []).find((c) => c.purpose === 'chat' && c.priority === 0);
  }
  ok(chatCfg?.provider === 'openrouter' && chatCfg?.key_present === true, `live primary chat route: ${chatCfg?.provider}/${chatCfg?.model}`);
  const activeFallback = (cfg.j.configs || []).find((c) => c.purpose === 'chat' && c.model === wantFallback);
  ok(activeFallback?.enabled === true && activeFallback?.key_present === true, `live fallback chat route: ${activeFallback?.model}`);
  const embedCfg = (cfg.j.configs || []).find((c) => c.purpose === 'embed');
  ok(embedCfg?.provider === 'openrouter' && embedCfg?.model === wantEmbed, `live embed route: ${embedCfg?.provider}/${embedCfg?.model}`);

  const { getDb } = await import('../../backend/src/db/index.js');
  const db = getDb();
  hbgTenant = await db.prepare(`SELECT id FROM tenants WHERE code = 'hbg'`).getAsync();
  const userId = async (email) => db.prepare(
    `SELECT u.id FROM users u JOIN tenants t ON t.id = u.tenant_id WHERE u.email = ? AND t.code = 'hbg'`
  ).getAsync(email).then(r => r?.id);

  // 1. Scratch project like a real site: 1 zone, 3 chained tasks, PM+PMO members.
  const code = `REAL-${Date.now()}`;
  const createdProj = await call(adminT, 'POST', '/api/projects', { code });
  ok(createdProj.s === 201, `scratch project ${code}`);
  scratchPid = createdProj.j.id;
  await call(adminT, 'POST', `/api/projects/${scratchPid}/members`, { user_id: await userId('pm@hbg.com') });
  await call(adminT, 'POST', `/api/projects/${scratchPid}/members`, { user_id: await userId('pmo@hbg.com') });
  const z = await call(adminT, 'POST', `/api/projects/${scratchPid}/zones`, { code: 'TANG-5' });
  const zid = z.j.id;
  await db.prepare(
    `INSERT INTO construction_schedule_items (project_id, zone_id, source_sheet, ordinal, name_vi, progress_pct, status, plan_start_date, plan_end_date)
     VALUES (?, ?, 'THICONG', 1, 'Đổ bê tông cột Tầng 5', 0, 'PENDING', CURRENT_DATE, CURRENT_DATE + 4),
            (?, ?, 'THICONG', 2, 'Lắp dựng cốp pha dầm', 0, 'PENDING', CURRENT_DATE + 4, CURRENT_DATE + 9),
            (?, ?, 'THICONG', 3, 'Nghiệm thu ME khu B', 0, 'PENDING', CURRENT_DATE + 9, CURRENT_DATE + 12)`
  ).runAsync(scratchPid, zid, scratchPid, zid, scratchPid, zid);
  await call(adminT, 'POST', `/api/projects/${scratchPid}/schedule-links/auto-chain`, { confirm: true });

  // 2. Site reality: an issue the foreman would actually file (unique token REALWATCH).
  const tag = `REALWATCH-${String(Date.now()).slice(-6)}`;
  const iss = await db.prepare(
    `INSERT INTO issues (tenant_id, project_id, title, body, severity, status) VALUES (?, ?, ?, ?, 'HIGH', 'OPEN') RETURNING id`
  ).runAsync(hbgTenant.id, scratchPid, `${tag} van xả tầng 5 rò rỉ`, `${tag}: áp suất van xả tầng 5 vượt ngưỡng, cần TVGS kiểm tra trước khi đổ bê tông.`);
  created.issues.push(Number(iss.lastInsertRowid));

  // 3. Real embeddings for the new issue (targeted — no full-corpus backfill).
  const { backfillTenant } = await import('../../backend/src/lib/ai/retrieval.js');
  const bf = await call(adminT, 'POST', '/api/ai/backfill');
  if (bf.s !== 200) {
    ok(false, `real backfill bị chặn (${bf.s}: ${bf.j?.error || 'provider unavailable'})`);
    throw new Error('real embedding provider is unavailable');
  }
  ok(bf.j.model === 'nvidia/nemotron-3-embed-1b:free', `real backfill (${bf.j?.embedded} embedded via ${bf.j?.model})`);

  // 4. PM asks — real Nemotron answer with real citation.
  const ask = await call(pmT, 'POST', '/api/ai/ask', { question: `${tag} van xả tình trạng thế nào?`, project_id: scratchPid });
  const cited = (ask.j?.citations || []).map((c) => c.resource_id);
  ok(ask.s === 200 && ask.j?.provider === 'openrouter', `real ask via ${ask.j?.provider}/${ask.j?.model}`);
  if (ask.s !== 200 || !String(ask.j?.answer || '').trim()) {
    throw new Error(`real ask unavailable (${ask.s}: ${ask.j?.error || 'empty answer'})`);
  }
  ok(!String(ask.j?.answer || '').includes('[MOCK ANSWER'), 'answer is genuinely generated (no mock marker)');
  ok(cited.includes(created.issues[0]), 'answer cites the real site issue');
  console.log(`\n--- REAL ASK ANSWER ---\n${ask.j.answer}\n--- END ---\n`);

  // 5. Overdue submittal → real watcher draft (the morning-nudge story).
  const sub = await db.prepare(
    `INSERT INTO material_submittals (project_id, submittal_code, status, sla_days, sla_deadline, supervisor_approval_days, supervisor_deadline)
     VALUES (?, 'REAL-TVGS-01', 'SUBMITTED', 7, CURRENT_DATE - 2, 3, CURRENT_DATE - 1) RETURNING id`
  ).runAsync(scratchPid);
  created.submittals.push(Number(sub.lastInsertRowid));
  const { runAiSlaWatch } = await import('../../backend/src/lib/ai/watcher.js');
  const w = await runAiSlaWatch({ maxDrafts: 20 });
  ok(w.drafted_count >= 1, `real watcher drafted ≥1 (got ${w.drafted_count})`);
  if (w.drafted_count < 1) throw new Error('real watcher produced no draft');
  const wd = await db.prepare(`SELECT * FROM ai_drafts WHERE kind = 'sla_nudge' AND payload->>'submittal_id' = ? AND status = 'pending' ORDER BY id DESC LIMIT 1`).getAsync(String(sub.lastInsertRowid));
  ok(!!wd && (wd.body || '').trim().length > 10 && !wd.body.includes('[MOCK ANSWER'), 'watcher draft is genuinely generated (non-empty)');
  if (wd) { created.drafts.push(wd.id); console.log(`--- REAL WATCHER DRAFT ---\n${wd.body}\n--- END ---\n`); }

  // 6. THE headline story: PM moves the deadline → Nemotron proposes the timeline.
  const target = todayPlus(8);
  console.log(`PM proposes: PATCH end_date → ${target}`);
  const prop = await call(pmT, 'PATCH', `/api/projects/${scratchPid}`, { end_date: target });
  ok(prop.s === 200, `PM deadline change accepted (got ${prop.s})`);
  const rp = prop.j?.replan || {};
  ok(!rp.skipped && rp.scenario?.id > 0 && rp.draft?.id > 0, 'AI timeline proposal created');
  if (rp.skipped || !rp.scenario?.id || !rp.draft?.id) throw new Error(`AI timeline proposal unavailable: ${rp.skipped || rp.error || 'missing scenario/draft'}`);
  if (rp.draft.body?.includes('AI text không khả dụng')) throw new Error('AI provider returned an unavailable-text template');
  created.scenarios.push(rp.scenario.id);
  created.drafts.push(rp.draft.id);
  const rpayload = (() => { try { return typeof rp.draft.payload === 'string' ? JSON.parse(rp.draft.payload) : rp.draft.payload; } catch { return {}; } })();
  ok(rpayload.provider === 'openrouter', `proposal text provider = openrouter (got ${rp.provider || rpayload.provider})`);
  ok(!String(rp.draft.body).includes('[MOCK ANSWER'), 'proposal text is genuinely generated');
  console.log(`--- REAL DEADLINE PROPOSAL (scenario #${rp.scenario.id}, ${rp.out?.feasible ? `feasible −${rp.out.days_saved}d` : 'infeasible'}) ---\n${rp.draft.body}\n--- END ---\n`);

  // 7. Split approval for real: PM cannot apply, CEO can.
  const deny = await call(pmT, 'POST', `/api/schedule-scenarios/${rp.scenario.id}/apply`);
  ok(deny.s === 403, `PM apply → 403 (got ${deny.s})`);
  const ap = await call(ceoT, 'POST', `/api/schedule-scenarios/${rp.scenario.id}/apply`);
  ok(ap.s === 200, `CEO apply → 200, ${ap.j?.changed} items, −${ap.j?.days_saved}d`);
  const rb = await call(ceoT, 'POST', `/api/schedule-scenarios/${rp.scenario.id}/rollback`);
  ok(rb.s === 200, `CEO rollback → 200, restored ${rb.j?.restored}`);

  // 8. Spend proof: real provider rows in usage.
  const usage = await call(adminT, 'GET', '/api/ai/usage');
  const realRows = (usage.j?.rows || []).filter((r) => r.provider === 'openrouter');
  const realCalls = realRows.reduce((s, r) => s + r.calls, 0);
  ok(realCalls > 0, `usage proves real calls: ${realCalls} openrouter call(s), $${usage.j?.spent_usd} spent`);
  console.log(`Usage rows: ${JSON.stringify(usage.j?.rows)}`);
} catch (error) {
  console.error(`REAL DEMO BLOCKED/FAILED: ${error.message}`);
  failures += 1;
} finally {
  if (hbgTenant && (created.issues.length || created.submittals.length || created.drafts.length || created.scenarios.length || scratchPid)) {
    const { getDb } = await import('../../backend/src/db/index.js');
    const db = getDb();
    for (const id of created.submittals) await db.prepare('DELETE FROM material_submittals WHERE id = ?').runAsync(id).catch(() => {});
    for (const id of created.drafts) await db.prepare('DELETE FROM ai_drafts WHERE id = ?').runAsync(id).catch(() => {});
    for (const id of created.scenarios) await db.prepare('DELETE FROM schedule_scenarios WHERE id = ?').runAsync(id).catch(() => {});
    for (const id of created.issues) {
      await db.prepare(`DELETE FROM ai_embeddings WHERE resource_type = 'issue' AND resource_id = ?`).runAsync(id).catch(() => {});
      await db.prepare('DELETE FROM issues WHERE id = ?').runAsync(id).catch(() => {});
    }
    if (scratchPid) {
      await db.prepare('DELETE FROM construction_schedule_items WHERE project_id = ?').runAsync(scratchPid).catch(() => {});
      await db.prepare('DELETE FROM schedule_links WHERE project_id = ?').runAsync(scratchPid).catch(() => {});
      await db.prepare('DELETE FROM notifications WHERE project_id = ?').runAsync(scratchPid).catch(() => {});
      await db.prepare('DELETE FROM zones WHERE project_id = ?').runAsync(scratchPid).catch(() => {});
      await db.prepare('DELETE FROM project_members WHERE project_id = ?').runAsync(scratchPid).catch(() => {});
      await db.prepare('DELETE FROM projects WHERE id = ?').runAsync(scratchPid).catch(() => {});
    }
  }
  if (srv) {
    srv.kill('SIGTERM');
    await new Promise(r => setTimeout(r, 1000));
  }
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS — 100% real model, no mock');
process.exit(failures ? 1 : 0);
