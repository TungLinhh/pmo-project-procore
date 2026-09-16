-- ERP connectors v2 (Wave D4, rank 13): connector kind + generic config.
-- connector: 'sftp' (C2 behavior, default existing rows), 'fast' (FAST API),
-- 'webhook' (outbound signed events). Per-connector settings in config JSONB
-- (fast: {base_url, app_id, paths?}; webhook: {url, events[]}).
-- Secrets stay env-only (secret_env names the var) — unchanged doctrine.
ALTER TABLE erp_profiles ADD COLUMN IF NOT EXISTS connector VARCHAR(20) NOT NULL DEFAULT 'sftp';
--> statement-breakpoint
ALTER TABLE erp_profiles ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}';
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'erp_profiles_connector_check') THEN
    ALTER TABLE erp_profiles ADD CONSTRAINT erp_profiles_connector_check CHECK (connector IN ('sftp', 'fast', 'webhook'));
  END IF;
END $$;
--> statement-breakpoint
