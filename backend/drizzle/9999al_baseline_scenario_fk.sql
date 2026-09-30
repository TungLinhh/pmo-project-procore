-- Keep baseline history when a draft scenario is removed by retention cleanup.
ALTER TABLE schedule_baselines DROP CONSTRAINT IF EXISTS schedule_baselines_source_scenario_id_fkey;
--> statement-breakpoint
ALTER TABLE schedule_baselines ADD CONSTRAINT schedule_baselines_source_scenario_id_fkey
  FOREIGN KEY (source_scenario_id) REFERENCES pillar_scenarios(id) ON DELETE SET NULL;
