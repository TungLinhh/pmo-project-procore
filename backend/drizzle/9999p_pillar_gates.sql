-- Pillar gate configs (SRS Mục 2.5 + 3.1: gate-based logic, configurable, không hard-code).
-- PMO tự điều chỉnh ngưỡng theo từng loại dự án. project_id = 0 là default
-- cấp tenant (áp dụng khi project chưa có override riêng).
-- Idempotent. Rank 17 (chạy sau 9999o).
CREATE TABLE IF NOT EXISTS pillar_gate_configs (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL,
  project_id integer NOT NULL DEFAULT 0,
  from_pillar text NOT NULL,
  to_pillar text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  threshold_pct real NOT NULL DEFAULT 80,
  note text,
  updated_by integer,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT pillar_gate_configs_pillars_check CHECK (
    from_pillar IN ('shop', 'material', 'manpower', 'payment')
    AND to_pillar IN ('shop', 'material', 'manpower', 'payment')
    AND from_pillar != to_pillar
  ),
  CONSTRAINT pillar_gate_configs_threshold_check CHECK (threshold_pct >= 0 AND threshold_pct <= 100)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS pillar_gate_configs_tenant_project_gate_uq
  ON pillar_gate_configs (tenant_id, project_id, from_pillar, to_pillar);
--> statement-breakpoint
ALTER TABLE pillar_gate_configs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE pillar_gate_configs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS pillar_gate_configs_tenant_isolation ON pillar_gate_configs;
--> statement-breakpoint
CREATE POLICY pillar_gate_configs_tenant_isolation ON pillar_gate_configs
  USING (app_tenant_unset() OR tenant_id = app_current_tenant())
  WITH CHECK (app_tenant_unset() OR tenant_id = app_current_tenant());
--> statement-breakpoint
