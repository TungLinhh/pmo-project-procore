-- AI layer foundation (v0.7.0): provider routing, semantic index, call log,
-- drafts ledger. Secrets NEVER land here — ai_provider_configs.api_key_env
-- names an env var; the key itself lives only in env. Runs last (rank 8).
-- Idempotent.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ai_monthly_cap_usd NUMERIC NOT NULL DEFAULT 20;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ai_provider_configs (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  purpose VARCHAR(10) NOT NULL,
  provider VARCHAR(20) NOT NULL,
  model TEXT NOT NULL,
  api_key_env TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT ai_provider_configs_purpose_check CHECK (purpose IN ('chat', 'embed')),
  CONSTRAINT ai_provider_configs_provider_check CHECK (provider IN ('openai', 'anthropic', 'google'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ai_provider_configs_tenant_purpose_model_uq
  ON ai_provider_configs (tenant_id, purpose, provider, model);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ai_embeddings (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  resource_type VARCHAR(50) NOT NULL,
  resource_id INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  embed_model TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ai_embeddings_resource_model_uq
  ON ai_embeddings (resource_type, resource_id, embed_model);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ai_embeddings_project_idx ON ai_embeddings (project_id);
--> statement-breakpoint
-- HNSW cosine index for scoped top-k. Built after backfill ideally; CREATE INDEX
-- IF NOT EXISTS is online-safe enough at our scale (no CONCURRENTLY in migrate).
CREATE INDEX IF NOT EXISTS ai_embeddings_hnsw_idx ON ai_embeddings
  USING hnsw (embedding vector_cosine_ops);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ai_index_state (
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  embed_model TEXT NOT NULL,
  stale BOOLEAN NOT NULL DEFAULT false,
  last_backfill_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, embed_model)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ai_calls (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  purpose VARCHAR(10) NOT NULL,
  provider VARCHAR(20) NOT NULL,
  model TEXT NOT NULL,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  est_cost_usd NUMERIC NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'ok',
  error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ai_calls_tenant_month_idx ON ai_calls (tenant_id, created_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ai_drafts (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  kind VARCHAR(50) NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  decided_at TIMESTAMP,
  CONSTRAINT ai_drafts_status_check CHECK (status IN ('pending', 'approved', 'dismissed'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ai_drafts_tenant_status_idx ON ai_drafts (tenant_id, status);
--> statement-breakpoint
ALTER TABLE ai_provider_configs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ai_provider_configs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS ai_provider_configs_tenant_isolation ON ai_provider_configs;
--> statement-breakpoint
CREATE POLICY ai_provider_configs_tenant_isolation ON ai_provider_configs
  USING (app_tenant_unset() OR tenant_id = app_current_tenant())
  WITH CHECK (app_tenant_unset() OR tenant_id = app_current_tenant());
--> statement-breakpoint
ALTER TABLE ai_embeddings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ai_embeddings FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS ai_embeddings_tenant_isolation ON ai_embeddings;
--> statement-breakpoint
CREATE POLICY ai_embeddings_tenant_isolation ON ai_embeddings
  USING (app_tenant_unset() OR tenant_id = app_current_tenant())
  WITH CHECK (app_tenant_unset() OR tenant_id = app_current_tenant());
--> statement-breakpoint
ALTER TABLE ai_index_state ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ai_index_state FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS ai_index_state_tenant_isolation ON ai_index_state;
--> statement-breakpoint
CREATE POLICY ai_index_state_tenant_isolation ON ai_index_state
  USING (app_tenant_unset() OR tenant_id = app_current_tenant())
  WITH CHECK (app_tenant_unset() OR tenant_id = app_current_tenant());
--> statement-breakpoint
ALTER TABLE ai_calls ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ai_calls FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS ai_calls_tenant_isolation ON ai_calls;
--> statement-breakpoint
CREATE POLICY ai_calls_tenant_isolation ON ai_calls
  USING (app_tenant_unset() OR tenant_id = app_current_tenant())
  WITH CHECK (app_tenant_unset() OR tenant_id = app_current_tenant());
--> statement-breakpoint
ALTER TABLE ai_drafts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ai_drafts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS ai_drafts_tenant_isolation ON ai_drafts;
--> statement-breakpoint
CREATE POLICY ai_drafts_tenant_isolation ON ai_drafts
  USING (app_tenant_unset() OR tenant_id = app_current_tenant())
  WITH CHECK (app_tenant_unset() OR tenant_id = app_current_tenant());
--> statement-breakpoint
