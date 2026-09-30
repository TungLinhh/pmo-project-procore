// AI provider abstraction (v0.7.0 §1): switchable chat/embed routing per tenant.
// Keys live ONLY in env; the DB stores the env var NAME (ai_provider_configs).
// Zero new npm deps — native fetch against the three REST APIs.
// AI_MOCK=1: deterministic fake adapter (unit/CI use, zero spend, no network).
import { getDb } from '../../db/index.js';

export const CHAT_PROVIDERS = ['openai', 'anthropic', 'google', 'openrouter'];
const MOCK = process.env.AI_MOCK === '1' && process.env.NODE_ENV !== 'production';

// Rough $/1M-token price book (estimates for cap accounting, not billing).
// Unknown models fall back HIGH so caps stay protective.
// Free-tier models (OpenRouter :free) cost nothing — matched first.
const PRICE = [
  { re: /:free$/i, in: 0, out: 0 },
  { re: /nemotron/i, in: 0, out: 0 },
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
const estCost = (provider, model, tin, tout) => {
  if (provider === 'mock' || String(model || '').startsWith('mock')) return 0;
  const p = priceFor(model);
  return Number((((tin * p.in + tout * p.out) / 1e6)).toFixed(6));
};
const estTokens = (s) => Math.ceil(String(s || '').length / 4);

// Latency classes. The reasoning models (Nemotron, Space Bunny) spend part of
// the wall clock on internal reasoning before emitting any user-facing token:
// measured Nemotron successes averaged 9.8s but its range reached 15.9s, and
// with retrieved project context it regularly needs 25-45s. A single flat 15s
// timeout therefore cut off most primary calls, which surfaced as
// "Model trả về rỗng" after two aborted attempts (~30s total) and pushed the
// request onto the fallback. Reasoning models get their own, longer budget.
const isReasoningModel = (model) => /nemotron|space-bunny|reasoning|thinking/i.test(String(model || ''));
const timeoutFor = (model) => (isReasoningModel(model)
  ? Number(process.env.AI_REASONING_TIMEOUT_MS) || 120000
  : Number(process.env.AI_PROVIDER_TIMEOUT_MS) || 15000);

async function postJson(url, headers, body, timeoutMs = 15000) {
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
      });
      const j = await r.json().catch(() => ({}));
      // OpenRouter bao loi provider (overloaded...) trong body HTTP 200 —
      // phai coi nhu that bai, khong duoc tra choices rong ve caller.
      if (j && typeof j === 'object' && j.error && !j.choices && !j.data) {
        const message = typeof j.error === 'string' ? j.error : (j.error.message || 'provider error');
        lastErr = new Error(message);
        const numericCode = Number(j.error.code);
        lastErr.status = Number.isFinite(numericCode) && numericCode >= 400
          ? numericCode
          : /quota|rate.?limit|balance|free-models-per-day/i.test(message) ? 429 : 502;
        if (lastErr.status !== 429 && lastErr.status < 500) break;
        continue; // overloaded/5xx trong body: thu lai 1 lan nhu HTTP 5xx
      }
      if (r.ok) return j;
      lastErr = new Error(j?.error?.message || j?.error || `provider HTTP ${r.status}`);
      lastErr.status = r.status;
      if (r.status !== 429 && r.status < 500) break; // retry only rate/5xx
    } catch (e) {
      lastErr = e;
      // An abort is a timeout, which is retryable for slow reasoning models —
      // that is the exact case a longer budget is meant to cover.
      if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
        lastErr = new Error(`provider timeout after ${timeoutMs}ms`);
        lastErr.status = 504;
        lastErr.retryable = true;
      }
      break; // network/abort: no retry inside postJson (callChat decides)
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
        { Authorization: `Bearer ${key}` }, { model, input: texts, ...(model.includes('text-embedding-3') ? { dimensions: 2048 } : {}) });
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
      const j = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {},
        { system_instruction: { parts: [{ text: system }] }, contents: [{ parts: [{ text: user }] }], generationConfig: { maxOutputTokens: maxTokens } });
      const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
      return { text, inTokens: j.usageMetadata?.promptTokenCount ?? estTokens(system + user), outTokens: j.usageMetadata?.candidatesTokenCount ?? estTokens(text) };
    },
    async embed({ key, model, texts }) {
      const vectors = [];
      let tokens = 0;
      for (const t of texts) {
        const j = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:embedContent?key=${encodeURIComponent(key)}`, {},
          { content: { parts: [{ text: t }] } });
        vectors.push(j.embedding?.values || []);
        tokens += j.usageMetadata?.promptTokenCount ?? estTokens(t);
      }
      return { vectors, tokens };
    },
  },
  // OpenRouter: OpenAI-compatible gateway (https://openrouter.ai/docs).
  // Model ids are provider-qualified, e.g. 'nvidia/nemotron-3-ultra-550b-a55b:free'.
  // Chat + embeddings share the same base + Bearer key. HTTP-Referer/X-Title
  // are optional attribution headers (harmless without a configured domain).
  openrouter: {
    async chat({ key, model, system, user, maxTokens, onMeta }) {
      const j = await postJson('https://openrouter.ai/api/v1/chat/completions',
        {
          Authorization: `Bearer ${key}`,
          'HTTP-Referer': process.env.OPENROUTER_REFERER || 'http://localhost:3000',
          'X-Title': process.env.OPENROUTER_TITLE || 'PMO Assistant',
        },
        {
          model,
          max_tokens: maxTokens,
          ...(isReasoningModel(model) ? { reasoning: { effort: 'low' } } : {}),
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        },
        timeoutFor(model));
      const choice = j.choices?.[0];
      const msg = choice?.message || {};
      // Surface why a completion came back empty. With retrieved project
      // context the reasoning model writes 600-3000 characters of thinking; when
      // that exceeds the completion budget, `content` is empty with
      // finish_reason='length' and the caller must widen the budget, not retry
      // the same size.
      if (typeof onMeta === 'function') {
        onMeta({
          finishReason: choice?.finish_reason ?? null,
          reasoningLength: String(msg.reasoning ?? msg.reasoning_content ?? '').length,
          contentLength: String(msg.content ?? '').length,
        });
      }
      const text = msg.content || '';
      return { text, inTokens: j.usage?.prompt_tokens ?? estTokens(system + user), outTokens: j.usage?.completion_tokens ?? estTokens(text) };
    },
    async embed({ key, model, texts }) {
      const j = await postJson('https://openrouter.ai/api/v1/embeddings',
        {
          Authorization: `Bearer ${key}`,
          'HTTP-Referer': process.env.OPENROUTER_REFERER || 'http://localhost:3000',
          'X-Title': process.env.OPENROUTER_TITLE || 'PMO Assistant',
        },
        { model, input: texts, ...(model.includes('text-embedding-3') ? { dimensions: 2048 } : {}) },
        timeoutFor(model));
      return { vectors: (j.data || []).map((d) => d.embedding), tokens: j.usage?.total_tokens ?? texts.reduce((s, t) => s + estTokens(t), 0) };
    },
  },
};

// Deterministic mock (AI_MOCK=1): fake 2048-d unit-ish vectors from text hash,
// canned chat text. No network, zero spend. Dims track the real free embedder
// (nemotron-3-embed-1b, native 2048) so mock backfills fit vector(2048).
function hash32(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const mockAdapter = {
  async chat({ user }) {
    const h = hash32(user).toString(16);
    const citation = String(user).match(/\[#[a-z_]+:\d+\]/i)?.[0] || '';
    return { text: `[MOCK ANSWER ${h}] Vai trò và phòng ban đã nhận diện. Dự án, quyết định, hạng mục, gate, quá hạn, báo cáo, vật tư, MSB, giao, shopdrawing, duyệt, thanh toán, payment và retention đều cần kiểm tra bằng citation. Nếu ngữ cảnh không đủ thì trả lời: không đủ dữ liệu.${citation ? ` ${citation}` : ''}`, inTokens: estTokens(user), outTokens: 24 };
  },
  // Semantic-preserving mock: bag-of-words hashed into 2048 dims, L2-normalized.
  // Similar texts share rare-token dims → cosine ranks them together, mirroring
  // the real embedder contract (random vectors would make ranking meaningless).
  async embed({ texts }) {
    return {
      vectors: texts.map((t) => {
        const v = new Array(2048).fill(0);
        const words = String(t).toLowerCase().split(/[^a-z0-9_à-ỹ]+/u).filter((w) => w.length > 1);
        for (const w of words) {
          const boost = w.length > 6 ? 2 : 1; // rare/long tokens pull harder
          for (let k = 0; k < 3; k++) v[hash32(w + '#' + k) % 2048] += boost;
        }
        const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
        return v.map((x) => x / norm);
      }),
      tokens: texts.reduce((n, t) => n + estTokens(t), 0),
    };
  },
};

export async function resolveAdapters(tenantId, purpose) {
  if (!['chat', 'embed'].includes(purpose)) throw Object.assign(new Error('purpose must be chat|embed'), { status: 400 });
  if (MOCK) return [{ provider: 'mock', model: 'mock-1', key: null, adapter: mockAdapter }];
  const db = getDb();
  const rows = await db.prepare(
    `SELECT provider, model, api_key_env FROM ai_provider_configs
     WHERE tenant_id = ? AND purpose = ? AND enabled ORDER BY priority, id`
  ).allAsync(tenantId, purpose);
  if (!rows.length) {
    throw Object.assign(new Error(`no ${purpose} provider configured for this tenant (see /hq/ai-config)`), { status: 503 });
  }
  const resolved = [];
  for (const row of rows) {
    const key = process.env[row.api_key_env];
    const adapter = adapters[row.provider];
    if (!key || !adapter || (purpose === 'embed' && row.provider === 'anthropic')) continue;
    resolved.push({ provider: row.provider, model: row.model, key, adapter });
  }
  if (!resolved.length) {
    throw Object.assign(new Error(`AI key missing: set ${rows[0].api_key_env} in env (tenant routes ${purpose} → ${rows[0].provider}/${rows[0].model})`), { status: 503 });
  }
  // A tenant may keep one provider key while routing a second model as a
  // transient fallback. It is opt-in so an unconfigured deployment never
  // silently changes model or spend policy.
  if (purpose === 'chat' && process.env.AI_CHAT_FALLBACK_MODEL) {
    const primary = resolved[0];
    const fallbackProvider = process.env.AI_CHAT_FALLBACK_PROVIDER || primary.provider;
    const fallbackKeyEnv = process.env.AI_CHAT_FALLBACK_API_KEY_ENV
      || (fallbackProvider === primary.provider ? primary.key : null);
    const fallbackAdapter = adapters[fallbackProvider];
    const fallbackKey = fallbackKeyEnv && process.env[fallbackKeyEnv] ? process.env[fallbackKeyEnv]
      : (fallbackProvider === primary.provider ? primary.key : null);
    if (fallbackAdapter && fallbackKey && !resolved.some((row) => row.provider === fallbackProvider && row.model === process.env.AI_CHAT_FALLBACK_MODEL)) {
      resolved.push({ provider: fallbackProvider, model: process.env.AI_CHAT_FALLBACK_MODEL, key: fallbackKey, adapter: fallbackAdapter });
    }
  }
  return resolved;
}

export async function resolveAdapter(tenantId, purpose) {
  return (await resolveAdapters(tenantId, purpose))[0];
}

async function logCall(tenantId, purpose, provider, model, tin, tout, ms, status, error) {
  const db = getDb();
  await db.prepare(
    `INSERT INTO ai_calls (tenant_id, purpose, provider, model, tokens_in, tokens_out, est_cost_usd, latency_ms, status, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).runAsync(tenantId, purpose, provider, model, tin, tout, estCost(provider, model, tin, tout), ms, status, error || null).catch(() => {});
}

async function checkCap(tenantId) {
  const db = getDb();
  const t = await db.prepare('SELECT ai_monthly_cap_usd FROM tenants WHERE id = ?').getAsync(tenantId);
  const envCapRaw = String(process.env.AI_MONTHLY_CAP_USD || '').trim();
  const envCap = envCapRaw ? Number(envCapRaw) : NaN;
  const cap = Number.isFinite(envCap) && envCap >= 0 ? envCap : Number(t?.ai_monthly_cap_usd ?? 20);
  const spent = await db.prepare(
    `SELECT COALESCE(SUM(est_cost_usd), 0) AS s FROM ai_calls WHERE tenant_id = ? AND created_at >= date_trunc('month', now())`
  ).getAsync(tenantId);
  if (Number(spent?.s || 0) >= cap) {
    throw Object.assign(new Error(`AI monthly cap exceeded ($${cap}) — raise tenants.ai_monthly_cap_usd`), { status: 429 });
  }
}

export async function callChat(tenantId, { system, user, maxTokens = 800 }) {
  await checkCap(tenantId);
  const candidates = await resolveAdapters(tenantId, 'chat');
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const retryDelayMs = Math.max(0, Number(process.env.AI_RETRY_DELAY_MS) || 1500);
  // A single user-facing request must not hang forever: once the budget is
  // spent we stop trying candidates and return the last real error.
  const budgetMs = Number(process.env.AI_TOTAL_BUDGET_MS) || 300000;
  const startedAt = Date.now();
  const promptChars = String(system || '').length + String(user || '').length;
  let lastError = null;
  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex++) {
    const candidate = candidates[candidateIndex];
    const { provider, model, key, adapter } = candidate;
    const slow = isReasoningModel(model);
    // Budget scales with the prompt. Measured: a 4k-character prompt makes the
    // reasoning model emit 600-3000 characters of thinking, which at a fixed
    // 1600-token ceiling sometimes consumed the whole completion and returned
    // an empty `content`. Give long prompts proportionally more room.
    const contextFloor = slow ? Math.min(4096, Math.max(1600, Math.ceil(promptChars / 2))) : maxTokens;
    const candidateMaxTokens = slow ? Math.max(maxTokens, contextFloor) : maxTokens;
    // The primary gets the patient budget: it is the route we actually measure.
    // A fallback only runs after the primary is genuinely exhausted.
    const maxAttempts = slow ? 3 : 2;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (Date.now() - startedAt > budgetMs) {
        lastError = lastError || Object.assign(new Error('AI request budget exhausted'), { status: 504 });
        break;
      }
      const t0 = Date.now();
      const meta = {};
      // Each retry widens the budget when the previous one was truncated.
      const attemptTokens = attempt === 0
        ? candidateMaxTokens
        : Math.min(4096, candidateMaxTokens + (attempt * Math.max(512, Math.floor(candidateMaxTokens / 2))));
      try {
        let result = await adapter.chat({ key, model, system, user, maxTokens: attemptTokens, onMeta: (m) => Object.assign(meta, m) });
        if (!String(result.text || '').trim() && attempt < maxAttempts - 1) {
          // Empty completion: back off and retry with a wider budget so a
          // reasoning model that spent everything on thinking can still emit.
          await sleep(retryDelayMs * (attempt + 1));
          result = await adapter.chat({
            key, model, system, user, maxTokens: Math.min(4096, attemptTokens * 2), onMeta: (m) => Object.assign(meta, m),
          });
        }
        if (!String(result.text || '').trim()) {
          const why = meta.finishReason === 'length'
            ? ' (hết budget trước khi sinh câu trả lời)'
            : (meta.reasoningLength ? ` (reasoning ${meta.reasoningLength} ký tự, nội dung rỗng)` : '');
          throw Object.assign(new Error(`Model trả về rỗng; thử lại sau${why}`), { status: 502 });
        }
        await logCall(tenantId, 'chat', provider, model, result.inTokens, result.outTokens, Date.now() - t0, 'ok');
        return {
          ...result, provider, model,
          route_status: candidateIndex === 0 ? 'primary' : 'fallback',
          fallback: candidateIndex > 0,
          attempts: attempt + 1,
        };
      } catch (error) {
        lastError = error;
        const status = Number(error.status) || 0;
        await logCall(tenantId, 'chat', provider, model, 0, 0, Date.now() - t0, 'error', String(error.message || error).slice(0, 500));
        const retryable = status === 429 || status === 502 || status === 503 || status === 504 || error?.retryable;
        if (attempt < maxAttempts - 1 && retryable) {
          await sleep(retryDelayMs * (attempt + 1));
          continue;
        }
        break;
      }
    }
  }
  throw lastError || Object.assign(new Error('No chat provider completed the request'), { status: 502 });
}

export async function callEmbed(tenantId, texts) {
  await checkCap(tenantId);
  const { provider, model, key, adapter } = await resolveAdapter(tenantId, 'embed');
  const t0 = Date.now();
  try {
    const r = await adapter.embed({ key, model, texts });
    if (!Array.isArray(r.vectors) || r.vectors.some((vector) => vector.length !== 2048)) {
      throw Object.assign(new Error(`embedding model ${model} must return 2048 dimensions`), { status: 422 });
    }
    const toks = r.tokens || 0;
    await logCall(tenantId, 'embed', provider, model, toks, 0, Date.now() - t0, 'ok');
    return { ...r, provider, model };
  } catch (e) {
    await logCall(tenantId, 'embed', provider, model, 0, 0, Date.now() - t0, 'error', String(e.message || e).slice(0, 500));
    throw e;
  }
}
