-- ERP push profiles + log (Wave 3 C2, rank 11). Secrets NEVER in DB:
-- secret_env names the env var holding the SFTP password/key. Idempotent.
CREATE TABLE IF NOT EXISTS erp_profiles (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sftp_host TEXT NOT NULL,
  sftp_port INTEGER NOT NULL DEFAULT 22,
  sftp_user TEXT NOT NULL,
  secret_env TEXT NOT NULL,
  remote_path TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS erp_push_log (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  profile_id INTEGER REFERENCES erp_profiles(id) ON DELETE SET NULL,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  remote_file TEXT,
  bytes INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'ok',
  error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS erp_push_log_tenant_idx ON erp_push_log (tenant_id, created_at DESC);
--> statement-breakpoint
ALTER TABLE erp_profiles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE erp_profiles FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS erp_profiles_tenant_isolation ON erp_profiles;
--> statement-breakpoint
CREATE POLICY erp_profiles_tenant_isolation ON erp_profiles
  USING (app_tenant_unset() OR tenant_id = app_current_tenant())
  WITH CHECK (app_tenant_unset() OR tenant_id = app_current_tenant());
--> statement-breakpoint
ALTER TABLE erp_push_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE erp_push_log FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS erp_push_log_tenant_isolation ON erp_push_log;
--> statement-breakpoint
CREATE POLICY erp_push_log_tenant_isolation ON erp_push_log
  USING (app_tenant_unset() OR tenant_id = app_current_tenant())
  WITH CHECK (app_tenant_unset() OR tenant_id = app_current_tenant());
--> statement-breakpoint
