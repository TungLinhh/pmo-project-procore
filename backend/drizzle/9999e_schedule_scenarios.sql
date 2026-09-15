-- Compression scenarios (v0.6.0 Phase 2): preview diffs + apply/rollback ledger.
-- A scenario NEVER copies schedule rows: result JSONB holds per-item
-- before/after (dates + durations), which is also what rollback re-applies.
-- Runs last (rank 6). Idempotent.
CREATE TABLE IF NOT EXISTS schedule_scenarios (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_end_date DATE NOT NULL,
  policy JSONB NOT NULL DEFAULT '{}',
  result JSONB,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  applied_at TIMESTAMP,
  CONSTRAINT schedule_scenarios_status_check CHECK (status IN ('DRAFT', 'APPLIED', 'ROLLED_BACK'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS schedule_scenarios_project_idx ON schedule_scenarios (project_id);
--> statement-breakpoint
ALTER TABLE schedule_scenarios ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE schedule_scenarios FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS schedule_scenarios_tenant_isolation ON schedule_scenarios;
--> statement-breakpoint
CREATE POLICY schedule_scenarios_tenant_isolation ON schedule_scenarios
  USING (app_tenant_unset() OR EXISTS (SELECT 1 FROM projects p WHERE p.id = schedule_scenarios.project_id AND p.tenant_id = app_current_tenant()))
  WITH CHECK (app_tenant_unset() OR EXISTS (SELECT 1 FROM projects p WHERE p.id = schedule_scenarios.project_id AND p.tenant_id = app_current_tenant()));
--> statement-breakpoint
