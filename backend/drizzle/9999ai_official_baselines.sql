-- Official schedule baseline snapshots and optimistic scenario concurrency.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS plan_duration_days integer;
--> statement-breakpoint
ALTER TABLE schedule_baselines
  ADD COLUMN IF NOT EXISTS source_scenario_id integer REFERENCES pillar_scenarios(id),
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS applied_at timestamptz,
  ADD COLUMN IF NOT EXISTS rolled_back_at timestamptz;
--> statement-breakpoint
ALTER TABLE pillar_scenarios
  ADD COLUMN IF NOT EXISTS baseline_fingerprint text,
  ADD COLUMN IF NOT EXISTS baseline_before_id integer REFERENCES schedule_baselines(id),
  ADD COLUMN IF NOT EXISTS baseline_after_id integer REFERENCES schedule_baselines(id),
  ADD COLUMN IF NOT EXISTS rolled_back_at timestamptz;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS schedule_baseline_items (
  baseline_id integer NOT NULL REFERENCES schedule_baselines(id) ON DELETE CASCADE,
  schedule_item_id integer NOT NULL REFERENCES construction_schedule_items(id) ON DELETE CASCADE,
  plan_start_date date,
  plan_end_date date,
  plan_duration_days integer,
  progress_pct real,
  status varchar(50),
  PRIMARY KEY (baseline_id, schedule_item_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS schedule_baseline_items_item_idx
  ON schedule_baseline_items (schedule_item_id, baseline_id DESC);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS schedule_baselines_one_current_idx
  ON schedule_baselines (project_id) WHERE is_current;
--> statement-breakpoint

-- Bootstrap one honest snapshot from the schedule available at migration time.
-- Earlier metadata-only rows cannot be reconstructed and are retained as history.
INSERT INTO schedule_baselines (project_id, version, effective_date, notes, created_by, is_current, applied_at, content_hash)
SELECT p.id,
       COALESCE((SELECT MAX(sb.version) FROM schedule_baselines sb WHERE sb.project_id = p.id), 0) + 1,
       CURRENT_DATE,
       'Official baseline bootstrapped from current schedule during 9999ai migration',
       NULL,
       true,
       now(),
       md5('migration:' || p.id::text || ':' || COALESCE((
         SELECT string_agg(
           csi.id::text || ':' || COALESCE(csi.plan_start_date::text, '') || ':' ||
           COALESCE(csi.plan_end_date::text, '') || ':' ||
           COALESCE(csi.plan_duration_days::text, '') || ':' ||
           COALESCE(csi.progress_pct::text, '') || ':' || COALESCE(csi.status, ''),
           '|' ORDER BY csi.id
         ) FROM construction_schedule_items csi WHERE csi.project_id = p.id
       ), 'empty'))
FROM projects p
WHERE EXISTS (SELECT 1 FROM construction_schedule_items csi WHERE csi.project_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM schedule_baselines sb WHERE sb.project_id = p.id AND sb.is_current);
--> statement-breakpoint
INSERT INTO schedule_baseline_items (
  baseline_id, schedule_item_id, plan_start_date, plan_end_date, plan_duration_days, progress_pct, status
)
SELECT sb.id, csi.id, csi.plan_start_date, csi.plan_end_date,
       COALESCE(csi.plan_duration_days,
         CASE WHEN csi.plan_start_date IS NOT NULL AND csi.plan_end_date IS NOT NULL
              THEN (csi.plan_end_date - csi.plan_start_date + 1)::integer END),
       csi.progress_pct, csi.status
FROM schedule_baselines sb
JOIN construction_schedule_items csi ON csi.project_id = sb.project_id
WHERE sb.is_current
  AND sb.notes = 'Official baseline bootstrapped from current schedule during 9999ai migration'
  AND NOT EXISTS (
    SELECT 1 FROM schedule_baseline_items item WHERE item.baseline_id = sb.id AND item.schedule_item_id = csi.id
  );
--> statement-breakpoint
UPDATE construction_schedule_items csi
SET baseline_id = sb.id,
    baseline_version = sb.version
FROM schedule_baselines sb
WHERE sb.project_id = csi.project_id AND sb.is_current
  AND csi.baseline_id IS DISTINCT FROM sb.id;
--> statement-breakpoint
UPDATE projects p
SET plan_duration_days = d.days
FROM (
  SELECT project_id, GREATEST(1, (MAX(plan_end_date) - MIN(plan_start_date) + 1)::integer) AS days
  FROM construction_schedule_items
  WHERE plan_start_date IS NOT NULL AND plan_end_date IS NOT NULL
  GROUP BY project_id
) d
WHERE d.project_id = p.id;
--> statement-breakpoint

ALTER TABLE schedule_baseline_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE schedule_baseline_items FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY schedule_baseline_items_tenant_isolation ON schedule_baseline_items
  USING (app_tenant_unset() OR EXISTS (
    SELECT 1 FROM schedule_baselines sb
    JOIN projects p ON p.id = sb.project_id
    WHERE sb.id = schedule_baseline_items.baseline_id AND p.tenant_id = app_current_tenant()
  ))
  WITH CHECK (app_tenant_unset() OR EXISTS (
    SELECT 1 FROM schedule_baselines sb
    JOIN projects p ON p.id = sb.project_id
    WHERE sb.id = schedule_baseline_items.baseline_id AND p.tenant_id = app_current_tenant()
  ));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON schedule_baseline_items TO pmo_app;
