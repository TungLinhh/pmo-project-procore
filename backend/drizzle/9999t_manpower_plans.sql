-- Manpower plans (SRS FR-1.3: kế hoạch huy động vs. thực tế theo tuần).
-- PMO nhập kế hoạch (như KPI targets); thực tế từ daily_manpower.
-- week_start luôn là thứ Hai (server chuẩn hóa). Idempotent. Rank 21.
CREATE TABLE IF NOT EXISTS manpower_plans (
  id serial PRIMARY KEY,
  project_id integer NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role_name_vi text NOT NULL,
  week_start date NOT NULL,
  planned_headcount integer NOT NULL DEFAULT 0,
  note text,
  created_by integer REFERENCES users(id),
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT manpower_plans_headcount_check CHECK (planned_headcount >= 0 AND planned_headcount <= 100000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS manpower_plans_project_role_week_uq
  ON manpower_plans (project_id, role_name_vi, week_start);
--> statement-breakpoint
ALTER TABLE manpower_plans ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE manpower_plans FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS manpower_plans_tenant_isolation ON manpower_plans;
--> statement-breakpoint
CREATE POLICY manpower_plans_tenant_isolation ON manpower_plans
  USING (app_tenant_unset() OR EXISTS (SELECT 1 FROM projects p WHERE p.id = manpower_plans.project_id AND p.tenant_id = app_current_tenant()))
  WITH CHECK (app_tenant_unset() OR EXISTS (SELECT 1 FROM projects p WHERE p.id = manpower_plans.project_id AND p.tenant_id = app_current_tenant()));
--> statement-breakpoint
