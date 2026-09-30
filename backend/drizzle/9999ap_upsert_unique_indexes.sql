-- Move the unique indexes that db.upsert() depends on out of db/init.js and
-- into the ledger, so a deployment that applies migrations without running
-- init.js boots clean instead of failing at the first upsert with
-- "no unique or exclusion constraint matching the ON CONFLICT specification".
-- Also enforce "one active KPI target per (project, kpi_code)": two concurrent
-- POSTs both read MAX(version), inserted v=N+1 twice, and the dashboard
-- rollup then counted the KPI twice.
--
-- kpi_targets_open_uq is created only after collapsing any duplicate open
-- rows, keeping the newest version so existing data is not lost.

CREATE UNIQUE INDEX IF NOT EXISTS subcontractors_tenant_name_uq
  ON subcontractors (tenant_id, name);

CREATE UNIQUE INDEX IF NOT EXISTS suppliers_tenant_name_uq
  ON suppliers (tenant_id, name);

CREATE UNIQUE INDEX IF NOT EXISTS materials_project_zone_code_uq
  ON materials (project_id, zone_id, material_code);

CREATE UNIQUE INDEX IF NOT EXISTS generic_sheets_uq
  ON generic_sheets (project_id, doc_type, source_sheet, ordinal);

CREATE UNIQUE INDEX IF NOT EXISTS daily_reports_project_date_uq
  ON daily_reports (project_id, report_date);

CREATE UNIQUE INDEX IF NOT EXISTS offline_sync_queue_user_client_uq
  ON offline_sync_queue (user_id, client_id) WHERE status = 'PENDING';

-- Collapse duplicate open KPI targets (keep the highest version) before the
-- unique index can be created.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY project_id, kpi_code
           ORDER BY version DESC, id DESC
         ) AS rn
  FROM kpi_targets
  WHERE effective_to IS NULL
)
UPDATE kpi_targets k
   SET effective_to = CURRENT_DATE
  FROM ranked r
 WHERE k.id = r.id
   AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS kpi_targets_open_uq
  ON kpi_targets (project_id, kpi_code) WHERE effective_to IS NULL;
