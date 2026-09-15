-- Schedule dependency links (v0.6.0 Phase 0): FS/SS/FF predecessor graph over
-- construction_schedule_items. The CPM engine + compression (later phases) read
-- this table; nothing else depends on it yet.
-- Runs after every table exists (rank 5 in migrate.js) so the RLS policy and
-- FKs resolve on fresh DBs too. Idempotent.
CREATE TABLE IF NOT EXISTS schedule_links (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  predecessor_id INTEGER NOT NULL REFERENCES construction_schedule_items(id) ON DELETE CASCADE,
  successor_id INTEGER NOT NULL REFERENCES construction_schedule_items(id) ON DELETE CASCADE,
  link_type VARCHAR(10) NOT NULL DEFAULT 'FS',
  lag_days INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT schedule_links_no_self CHECK (predecessor_id != successor_id),
  CONSTRAINT schedule_links_type_check CHECK (link_type IN ('FS', 'SS', 'FF')),
  CONSTRAINT schedule_links_lag_check CHECK (lag_days >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS schedule_links_pred_succ_uq ON schedule_links (predecessor_id, successor_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS schedule_links_project_idx ON schedule_links (project_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS schedule_links_succ_idx ON schedule_links (successor_id);
--> statement-breakpoint
ALTER TABLE schedule_links ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE schedule_links FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS schedule_links_tenant_isolation ON schedule_links;
--> statement-breakpoint
CREATE POLICY schedule_links_tenant_isolation ON schedule_links
  USING (app_tenant_unset() OR EXISTS (SELECT 1 FROM projects p WHERE p.id = schedule_links.project_id AND p.tenant_id = app_current_tenant()))
  WITH CHECK (app_tenant_unset() OR EXISTS (SELECT 1 FROM projects p WHERE p.id = schedule_links.project_id AND p.tenant_id = app_current_tenant()));
--> statement-breakpoint
