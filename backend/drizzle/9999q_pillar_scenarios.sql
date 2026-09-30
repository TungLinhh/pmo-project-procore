-- Pillar what-if scenarios (SRS Mục 4.2: CTL-01 → CTL-06, GĐ2 Control Layer).
-- P0 này: CTL-03 vật tư trễ, CTL-04 thanh toán chậm, CTL-05 +/- nhân lực,
-- CTL-06 revision bản vẽ. Chỉ preview + lưu DRAFT (không ghi đè baseline);
-- apply/rollback ở bước sau. Idempotent. Rank 18 (chạy sau 9999p).
CREATE TABLE IF NOT EXISTS pillar_scenarios (
  id serial PRIMARY KEY,
  project_id integer NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type text NOT NULL,
  name text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}',
  result jsonb,
  status varchar(20) NOT NULL DEFAULT 'DRAFT',
  created_by integer REFERENCES users(id),
  created_at timestamptz DEFAULT now() NOT NULL,
  applied_at timestamptz,
  CONSTRAINT pillar_scenarios_type_check CHECK (type IN ('CTL-03', 'CTL-04', 'CTL-05', 'CTL-06')),
  CONSTRAINT pillar_scenarios_status_check CHECK (status IN ('DRAFT', 'APPLIED', 'ROLLED_BACK'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS pillar_scenarios_project_idx ON pillar_scenarios (project_id);
--> statement-breakpoint
ALTER TABLE pillar_scenarios ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE pillar_scenarios FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS pillar_scenarios_tenant_isolation ON pillar_scenarios;
--> statement-breakpoint
CREATE POLICY pillar_scenarios_tenant_isolation ON pillar_scenarios
  USING (app_tenant_unset() OR EXISTS (SELECT 1 FROM projects p WHERE p.id = pillar_scenarios.project_id AND p.tenant_id = app_current_tenant()))
  WITH CHECK (app_tenant_unset() OR EXISTS (SELECT 1 FROM projects p WHERE p.id = pillar_scenarios.project_id AND p.tenant_id = app_current_tenant()));
--> statement-breakpoint
