-- Add a second chat route for tenants that already use OpenRouter.
-- The primary Nemotron route remains first; Space Bunny is used only after
-- rate-limit, timeout, or empty-response retries fail.
INSERT INTO ai_provider_configs
  (tenant_id, purpose, provider, model, api_key_env, priority, enabled)
SELECT DISTINCT
  tenant_id,
  'chat',
  'openrouter',
  'stealth/space-bunny-alpha',
  'OPENROUTER_API_KEY',
  priority + 1,
  true
FROM ai_provider_configs
WHERE purpose = 'chat'
  AND provider = 'openrouter'
  AND model = 'nvidia/nemotron-3-ultra-550b-a55b:free'
ON CONFLICT (tenant_id, purpose, provider, model)
DO UPDATE SET priority = EXCLUDED.priority, enabled = true;
