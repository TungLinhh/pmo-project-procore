// AI assistant e2e (v0.7.0): pgvector guard, config switching, backfill,
// scoped ask with citations, cross-tenant invisibility, drafts approve/dismiss,
// SLA watcher drafts + dedupe. Runs in AI_MOCK=1 (zero spend, no network).
// Self-cleaning (HBG scratch rows removed in finally).
// Run: node tests/e2e/ai-assistant.mjs (spawns its own server, needs dev DB)
import { spawn } from 'node:child_process';

// The SLA watcher is imported INTO this process (not the spawned server), so
// mock mode must be set here too — otherwise it attempts real provider calls.
process.env.AI_MOCK = '1';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3114';
const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3114', AI_MOCK: '1' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 3500));

const created = { issues: [], submittals: [], drafts: [], embeddings: [] };
// Baseline embedding ids (dev DB may hold rows from earlier runs): anything NOT
// in this set afterwards was caused by this test (mock vectors must never leak
// into a future REAL backfill, which skips already-embedded rows).
let baselineEmbeddings = new Set();
let hbgTenant = null;
try {
  const loginAs = async (email) => fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'admin123' }) }).then(r => r.json()).then(j => j.token);
  const adminT = await loginAs('admin@hbg.com');
  const pilotT = await loginAs('admin@pilot.test');
  ok(!!adminT && !!pilotT, 'both logins');
  const H = (t) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });
  const call = (t, m, p, b) => fetch(BASE + p, { method: m, headers: H(t), body: b ? JSON.stringify(b) : undefined }).then(async r => ({ s: r.status, j: await r.json().catch(() => null) }));

  const { getDb } = await import('../../backend/src/db/index.js');
  const db = getDb();
  hbgTenant = await db.prepare(`SELECT id FROM tenants WHERE code = 'hbg'`).getAsync();
  baselineEmbeddings = new Set((await db.prepare('SELECT id FROM ai_embeddings WHERE tenant_id = ?').allAsync(hbgTenant.id)).map((r) => r.id));

  // 0. pgvector present (fail loud if the §0 provisioning regresses).
  const ext = await db.prepare(`SELECT 1 FROM pg_extension WHERE extname = 'vector'`).getAsync();
  ok(!!ext, 'pgvector extension installed');

  // 1. Config validation + switching (mock: no keys needed).
  const bad1 = await call(adminT, 'PUT', '/api/ai/config', { configs: [{ purpose: 'embed', provider: 'anthropic', model: 'x' }] });
  ok(bad1.s === 400, `anthropic embed rejected (got ${bad1.s})`);
  const bad2 = await call(adminT, 'PUT', '/api/ai/config', { configs: [{ purpose: 'chat', provider: 'nope', model: 'x' }] });
  ok(bad2.s === 400, `bad provider rejected (got ${bad2.s})`);
  const cfg = await call(adminT, 'PUT', '/api/ai/config', { configs: [
    { purpose: 'chat', provider: 'openai', model: 'gpt-4o-mini' },
    { purpose: 'embed', provider: 'openai', model: 'text-embedding-3-small' },
  ]});
  ok(cfg.s === 200 && cfg.j.count === 2, `routing stored (got ${cfg.s})`);
  const cfgGet = await call(adminT, 'GET', '/api/ai/config');
  ok(cfgGet.j.configs.length === 2 && cfgGet.j.configs.every((c) => !('api_key' in c) || typeof c.api_key_env === 'string'), 'keys never leak (only env names)');
  // Switch chat to anthropic anytime (mock still answers — routing is what we assert).
  const sw = await call(adminT, 'PUT', '/api/ai/config', { configs: [
    { purpose: 'chat', provider: 'anthropic', model: 'claude-3-5-haiku-latest' },
    { purpose: 'embed', provider: 'openai', model: 'text-embedding-3-small' },
  ]});
  ok(sw.s === 200, 'provider switch anytime');
  const swGet = await call(adminT, 'GET', '/api/ai/config');
  ok(swGet.j.configs.find((c) => c.purpose === 'chat').provider === 'anthropic', 'switch effective immediately');
  // Small plan gated.
  const g0 = await call(pilotT, 'GET', '/api/ai/config');
  ok(g0.s === 403, `small config → 403 (got ${g0.s})`);
  const g0b = await call(pilotT, 'POST', '/api/ai/ask', { question: 'hi' });
  ok(g0b.s === 403, `small ask → 403 (got ${g0b.s})`);

  // 2. Seed 2 distinctive HBG issues + 1 pilot decoy embedding (direct SQL).
  const hbg = await db.prepare(`SELECT id, tenant_id FROM projects WHERE code = 'BTE-WP4-HBC'`).getAsync();
  const pilot = await db.prepare(`SELECT id, tenant_id FROM projects WHERE code = 'PILOT-001'`).getAsync();
  for (const [title, body] of [['ZXYQVT Alpha boiler', 'ZXYQVT Alpha áp suất van xả cần kiểm tra'], ['ZXYQVT Bravo pump', 'ZXYQVT Bravo máy bơm rung bất thường']]) {
    const r = await db.prepare(
      `INSERT INTO issues (tenant_id, project_id, title, body, severity, status) VALUES (?, ?, ?, ?, 'MEDIUM', 'OPEN') RETURNING id`
    ).runAsync(hbg.tenant_id, hbg.id, title, body);
    created.issues.push(Number(r.lastInsertRowid));
  }
  const pilotIssue = await db.prepare(
    `INSERT INTO issues (tenant_id, project_id, title, body, severity, status) VALUES (?, ?, 'ZXYQVT Pilot secret', 'must never surface to HBG', 'HIGH', 'OPEN') RETURNING id`
  ).runAsync(pilot.tenant_id, pilot.id);
  created.issues.push(Number(pilotIssue.lastInsertRowid));
  // Decoy: pilot embedding row (tenant 2) with HBG-matching text.
  const fakeVec = `[${new Array(1536).fill(0.001).join(',')}]`;
  const decoy = await db.prepare(
    `INSERT INTO ai_embeddings (tenant_id, project_id, resource_type, resource_id, chunk_text, embedding, embed_model)
     VALUES (?, ?, 'issue', ?, 'ZXYQVT Alpha pilot decoy', ?::vector, 'text-embedding-3-small') RETURNING id`
  ).runAsync(pilot.tenant_id, pilot.id, created.issues[2], fakeVec);
  created.embeddings.push(Number(decoy.lastInsertRowid));

  // 3. Backfill embeds the 2 HBG issues (mock vectors).
  const bf = await call(adminT, 'POST', '/api/ai/backfill');
  ok(bf.s === 200 && bf.j.embedded >= 2, `backfill embedded ≥2 (got ${bf.s}/${bf.j?.embedded})`);

  // 4. Scoped ask: cites HBG issues, never the pilot decoy.
  const ask = await call(adminT, 'POST', '/api/ai/ask', { question: 'ZXYQVT Alpha van xả thế nào?' });
  ok(ask.s === 200 && typeof ask.j.answer === 'string', `ask 200 (got ${ask.s})`);
  const cited = (ask.j.citations || []).map((c) => c.resource_id);
  ok(cited.includes(created.issues[0]), `cites HBG Alpha issue (cited ${JSON.stringify(cited)})`);
  ok(!cited.includes(created.issues[2]), 'pilot decoy invisible to HBG');
  // Empty retrieval → honest no-data (nonsense token matches nothing... mock embeds
  // everything, so scope to an empty project instead: create nothing, ask with
  // project filter on PILOT-001 as HBG admin → 404 cross-tenant).
  const ask404 = await call(adminT, 'POST', '/api/ai/ask', { question: 'x', project_id: pilot.id });
  ok(ask404.s === 404, `cross-tenant ask → 404 (got ${ask404.s})`);
  const askBad = await call(adminT, 'POST', '/api/ai/ask', { question: '' });
  ok(askBad.s === 400, `empty question → 400 (got ${askBad.s})`);

  // 5. Drafts inbox: insert pending → approve → 409 → dismiss another.
  const d1 = await db.prepare(
    `INSERT INTO ai_drafts (tenant_id, project_id, kind, title, body, payload) VALUES (?, ?, 'test_kind', 'T1', 'B1', '{}') RETURNING id`
  ).runAsync(hbg.tenant_id, hbg.id);
  const d2 = await db.prepare(
    `INSERT INTO ai_drafts (tenant_id, project_id, kind, title, body, payload) VALUES (?, ?, 'test_kind', 'T2', 'B2', '{}') RETURNING id`
  ).runAsync(hbg.tenant_id, hbg.id);
  created.drafts.push(Number(d1.lastInsertRowid), Number(d2.lastInsertRowid));
  const ap = await call(adminT, 'POST', `/api/ai/drafts/${d1.lastInsertRowid}/approve`);
  ok(ap.s === 200, `approve (got ${ap.s})`);
  const ap2 = await call(adminT, 'POST', `/api/ai/drafts/${d1.lastInsertRowid}/approve`);
  ok(ap2.s === 409, `re-approve → 409 (got ${ap2.s})`);
  const dis = await call(adminT, 'POST', `/api/ai/drafts/${d2.lastInsertRowid}/dismiss`);
  ok(dis.s === 200, `dismiss (got ${dis.s})`);

  // 6. SLA watcher: overdue submittal → draft, dedupe on rerun.
  const sub = await db.prepare(
    `INSERT INTO material_submittals (project_id, submittal_code, status, sla_days, sla_deadline, supervisor_approval_days, supervisor_deadline)
     VALUES (?, 'AIWATCH-001', 'SUBMITTED', 7, CURRENT_DATE - 2, 3, CURRENT_DATE - 1) RETURNING id`
  ).runAsync(hbg.id);
  created.submittals.push(Number(sub.lastInsertRowid));
  const { runAiSlaWatch } = await import('../../backend/src/lib/ai/watcher.js');
  const w1 = await runAiSlaWatch({ maxDrafts: 20 });
  ok(w1.drafted_count >= 1, `watcher drafts ≥1 (got ${w1.drafted_count})`);
  const wd = await db.prepare(`SELECT * FROM ai_drafts WHERE kind = 'sla_nudge' AND payload->>'submittal_id' = ? AND status = 'pending'`).getAsync(String(sub.lastInsertRowid));
  ok(!!wd && wd.body.length > 10, 'draft has LLM body');
  created.drafts.push(wd.id);
  const w2 = await runAiSlaWatch({ maxDrafts: 20 });
  const stillOne = await db.prepare(`SELECT COUNT(*)::int AS n FROM ai_drafts WHERE kind = 'sla_nudge' AND payload->>'submittal_id' = ?`).getAsync(String(sub.lastInsertRowid));
  ok(stillOne.n === 1, `dedupe: rerun adds nothing (got ${stillOne.n})`);

  // 7. Usage endpoint reflects mock calls.
  const usage = await call(adminT, 'GET', '/api/ai/usage');
  ok(usage.s === 200 && usage.j.spent_usd >= 0 && Array.isArray(usage.j.rows), 'usage endpoint');
} finally {
  if (created.submittals.length || created.issues.length || created.drafts.length || created.embeddings.length) {
    const { getDb } = await import('../../backend/src/db/index.js');
    const db = getDb();
    for (const id of created.submittals) await db.prepare('DELETE FROM material_submittals WHERE id = ?').runAsync(id).catch(() => {});
    for (const id of created.drafts) await db.prepare('DELETE FROM ai_drafts WHERE id = ?').runAsync(id).catch(() => {});
    for (const id of created.embeddings) await db.prepare('DELETE FROM ai_embeddings WHERE id = ?').runAsync(id).catch(() => {});
    for (const id of created.issues) await db.prepare('DELETE FROM issues WHERE id = ?').runAsync(id).catch(() => {});
    // HBG backfilled embeddings reference issues by id — sweep leftovers.
    for (const id of created.issues) await db.prepare(`DELETE FROM ai_embeddings WHERE resource_type = 'issue' AND resource_id = ?`).runAsync(id).catch(() => {});
    // Mock-vector hygiene: remove any embedding this run created beyond baseline.
    const now = new Set((await db.prepare('SELECT id FROM ai_embeddings WHERE tenant_id = ?').allAsync(hbgTenant.id)).map((r) => r.id));
    for (const id of now) {
      if (!baselineEmbeddings.has(id)) await db.prepare('DELETE FROM ai_embeddings WHERE id = ?').runAsync(id).catch(() => {});
    }
    // Restore HBG AI routing to a sane default (test switched chat to anthropic).
    await db.prepare(`DELETE FROM ai_provider_configs WHERE tenant_id = (SELECT id FROM tenants WHERE code = 'hbg')`).runAsync().catch(() => {});
  }
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
