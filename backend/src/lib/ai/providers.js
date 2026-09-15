// AI provider abstraction (v0.7.0 §1): switchable chat/embed routing per tenant.
// Keys live ONLY in env; the DB stores the env var NAME (ai_provider_configs).
// Zero new npm deps — native fetch against the three REST APIs.
// AI_MOCK=1: deterministic fake adapter (unit/CI use, zero spend, no network).
import { getDb } from '../../db/index.js';

export const CHAT_PROVIDERS = ['openai', 'anthropic', 'google'];
const MOCK = process.env.AI_MOCK === '1';

// Rough $/1M-token price book (estimates for cap accounting, not billing).
// Unknown models fall back HIGH so caps stay protective.
const PRICE = [
  { re: /gpt-4o-mini/i, in: 0.15, out: 0.6 },
  { re: /gpt-4o/i, in: 2.5, out: 10 },
  { re: /text-embedding-3-small/i, in: 0.02, out: 0 },
  { re: /text-embedding/i, in: 0.13, out: 0 },
  { re: /haiku/i, in: 1, out: 5 },
  { re: /sonnet/i, in: 3, out: 15 },
  { re: /opus/i, in: 15, out: 75 },
  { re: /claude/i, in: 3, out: 15 },
  { re: /gemini.*flash/i, in: 0.1, out: 0.4 },
  { re: /gemini/i, in: 1.25, out: 5 },
  { re: /embedding/i, in: 0.05, out: 0 },
];
export function priceFor(model) {
  const hit = PRICE.find((p) => p.re.test(model || ''));
  return hit || { in: 2, out: 6 };
}
const estCost = (model, tin, tout) => {
  const p = priceFor(model);
  return Number((((tin * p.in + tout * p.out) / 1e6)).toFixed(6));
};
const estTokens = (s) => Math.ceil(String(s || '').length / 4);

async function postJson(url, headers, body, timeoutMs = 30000) {
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) return j;
      lastErr = new Error(j?.error?.message || j?.error || `provider HTTP ${r.status}`);
      lastErr.status = r.status;
      if (r.status !== 429 && r.status < 500) break; // retry only rate/5xx
    } catch (e) {
      lastErr = e;
      break; // network/abort: no retry (caller decides)
    }
  }
  throw lastErr;
}

