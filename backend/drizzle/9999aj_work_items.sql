-- Extend the existing WBS/work_items model into the shared four-pillar key.
-- The base schema already contains wbs and work_items; do not create a second
-- work-item table.
ALTER TABLE work_items
  ADD COLUMN IF NOT EXISTS zone_id integer REFERENCES zones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS item_type varchar(20) NOT NULL DEFAULT 'TASK',
  ADD COLUMN IF NOT EXISTS planned_start_date date,
  ADD COLUMN IF NOT EXISTS planned_end_date date,
  ADD COLUMN IF NOT EXISTS plan_duration_days integer,
  ADD COLUMN IF NOT EXISTS progress_pct real,
  ADD COLUMN IF NOT EXISTS source_schedule_item_id integer UNIQUE REFERENCES construction_schedule_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
--> statement-breakpoint
ALTER TABLE work_items DROP CONSTRAINT IF EXISTS work_items_type_check;
--> statement-breakpoint
ALTER TABLE work_items ADD CONSTRAINT work_items_type_check CHECK (item_type IN ('GROUP', 'TASK'));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS work_items_project_code_uq ON work_items (project_id, code);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS work_items_project_wbs_idx ON work_items (project_id, wbs_id, code);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS work_items_source_schedule_idx ON work_items (source_schedule_item_id);
--> statement-breakpoint

ALTER TABLE construction_schedule_items ADD COLUMN IF NOT EXISTS work_item_id integer REFERENCES work_items(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE shop_drawings ADD COLUMN IF NOT EXISTS work_item_id integer REFERENCES work_items(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE materials ADD COLUMN IF NOT EXISTS work_item_id integer REFERENCES work_items(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE material_submittals ADD COLUMN IF NOT EXISTS work_item_id integer REFERENCES work_items(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE daily_work_items ADD COLUMN IF NOT EXISTS work_item_id integer REFERENCES work_items(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE daily_acceptance ADD COLUMN IF NOT EXISTS work_item_id integer REFERENCES work_items(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE daily_manpower ADD COLUMN IF NOT EXISTS work_item_id integer REFERENCES work_items(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE qa_inspections ADD COLUMN IF NOT EXISTS work_item_id integer REFERENCES work_items(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS payment_request_items (
  id serial PRIMARY KEY,
  payment_request_id integer NOT NULL REFERENCES payment_requests(id) ON DELETE CASCADE,
  work_item_id integer NOT NULL REFERENCES work_items(id) ON DELETE RESTRICT,
  quantity numeric(18,4),
  accepted_value numeric(18,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_request_items_unique UNIQUE (payment_request_id, work_item_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS payment_request_items_work_item_idx ON payment_request_items (work_item_id, payment_request_id);
--> statement-breakpoint

-- Backfill one deterministic work item for each existing schedule row. A
-- source row keeps its identity through source_schedule_item_id.
INSERT INTO work_items (project_id, zone_id, code, name_vi, name_en, item_type,
                        planned_start_date, planned_end_date, plan_duration_days,
                        progress_pct, source_schedule_item_id, wbs_id)
SELECT csi.project_id, csi.zone_id,
       COALESCE(NULLIF(TRIM(
         COALESCE(csi.level_roman, '') ||
         CASE WHEN COALESCE(csi.level_arabic, 0) > 0 THEN '.' || csi.level_arabic::text ELSE '' END ||
         CASE WHEN COALESCE(csi.sublevel, 0) > 0 THEN '.' || csi.sublevel::text ELSE '' END
       ), ''), 'ROW-' || csi.id::text) || '-' || csi.id::text,
       csi.name_vi, csi.name_en, 'TASK',
       csi.plan_start_date, csi.plan_end_date, csi.plan_duration_days,
       csi.progress_pct, csi.id,
       (SELECT w.id FROM wbs w WHERE w.project_id = csi.project_id AND w.code = TRIM(
         COALESCE(csi.level_roman, '') ||
         CASE WHEN COALESCE(csi.level_arabic, 0) > 0 THEN '.' || csi.level_arabic::text ELSE '' END ||
         CASE WHEN COALESCE(csi.sublevel, 0) > 0 THEN '.' || csi.sublevel::text ELSE '' END
       ) LIMIT 1)
FROM construction_schedule_items csi
WHERE NOT EXISTS (SELECT 1 FROM work_items wi WHERE wi.source_schedule_item_id = csi.id)
ON CONFLICT (project_id, code) DO UPDATE SET
  zone_id = EXCLUDED.zone_id,
  name_vi = EXCLUDED.name_vi,
  name_en = EXCLUDED.name_en,
  planned_start_date = EXCLUDED.planned_start_date,
  planned_end_date = EXCLUDED.planned_end_date,
  plan_duration_days = EXCLUDED.plan_duration_days,
  progress_pct = EXCLUDED.progress_pct,
  source_schedule_item_id = EXCLUDED.source_schedule_item_id,
  wbs_id = COALESCE(EXCLUDED.wbs_id, work_items.wbs_id),
  updated_at = now();
--> statement-breakpoint
UPDATE construction_schedule_items csi
SET work_item_id = wi.id
FROM work_items wi
WHERE wi.source_schedule_item_id = csi.id AND csi.work_item_id IS DISTINCT FROM wi.id;
--> statement-breakpoint

ALTER TABLE payment_request_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE payment_request_items FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY payment_request_items_tenant_isolation ON payment_request_items
  USING (app_tenant_unset() OR EXISTS (
    SELECT 1 FROM payment_requests pr
    JOIN invoices i ON i.id = pr.invoice_id
    JOIN contracts c ON c.id = i.contract_id
    JOIN projects p ON p.id = c.project_id
    WHERE pr.id = payment_request_items.payment_request_id AND p.tenant_id = app_current_tenant()
  ))
  WITH CHECK (app_tenant_unset() OR EXISTS (
    SELECT 1 FROM payment_requests pr
    JOIN invoices i ON i.id = pr.invoice_id
    JOIN contracts c ON c.id = i.contract_id
    JOIN projects p ON p.id = c.project_id
    WHERE pr.id = payment_request_items.payment_request_id AND p.tenant_id = app_current_tenant()
  ));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON payment_request_items TO pmo_app;
