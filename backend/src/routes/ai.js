// AI config + usage API (v0.7.0 §1). Admin/CEO only, Enterprise flag.
// Keys are NEVER returned — only presence booleans. Switching provider/model
// is a PUT here (effective immediately, no restart, no redeploy).
import { Router } from 'express';
import { requireAuth, requireRole } from '../lib/auth.js';
import { permissionMiddleware } from '../lib/permission-middleware.js';
import { requireFeature } from '../lib/entitlements.js';
import { getDb } from '../db/index.js';
import { withAudit } from '../lib/with-audit.js';
import { CHAT_PROVIDERS } from '../lib/ai/providers.js';
import { errorBody } from '../lib/error-body.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(permissionMiddleware);
// NOTE: NO router-wide requireRole here — this router shares the /api/ai mount
// with ai-assistant.js (/ask, /drafts), which PM/PMO/Site must reach. The old
// router-wide admin|ceo gate 403'd every non-CEO ask before the assistant
// router ever saw it. Admin/CEO-only routes below carry their own gate.
router.use(requireFeature('ai-assistant'));
const ADMIN_ONLY = [requireRole('admin', 'ceo')];

const VALID_PROVIDERS = ['openai', 'anthropic', 'google', 'openrouter'];
const DEFAULT_ENVS = { openai: 'OPENAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY', google: 'GOOGLE_API_KEY', openrouter: 'OPENROUTER_API_KEY' };
const ALLOWED_KEY_ENVS = new Set([
  ...Object.values(DEFAULT_ENVS),
  ...String(process.env.AI_ALLOWED_KEY_ENVS || '').split(',').map((value) => value.trim()).filter(Boolean),
]);
const validKeyEnv = (provider, value) => {
  const envName = value || DEFAULT_ENVS[provider];
  return ALLOWED_KEY_ENVS.has(envName);
};

function present(rows) {
  return rows.map((r) => ({
    id: r.id, purpose: r.purpose, provider: r.provider, model: r.model,
    api_key_env: r.api_key_env, key_env_valid: ALLOWED_KEY_ENVS.has(r.api_key_env),
    key_present: ALLOWED_KEY_ENVS.has(r.api_key_env) && !!process.env[r.api_key_env],
    priority: r.priority, enabled: !!r.enabled,
  }));
}

router.get('/config', ...ADMIN_ONLY, async (req, res) => {
  const db = getDb();
  const rows = await db.prepare(
    'SELECT * FROM ai_provider_configs WHERE tenant_id = ? ORDER BY purpose, priority, id'
  ).allAsync(req.user.tenant_id);
  const cap = await db.prepare('SELECT ai_monthly_cap_usd FROM tenants WHERE id = ?').getAsync(req.user.tenant_id);
  res.json({ configs: present(rows), monthly_cap_usd: Number(cap?.ai_monthly_cap_usd ?? 20), mock: process.env.AI_MOCK === '1' && process.env.NODE_ENV !== 'production' });
});

