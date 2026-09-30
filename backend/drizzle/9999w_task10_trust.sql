-- Task 10 (SRS NFR Bao mat + SRS 6 SSO): tin cay du lieu ca nhan & dang nhap ngoai.
--   users.locale/sso_subject/sso_issuer, sso_configs (1 row/tenant),
--   pdpl_consents (dong y theo muc dich), pdpl_requests (DSR queue).
-- Rank 24. Idempotent. RLS theo mau 9999t (second-hop qua projects/users join).
ALTER TABLE users ADD COLUMN IF NOT EXISTS locale varchar(5) NOT NULL DEFAULT 'vi';
--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS sso_subject text;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS sso_issuer text;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS sso_configs (
  tenant_id integer PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  issuer text NOT NULL,
  client_id text NOT NULL,
  secret_env text NOT NULL DEFAULT 'SSO_CLIENT_SECRET',
  enabled boolean NOT NULL DEFAULT false,
  auto_provision boolean NOT NULL DEFAULT false,
  default_role text NOT NULL DEFAULT 'site',
  updated_by integer REFERENCES users(id),
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT sso_configs_role_check CHECK (default_role IN ('pm','pmo','site','procurement','accounting','admin'))
);
--> statement-breakpoint
ALTER TABLE sso_configs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE sso_configs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS sso_configs_tenant_isolation ON sso_configs;
--> statement-breakpoint
CREATE POLICY sso_configs_tenant_isolation ON sso_configs
  USING (app_tenant_unset() OR tenant_id = app_current_tenant())
  WITH CHECK (app_tenant_unset() OR tenant_id = app_current_tenant());
--> statement-breakpoint

-- PDPL: dong y xu ly du lieu ca nhan theo tung muc dich (account/notify/analytics).
CREATE TABLE IF NOT EXISTS pdpl_consents (
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  purpose text NOT NULL,
  granted boolean NOT NULL DEFAULT false,
  policy_version text NOT NULL DEFAULT '2026-09-v1',
  decided_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (user_id, purpose),
  CONSTRAINT pdpl_consents_purpose_check CHECK (purpose IN ('account','notify','analytics'))
);
--> statement-breakpoint
ALTER TABLE pdpl_consents ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE pdpl_consents FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS pdpl_consents_tenant_isolation ON pdpl_consents;
--> statement-breakpoint
CREATE POLICY pdpl_consents_tenant_isolation ON pdpl_consents
  USING (app_tenant_unset() OR tenant_id = app_current_tenant())
  WITH CHECK (app_tenant_unset() OR tenant_id = app_current_tenant());
--> statement-breakpoint

-- PDPL: hang doi yeu cau cua chu the du lieu (truy xuat / hieu chinh / xoa).
CREATE TABLE IF NOT EXISTS pdpl_requests (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  detail text,
  resolved_by integer REFERENCES users(id),
  resolved_at timestamptz,
  resolve_note text,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT pdpl_requests_type_check CHECK (type IN ('ACCESS','RECTIFY','ERASE')),
  CONSTRAINT pdpl_requests_status_check CHECK (status IN ('PENDING','DONE','REJECTED'))
);
--> statement-breakpoint
ALTER TABLE pdpl_requests ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE pdpl_requests FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS pdpl_requests_tenant_isolation ON pdpl_requests;
--> statement-breakpoint
CREATE POLICY pdpl_requests_tenant_isolation ON pdpl_requests
  USING (app_tenant_unset() OR tenant_id = app_current_tenant())
  WITH CHECK (app_tenant_unset() OR tenant_id = app_current_tenant());
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS pdpl_requests_tenant_status_idx ON pdpl_requests (tenant_id, status);
--> statement-breakpoint
