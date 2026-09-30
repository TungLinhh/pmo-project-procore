-- One overdue digest per tenant/user/day. The unique key makes cron retries and
-- manual reruns converge without duplicate in-app/email notifications.
CREATE TABLE IF NOT EXISTS attention_digest_runs (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  digest_date DATE NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  item_count INTEGER NOT NULL DEFAULT 0,
  in_app_status TEXT NOT NULL DEFAULT 'pending',
  email_status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT attention_digest_runs_uq UNIQUE (tenant_id, digest_date, user_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS attention_digest_runs_tenant_date_idx
  ON attention_digest_runs (tenant_id, digest_date DESC);
--> statement-breakpoint
ALTER TABLE attention_digest_runs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE attention_digest_runs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS attention_digest_runs_tenant_isolation ON attention_digest_runs;
--> statement-breakpoint
CREATE POLICY attention_digest_runs_tenant_isolation ON attention_digest_runs
  USING (current_setting('app.current_tenant', true) = '' OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int)
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int);
