-- OpenRouter provider (real model via https://openrouter.ai): widen the
-- ai_provider_configs provider CHECK. Idempotent. Runs last (rank 15).
ALTER TABLE ai_provider_configs DROP CONSTRAINT IF EXISTS ai_provider_configs_provider_check;
--> statement-breakpoint
ALTER TABLE ai_provider_configs ADD CONSTRAINT ai_provider_configs_provider_check CHECK (provider IN ('openai', 'anthropic', 'google', 'openrouter'));
--> statement-breakpoint
