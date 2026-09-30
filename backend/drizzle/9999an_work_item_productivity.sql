-- Norm and actual productivity by canonical work item, period and trade.
-- This is deliberately separate from the project-level manpower plan: the
-- plan answers "how many people/week", while this table answers "how much work
-- this item produced with this trade" and can be reconciled to a daily report.
CREATE TABLE IF NOT EXISTS work_item_productivity (
  id serial PRIMARY KEY,
  project_id integer NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  work_item_id integer NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  role_name_vi text NOT NULL,
  kind text NOT NULL DEFAULT 'labor',
  planned_output numeric(18,4) NOT NULL DEFAULT 0,
  actual_output numeric(18,4) NOT NULL DEFAULT 0,
  planned_headcount numeric(18,4) NOT NULL DEFAULT 0,
  actual_headcount numeric(18,4) NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'unit',
  notes text,
  source_upload_id integer REFERENCES file_uploads(id) ON DELETE SET NULL,
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_item_productivity_period_check CHECK (period_end >= period_start),
  CONSTRAINT work_item_productivity_kind_check CHECK (kind IN ('labor', 'equipment')),
  CONSTRAINT work_item_productivity_values_check CHECK (
    planned_output >= 0 AND actual_output >= 0
    AND planned_headcount >= 0 AND actual_headcount >= 0
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS work_item_productivity_uq
  ON work_item_productivity (work_item_id, period_start, period_end, role_name_vi, kind);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS work_item_productivity_project_period_idx
  ON work_item_productivity (project_id, period_start, period_end);
--> statement-breakpoint
ALTER TABLE work_item_productivity ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE work_item_productivity FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS work_item_productivity_tenant_isolation ON work_item_productivity;
--> statement-breakpoint
CREATE POLICY work_item_productivity_tenant_isolation ON work_item_productivity
  USING (app_tenant_unset() OR EXISTS (
    SELECT 1 FROM projects p WHERE p.id = work_item_productivity.project_id AND p.tenant_id = app_current_tenant()
  ))
  WITH CHECK (app_tenant_unset() OR EXISTS (
    SELECT 1 FROM projects p WHERE p.id = work_item_productivity.project_id AND p.tenant_id = app_current_tenant()
  ));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON work_item_productivity TO pmo_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE work_item_productivity_id_seq TO pmo_app;