// PUT /api/ai/config { configs: [{purpose, provider, model, api_key_env?, priority?, enabled?}], monthly_cap_usd? }
// Replaces the tenant's routing table wholesale (validated, audited).
router.put('/config', ...ADMIN_ONLY, async (req, res) => {
  const db = getDb();
  const { configs, monthly_cap_usd } = req.body || {};
  if (!Array.isArray(configs) || !configs.length) return res.status(400).json({ error: 'configs[] required' });
  const seen = new Set();
  for (const c of configs) {
    if (!c || !['chat', 'embed'].includes(c.purpose)) return res.status(400).json({ error: 'purpose must be chat|embed' });
    if (!VALID_PROVIDERS.includes(c.provider)) return res.status(400).json({ error: `provider must be ${VALID_PROVIDERS.join('|')}` });
    if (!c.model || typeof c.model !== 'string' || c.model.length > 200) return res.status(400).json({ error: 'model required' });
    if (c.purpose === 'embed' && c.provider === 'anthropic') {
      return res.status(400).json({ error: 'anthropic has no embeddings API — route embed to openai/google' });
    }
    if (!validKeyEnv(c.provider, c.api_key_env)) {
      return res.status(400).json({ error: `api_key_env is not allowed for ${c.provider}` });
    }
    const key = `${c.purpose}:${c.provider}:${c.model}`;
    if (seen.has(key)) return res.status(400).json({ error: `duplicate provider route: ${key}` });
    seen.add(key);
  }
  if (!configs.some((c) => c.purpose === 'chat' && c.enabled !== false)) {
    return res.status(400).json({ error: 'at least one enabled chat route is required' });
  }
  if (!configs.some((c) => c.purpose === 'embed' && c.enabled !== false)) {
    return res.status(400).json({ error: 'at least one enabled embed route is required' });
  }
  if (monthly_cap_usd !== undefined && !(Number(monthly_cap_usd) >= 0)) {
    return res.status(400).json({ error: 'monthly_cap_usd must be >= 0' });
  }
  try {
    const out = await withAudit(req, {
      action: 'CONFIG', resourceType: 'ai_config', resourceId: req.user.tenant_id,
      after: { configs, monthly_cap_usd },
      note: `AI routing: ${configs.map((c) => `${c.purpose}→${c.provider}/${c.model}`).join(', ')}`,
    }, async (client) => {
      await client.query('DELETE FROM ai_provider_configs WHERE tenant_id = $1', [req.user.tenant_id]);
      for (let i = 0; i < configs.length; i++) {
        const c = configs[i];
        await client.query(
          `INSERT INTO ai_provider_configs (tenant_id, purpose, provider, model, api_key_env, priority, enabled)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [req.user.tenant_id, c.purpose, c.provider, c.model,
           c.api_key_env || DEFAULT_ENVS[c.provider], c.priority ?? i, c.enabled !== false]
        );
      }
      if (monthly_cap_usd !== undefined) {
        await client.query('UPDATE tenants SET ai_monthly_cap_usd = $1 WHERE id = $2', [monthly_cap_usd, req.user.tenant_id]);
      }
      // Embed model changed → index for other models goes stale.
      await client.query(
        `INSERT INTO ai_index_state (tenant_id, embed_model, stale, updated_at)
         SELECT $1, model, true, now() FROM (SELECT DISTINCT model FROM ai_provider_configs WHERE tenant_id = $1 AND purpose = 'embed') m
         ON CONFLICT (tenant_id, embed_model) DO UPDATE SET stale = true, updated_at = now()`,
        [req.user.tenant_id]
      );
      return { ok: true, count: configs.length };
    });
    res.json(out);
  } catch (e) {
    res.status(e.status || 500).json(errorBody(e));
  }
});

// POST /api/ai/test {purpose} — 1-token live check (proves key + model work).
router.post('/test', ...ADMIN_ONLY, async (req, res) => {
  const { purpose = 'chat' } = req.body || {};
  try {
    const { callChat, callEmbed } = await import('../lib/ai/providers.js');
    if (purpose === 'embed') {
      const r = await callEmbed(req.user.tenant_id, ['kiểm tra kết nối']);
      return res.json({ ok: true, provider: r.provider, model: r.model, dims: r.vectors[0]?.length });
    }
    const r = await callChat(req.user.tenant_id, { system: 'Trả lời đúng một từ: OK', user: 'ping', maxTokens: 64 });
    res.json({ ok: true, provider: r.provider, model: r.model, text: r.text.slice(0, 100) });
  } catch (e) {
    res.status(e.status || 500).json(errorBody(e));
  }
});

// GET /api/ai/usage — month-to-date spend + call counts (admin/CEO).
router.get('/usage', ...ADMIN_ONLY, async (req, res) => {
  const db = getDb();
  const rows = await db.prepare(
    `SELECT provider, model, purpose, COUNT(*)::int AS calls,
            COALESCE(SUM(tokens_in),0)::int AS tokens_in, COALESCE(SUM(tokens_out),0)::int AS tokens_out,
            COALESCE(SUM(est_cost_usd),0)::float AS est_cost_usd
     FROM ai_calls WHERE tenant_id = ? AND created_at >= date_trunc('month', now())
     GROUP BY provider, model, purpose ORDER BY est_cost_usd DESC`
  ).allAsync(req.user.tenant_id);
  const cap = await db.prepare('SELECT ai_monthly_cap_usd FROM tenants WHERE id = ?').getAsync(req.user.tenant_id);
  const spent = rows.reduce((s, r) => s + Number(r.est_cost_usd), 0);
  res.json({ rows, spent_usd: spent, cap_usd: Number(cap?.ai_monthly_cap_usd ?? 20) });
});

export default router;
export { CHAT_PROVIDERS };