const adapters = {
  openai: {
    async chat({ key, model, system, user, maxTokens }) {
      const j = await postJson('https://api.openai.com/v1/chat/completions',
        { Authorization: `Bearer ${key}` },
        { model, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] });
      const text = j.choices?.[0]?.message?.content || '';
      return { text, inTokens: j.usage?.prompt_tokens ?? estTokens(system + user), outTokens: j.usage?.completion_tokens ?? estTokens(text) };
    },
    async embed({ key, model, texts }) {
      const j = await postJson('https://api.openai.com/v1/embeddings',
        { Authorization: `Bearer ${key}` }, { model, input: texts });
      return { vectors: (j.data || []).map((d) => d.embedding), tokens: j.usage?.total_tokens ?? texts.reduce((s, t) => s + estTokens(t), 0) };
    },
  },
  anthropic: {
    async chat({ key, model, system, user, maxTokens }) {
      const j = await postJson('https://api.anthropic.com/v1/messages',
        { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        { model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] });
      const text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
      return { text, inTokens: j.usage?.input_tokens ?? estTokens(system + user), outTokens: j.usage?.output_tokens ?? estTokens(text) };
    },
    async embed() { throw Object.assign(new Error('anthropic has no embeddings API — route embed purpose to openai/google'), { status: 500 }); },
  },
  google: {
    async chat({ key, model, system, user, maxTokens }) {
      const j = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {},
        { system_instruction: { parts: [{ text: system }] }, contents: [{ parts: [{ text: user }] }], generationConfig: { maxOutputTokens: maxTokens } });
      const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
      return { text, inTokens: j.usageMetadata?.promptTokenCount ?? estTokens(system + user), outTokens: j.usageMetadata?.candidatesTokenCount ?? estTokens(text) };
    },
    async embed({ key, model, texts }) {
      const vectors = [];
      let tokens = 0;
      for (const t of texts) {
        const j = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${key}`, {},
          { content: { parts: [{ text: t }] } });
        vectors.push(j.embedding?.values || []);
        tokens += j.usageMetadata?.promptTokenCount ?? estTokens(t);
      }
      return { vectors, tokens };
    },
  },
};

// Deterministic mock (AI_MOCK=1): fake 1536-d unit-ish vectors from text hash,
// canned chat text. No network, zero spend.
function hash32(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const mockAdapter = {
  async chat({ user }) {
    const h = hash32(user).toString(16);
    return { text: `[MOCK ANSWER ${h}] Dựa trên ${Math.min(user.length, 999)} ký tự ngữ cảnh được truy xuất.`, inTokens: estTokens(user), outTokens: 24 };
  },
  // Semantic-preserving mock: bag-of-words hashed into 1536 dims, L2-normalized.
  // Similar texts share rare-token dims → cosine ranks them together, mirroring
  // the real embedder contract (random vectors would make ranking meaningless).
  async embed({ texts }) {
    return {
      vectors: texts.map((t) => {
        const v = new Array(1536).fill(0);
        const words = String(t).toLowerCase().split(/[^a-z0-9_à-ỹ]+/u).filter((w) => w.length > 1);
        for (const w of words) {
          const boost = w.length > 6 ? 2 : 1; // rare/long tokens pull harder
          for (let k = 0; k < 3; k++) v[hash32(w + '#' + k) % 1536] += boost;
        }
        const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
        return v.map((x) => x / norm);
      }),
      tokens: texts.reduce((n, t) => n + estTokens(t), 0),
    };
  },
};

export async function resolveAdapter(tenantId, purpose) {
  if (!['chat', 'embed'].includes(purpose)) throw Object.assign(new Error('purpose must be chat|embed'), { status: 400 });
  if (MOCK) return { provider: 'mock', model: 'mock-1', key: null, adapter: mockAdapter };
  const db = getDb();
  const rows = await db.prepare(
    `SELECT provider, model, api_key_env FROM ai_provider_configs
     WHERE tenant_id = ? AND purpose = ? AND enabled ORDER BY priority, id`
  ).allAsync(tenantId, purpose);
  if (!rows.length) {
    throw Object.assign(new Error(`no ${purpose} provider configured for this tenant (see /hq/ai-config)`), { status: 503 });
  }
  for (const r of rows) {
    const key = process.env[r.api_key_env];
    if (key) {
      const adapter = adapters[r.provider];
      if (!adapter) continue;
      if (purpose === 'embed' && r.provider === 'anthropic') continue; // checked again at call
      return { provider: r.provider, model: r.model, key, adapter };
    }
  }
  throw Object.assign(new Error(`AI key missing: set ${rows[0].api_key_env} in env (tenant routes ${purpose} → ${rows[0].provider}/${rows[0].model})`), { status: 503 });
}

async function logCall(tenantId, purpose, provider, model, tin, tout, ms, status, error) {
  const db = getDb();
  await db.prepare(
    `INSERT INTO ai_calls (tenant_id, purpose, provider, model, tokens_in, tokens_out, est_cost_usd, latency_ms, status, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).runAsync(tenantId, purpose, provider, model, tin, tout, estCost(model, tin, tout), ms, status, error || null).catch(() => {});
}

async function checkCap(tenantId) {
  const db = getDb();
  const t = await db.prepare('SELECT ai_monthly_cap_usd FROM tenants WHERE id = ?').getAsync(tenantId);
  const cap = Number(t?.ai_monthly_cap_usd ?? 20);
  const spent = await db.prepare(
    `SELECT COALESCE(SUM(est_cost_usd), 0) AS s FROM ai_calls WHERE tenant_id = ? AND created_at >= date_trunc('month', now())`
  ).getAsync(tenantId);
  if (Number(spent?.s || 0) >= cap) {
    throw Object.assign(new Error(`AI monthly cap exceeded ($${cap}) — raise tenants.ai_monthly_cap_usd`), { status: 429 });
  }
}

export async function callChat(tenantId, { system, user, maxTokens = 800 }) {
  await checkCap(tenantId);
  const { provider, model, key, adapter } = await resolveAdapter(tenantId, 'chat');
  const t0 = Date.now();
  try {
    const r = await adapter.chat({ key, model, system, user, maxTokens });
    await logCall(tenantId, 'chat', provider, model, r.inTokens, r.outTokens, Date.now() - t0, 'ok');
    return { ...r, provider, model };
  } catch (e) {
    await logCall(tenantId, 'chat', provider, model, 0, 0, Date.now() - t0, 'error', String(e.message || e).slice(0, 500));
    throw e;
  }
}

export async function callEmbed(tenantId, texts) {
  await checkCap(tenantId);
  const { provider, model, key, adapter } = await resolveAdapter(tenantId, 'embed');
  const t0 = Date.now();
  try {
    const r = await adapter.embed({ key, model, texts });
    const toks = r.tokens || 0;
    await logCall(tenantId, 'embed', provider, model, toks, 0, Date.now() - t0, 'ok');
    return { ...r, provider, model };
  } catch (e) {
    await logCall(tenantId, 'embed', provider, model, 0, 0, Date.now() - t0, 'error', String(e.message || e).slice(0, 500));
    throw e;
  }
}
