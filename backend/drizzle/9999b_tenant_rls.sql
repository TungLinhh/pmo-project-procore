-- Defense-in-depth tenant isolation (Phase A, per 2026-09-15 plan).
--
-- App-level checks (lib/project-access.js) stay the primary gate. This migration
-- adds Postgres RLS as a second barrier so a missed WHERE tenant_id / project_id
-- in a future query fails closed instead of leaking cross-tenant rows.
--
-- Bootstrap escape hatch: when the GUC app.current_tenant is UNSET (empty),
-- every policy passes. Migrations, seeds (db/init.js) and the pre-GUC auth
-- lookup (login, requireAuth user reload) run without a tenant and must not be
-- filtered. The app pool layer (db/index.js) SETs the GUC from AsyncLocalStorage
-- on every checked-out connection once requireAuth has established the tenant,
-- and RESETs it on release — so request queries are always filtered.
-- Honest limitation: enforcement depends on the app setting the GUC; anyone with
-- direct DB credentials and no GUC still sees all rows (same as before).
--
-- FORCE ROW LEVEL SECURITY is used so the table owner (pmo_user, which the app
-- connects as) is filtered too. With the hatch, unsetting GUC still bypasses.
-- Idempotent: DROP POLICY IF EXISTS + ADD COLUMN/CREATE INDEX IF NOT EXISTS.

-- ============ helper indexes for policy joins (cheap, missing in places) ============
CREATE INDEX IF NOT EXISTS zones_project_idx ON zones (project_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS materials_project_idx ON materials (project_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS material_submittals_project_idx ON material_submittals (project_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS shop_drawings_project_idx ON shop_drawings (project_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS contracts_project_idx ON contracts (project_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS invoices_contract_idx ON invoices (contract_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS payment_requests_invoice_idx ON payment_requests (invoice_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS payments_project_idx ON payments (project_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS daily_reports_project_idx ON daily_reports (project_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ar_contracts_project_idx ON ar_contracts (project_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ar_lines_project_idx ON ar_lines (project_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS kpi_targets_project_idx ON kpi_targets (project_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS generic_sheets_project_idx ON generic_sheets (project_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS rfa_log_project_idx ON rfa_log (project_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS schedule_baselines_project_idx ON schedule_baselines (project_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS wbs_project_idx ON wbs (project_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS work_items_project_idx ON work_items (project_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS area_hierarchy_project_idx ON area_hierarchy (project_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS issues_tenant_idx ON issues (tenant_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS users_tenant_idx ON users (tenant_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS projects_tenant_idx ON projects (tenant_id);
--> statement-breakpoint

-- ============ direct tenant_id tables ============
-- Pattern per table:
--   ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE <t> FORCE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS <t>_tenant_isolation ON <t>;
--   CREATE POLICY <t>_tenant_isolation ON <t>
--     USING ( ... ) WITH CHECK ( ... );

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE projects FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS projects_tenant_isolation ON projects;
--> statement-breakpoint
CREATE POLICY projects_tenant_isolation ON projects
  USING (current_setting('app.current_tenant', true) = '' OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int)
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int);
--> statement-breakpoint

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE users FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS users_tenant_isolation ON users;
--> statement-breakpoint
CREATE POLICY users_tenant_isolation ON users
  USING (current_setting('app.current_tenant', true) = '' OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int)
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int);
--> statement-breakpoint

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenants_isolation ON tenants;
--> statement-breakpoint
CREATE POLICY tenants_isolation ON tenants
  USING (current_setting('app.current_tenant', true) = '' OR id = nullif(current_setting('app.current_tenant', true), '')::int)
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR id = nullif(current_setting('app.current_tenant', true), '')::int);
--> statement-breakpoint

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE departments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS departments_tenant_isolation ON departments;
--> statement-breakpoint
CREATE POLICY departments_tenant_isolation ON departments
  USING (current_setting('app.current_tenant', true) = '' OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int)
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int);
--> statement-breakpoint

ALTER TABLE approval_chains ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE approval_chains FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS approval_chains_tenant_isolation ON approval_chains;
--> statement-breakpoint
CREATE POLICY approval_chains_tenant_isolation ON approval_chains
  USING (current_setting('app.current_tenant', true) = '' OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int)
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int);
--> statement-breakpoint

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE vendors FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS vendors_tenant_isolation ON vendors;
--> statement-breakpoint
CREATE POLICY vendors_tenant_isolation ON vendors
  USING (current_setting('app.current_tenant', true) = '' OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int)
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int);
--> statement-breakpoint

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE suppliers FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS suppliers_tenant_isolation ON suppliers;
--> statement-breakpoint
CREATE POLICY suppliers_tenant_isolation ON suppliers
  USING (current_setting('app.current_tenant', true) = '' OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int)
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int);
--> statement-breakpoint

ALTER TABLE subcontractors ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE subcontractors FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS subcontractors_tenant_isolation ON subcontractors;
--> statement-breakpoint
CREATE POLICY subcontractors_tenant_isolation ON subcontractors
  USING (current_setting('app.current_tenant', true) = '' OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int)
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int);
--> statement-breakpoint

ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE workers FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS workers_tenant_isolation ON workers;
--> statement-breakpoint
CREATE POLICY workers_tenant_isolation ON workers
  USING (current_setting('app.current_tenant', true) = '' OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int)
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int);
--> statement-breakpoint

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE teams FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS teams_tenant_isolation ON teams;
--> statement-breakpoint
CREATE POLICY teams_tenant_isolation ON teams
  USING (current_setting('app.current_tenant', true) = '' OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int)
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int);
--> statement-breakpoint

ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE resources FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS resources_tenant_isolation ON resources;
--> statement-breakpoint
CREATE POLICY resources_tenant_isolation ON resources
  USING (current_setting('app.current_tenant', true) = '' OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int)
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int);
--> statement-breakpoint

ALTER TABLE cost_codes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cost_codes FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS cost_codes_tenant_isolation ON cost_codes;
--> statement-breakpoint
CREATE POLICY cost_codes_tenant_isolation ON cost_codes
  USING (current_setting('app.current_tenant', true) = '' OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int)
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int);
--> statement-breakpoint

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS notifications_tenant_isolation ON notifications;
--> statement-breakpoint
CREATE POLICY notifications_tenant_isolation ON notifications
  USING (current_setting('app.current_tenant', true) = '' OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int)
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int);
--> statement-breakpoint

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS audit_log_tenant_isolation ON audit_log;
--> statement-breakpoint
CREATE POLICY audit_log_tenant_isolation ON audit_log
  USING (current_setting('app.current_tenant', true) = '' OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int)
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int);
--> statement-breakpoint

ALTER TABLE file_uploads ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE file_uploads FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS file_uploads_tenant_isolation ON file_uploads;
--> statement-breakpoint
CREATE POLICY file_uploads_tenant_isolation ON file_uploads
  USING (current_setting('app.current_tenant', true) = '' OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int)
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int);
--> statement-breakpoint

ALTER TABLE business_processes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE business_processes FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS business_processes_tenant_isolation ON business_processes;
--> statement-breakpoint
CREATE POLICY business_processes_tenant_isolation ON business_processes
  USING (current_setting('app.current_tenant', true) = '' OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int)
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int);
--> statement-breakpoint

ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE issues FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS issues_tenant_isolation ON issues;
--> statement-breakpoint
CREATE POLICY issues_tenant_isolation ON issues
  USING (current_setting('app.current_tenant', true) = '' OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int)
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int);
--> statement-breakpoint

ALTER TABLE directives ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE directives FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS directives_tenant_isolation ON directives;
--> statement-breakpoint
CREATE POLICY directives_tenant_isolation ON directives
  USING (current_setting('app.current_tenant', true) = '' OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int)
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int);
--> statement-breakpoint

-- ============ project-scoped tables (tenant via projects join) ============
ALTER TABLE zones ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE zones FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS zones_tenant_isolation ON zones;
--> statement-breakpoint
CREATE POLICY zones_tenant_isolation ON zones
  USING (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM projects p WHERE p.id = zones.project_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int))
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM projects p WHERE p.id = zones.project_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int));
--> statement-breakpoint

ALTER TABLE construction_schedule_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE construction_schedule_items FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS construction_schedule_items_tenant_isolation ON construction_schedule_items;
--> statement-breakpoint
CREATE POLICY construction_schedule_items_tenant_isolation ON construction_schedule_items
  USING (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM projects p WHERE p.id = construction_schedule_items.project_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int))
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM projects p WHERE p.id = construction_schedule_items.project_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int));
--> statement-breakpoint

ALTER TABLE shop_drawings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE shop_drawings FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS shop_drawings_tenant_isolation ON shop_drawings;
--> statement-breakpoint
CREATE POLICY shop_drawings_tenant_isolation ON shop_drawings
  USING (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM projects p WHERE p.id = shop_drawings.project_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int))
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM projects p WHERE p.id = shop_drawings.project_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int));
--> statement-breakpoint

ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE materials FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS materials_tenant_isolation ON materials;
--> statement-breakpoint
CREATE POLICY materials_tenant_isolation ON materials
  USING (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM projects p WHERE p.id = materials.project_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int))
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM projects p WHERE p.id = materials.project_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int));
--> statement-breakpoint

ALTER TABLE material_submittals ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE material_submittals FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS material_submittals_tenant_isolation ON material_submittals;
--> statement-breakpoint
CREATE POLICY material_submittals_tenant_isolation ON material_submittals
  USING (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM projects p WHERE p.id = material_submittals.project_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int))
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM projects p WHERE p.id = material_submittals.project_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int));
--> statement-breakpoint

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE contracts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS contracts_tenant_isolation ON contracts;
--> statement-breakpoint
CREATE POLICY contracts_tenant_isolation ON contracts
  USING (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM projects p WHERE p.id = contracts.project_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int))
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM projects p WHERE p.id = contracts.project_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int));
--> statement-breakpoint

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS payments_tenant_isolation ON payments;
--> statement-breakpoint
CREATE POLICY payments_tenant_isolation ON payments
  USING (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM projects p WHERE p.id = payments.project_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int))
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM projects p WHERE p.id = payments.project_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int));
--> statement-breakpoint

ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE daily_reports FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS daily_reports_tenant_isolation ON daily_reports;
--> statement-breakpoint
CREATE POLICY daily_reports_tenant_isolation ON daily_reports
  USING (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM projects p WHERE p.id = daily_reports.project_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int))
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM projects p WHERE p.id = daily_reports.project_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int));
--> statement-breakpoint

ALTER TABLE ar_contracts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ar_contracts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS ar_contracts_tenant_isolation ON ar_contracts;
--> statement-breakpoint
CREATE POLICY ar_contracts_tenant_isolation ON ar_contracts
  USING (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM projects p WHERE p.id = ar_contracts.project_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int))
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM projects p WHERE p.id = ar_contracts.project_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int));
--> statement-breakpoint

ALTER TABLE ar_lines ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ar_lines FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS ar_lines_tenant_isolation ON ar_lines;
--> statement-breakpoint
CREATE POLICY ar_lines_tenant_isolation ON ar_lines
  USING (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM projects p WHERE p.id = ar_lines.project_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int))
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM projects p WHERE p.id = ar_lines.project_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int));
--> statement-breakpoint

ALTER TABLE kpi_targets ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE kpi_targets FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS kpi_targets_tenant_isolation ON kpi_targets;
--> statement-breakpoint
CREATE POLICY kpi_targets_tenant_isolation ON kpi_targets
  USING (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM projects p WHERE p.id = kpi_targets.project_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int))
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM projects p WHERE p.id = kpi_targets.project_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int));
--> statement-breakpoint

ALTER TABLE generic_sheets ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE generic_sheets FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS generic_sheets_tenant_isolation ON generic_sheets;
--> statement-breakpoint
CREATE POLICY generic_sheets_tenant_isolation ON generic_sheets
  USING (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM projects p WHERE p.id = generic_sheets.project_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int))
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM projects p WHERE p.id = generic_sheets.project_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int));
--> statement-breakpoint

ALTER TABLE rfa_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE rfa_log FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS rfa_log_tenant_isolation ON rfa_log;
--> statement-breakpoint
CREATE POLICY rfa_log_tenant_isolation ON rfa_log
  USING (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM projects p WHERE p.id = rfa_log.project_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int))
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM projects p WHERE p.id = rfa_log.project_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int));
--> statement-breakpoint

ALTER TABLE schedule_baselines ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE schedule_baselines FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS schedule_baselines_tenant_isolation ON schedule_baselines;
--> statement-breakpoint
CREATE POLICY schedule_baselines_tenant_isolation ON schedule_baselines
  USING (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM projects p WHERE p.id = schedule_baselines.project_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int))
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM projects p WHERE p.id = schedule_baselines.project_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int));
--> statement-breakpoint

ALTER TABLE wbs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE wbs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS wbs_tenant_isolation ON wbs;
--> statement-breakpoint
CREATE POLICY wbs_tenant_isolation ON wbs
  USING (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM projects p WHERE p.id = wbs.project_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int))
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM projects p WHERE p.id = wbs.project_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int));
--> statement-breakpoint

ALTER TABLE work_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE work_items FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS work_items_tenant_isolation ON work_items;
--> statement-breakpoint
CREATE POLICY work_items_tenant_isolation ON work_items
  USING (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM projects p WHERE p.id = work_items.project_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int))
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM projects p WHERE p.id = work_items.project_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int));
--> statement-breakpoint

ALTER TABLE area_hierarchy ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE area_hierarchy FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS area_hierarchy_tenant_isolation ON area_hierarchy;
--> statement-breakpoint
CREATE POLICY area_hierarchy_tenant_isolation ON area_hierarchy
  USING (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM projects p WHERE p.id = area_hierarchy.project_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int))
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM projects p WHERE p.id = area_hierarchy.project_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int));
--> statement-breakpoint

-- ============ second-hop tables ============
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS invoices_tenant_isolation ON invoices;
--> statement-breakpoint
CREATE POLICY invoices_tenant_isolation ON invoices
  USING (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM contracts c JOIN projects p ON p.id = c.project_id WHERE c.id = invoices.contract_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int))
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM contracts c JOIN projects p ON p.id = c.project_id WHERE c.id = invoices.contract_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int));
--> statement-breakpoint

ALTER TABLE payment_requests ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE payment_requests FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS payment_requests_tenant_isolation ON payment_requests;
--> statement-breakpoint
CREATE POLICY payment_requests_tenant_isolation ON payment_requests
  USING (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM invoices i JOIN contracts c ON c.id = i.contract_id JOIN projects p ON p.id = c.project_id WHERE i.id = payment_requests.invoice_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int))
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM invoices i JOIN contracts c ON c.id = i.contract_id JOIN projects p ON p.id = c.project_id WHERE i.id = payment_requests.invoice_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int));
--> statement-breakpoint

ALTER TABLE daily_manpower ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE daily_manpower FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS daily_manpower_tenant_isolation ON daily_manpower;
--> statement-breakpoint
CREATE POLICY daily_manpower_tenant_isolation ON daily_manpower
  USING (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM daily_reports dr JOIN projects p ON p.id = dr.project_id WHERE dr.id = daily_manpower.daily_report_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int))
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM daily_reports dr JOIN projects p ON p.id = dr.project_id WHERE dr.id = daily_manpower.daily_report_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int));
--> statement-breakpoint

ALTER TABLE daily_work_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE daily_work_items FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS daily_work_items_tenant_isolation ON daily_work_items;
--> statement-breakpoint
CREATE POLICY daily_work_items_tenant_isolation ON daily_work_items
  USING (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM daily_reports dr JOIN projects p ON p.id = dr.project_id WHERE dr.id = daily_work_items.daily_report_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int))
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM daily_reports dr JOIN projects p ON p.id = dr.project_id WHERE dr.id = daily_work_items.daily_report_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int));
--> statement-breakpoint

ALTER TABLE daily_materials ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE daily_materials FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS daily_materials_tenant_isolation ON daily_materials;
--> statement-breakpoint
CREATE POLICY daily_materials_tenant_isolation ON daily_materials
  USING (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM daily_reports dr JOIN projects p ON p.id = dr.project_id WHERE dr.id = daily_materials.daily_report_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int))
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM daily_reports dr JOIN projects p ON p.id = dr.project_id WHERE dr.id = daily_materials.daily_report_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int));
--> statement-breakpoint

ALTER TABLE daily_acceptance ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE daily_acceptance FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS daily_acceptance_tenant_isolation ON daily_acceptance;
--> statement-breakpoint
CREATE POLICY daily_acceptance_tenant_isolation ON daily_acceptance
  USING (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM daily_reports dr JOIN projects p ON p.id = dr.project_id WHERE dr.id = daily_acceptance.daily_report_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int))
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM daily_reports dr JOIN projects p ON p.id = dr.project_id WHERE dr.id = daily_acceptance.daily_report_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int));
--> statement-breakpoint

ALTER TABLE daily_safety ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE daily_safety FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS daily_safety_tenant_isolation ON daily_safety;
--> statement-breakpoint
CREATE POLICY daily_safety_tenant_isolation ON daily_safety
  USING (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM daily_reports dr JOIN projects p ON p.id = dr.project_id WHERE dr.id = daily_safety.daily_report_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int))
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM daily_reports dr JOIN projects p ON p.id = dr.project_id WHERE dr.id = daily_safety.daily_report_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int));
--> statement-breakpoint

ALTER TABLE daily_recommendations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE daily_recommendations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS daily_recommendations_tenant_isolation ON daily_recommendations;
--> statement-breakpoint
CREATE POLICY daily_recommendations_tenant_isolation ON daily_recommendations
  USING (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM daily_reports dr JOIN projects p ON p.id = dr.project_id WHERE dr.id = daily_recommendations.daily_report_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int))
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM daily_reports dr JOIN projects p ON p.id = dr.project_id WHERE dr.id = daily_recommendations.daily_report_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int));
--> statement-breakpoint

ALTER TABLE daily_infos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE daily_infos FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS daily_infos_tenant_isolation ON daily_infos;
--> statement-breakpoint
CREATE POLICY daily_infos_tenant_isolation ON daily_infos
  USING (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM daily_reports dr JOIN projects p ON p.id = dr.project_id WHERE dr.id = daily_infos.daily_report_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int))
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM daily_reports dr JOIN projects p ON p.id = dr.project_id WHERE dr.id = daily_infos.daily_report_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int));
--> statement-breakpoint

ALTER TABLE daily_photos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE daily_photos FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS daily_photos_tenant_isolation ON daily_photos;
--> statement-breakpoint
CREATE POLICY daily_photos_tenant_isolation ON daily_photos
  USING (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM daily_reports dr JOIN projects p ON p.id = dr.project_id WHERE dr.id = daily_photos.daily_report_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int))
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM daily_reports dr JOIN projects p ON p.id = dr.project_id WHERE dr.id = daily_photos.daily_report_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int));
--> statement-breakpoint

ALTER TABLE business_process_steps ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE business_process_steps FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS business_process_steps_tenant_isolation ON business_process_steps;
--> statement-breakpoint
CREATE POLICY business_process_steps_tenant_isolation ON business_process_steps
  USING (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM business_processes bp WHERE bp.id = business_process_steps.process_id AND bp.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int))
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM business_processes bp WHERE bp.id = business_process_steps.process_id AND bp.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int));
--> statement-breakpoint

-- project_members: row is visible only when BOTH sides belong to the current tenant
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE project_members FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS project_members_tenant_isolation ON project_members;
--> statement-breakpoint
CREATE POLICY project_members_tenant_isolation ON project_members
  USING (current_setting('app.current_tenant', true) = ''
    OR (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_members.project_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int)
      AND EXISTS (SELECT 1 FROM users u WHERE u.id = project_members.user_id AND u.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int)))
  WITH CHECK (current_setting('app.current_tenant', true) = ''
    OR (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_members.project_id AND p.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int)
      AND EXISTS (SELECT 1 FROM users u WHERE u.id = project_members.user_id AND u.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int)));
--> statement-breakpoint

-- offline_sync_queue + refresh tokens: tenant via the owning user
ALTER TABLE offline_sync_queue ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE offline_sync_queue FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS offline_sync_queue_tenant_isolation ON offline_sync_queue;
--> statement-breakpoint
CREATE POLICY offline_sync_queue_tenant_isolation ON offline_sync_queue
  USING (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM users u WHERE u.id = offline_sync_queue.user_id AND u.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int))
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM users u WHERE u.id = offline_sync_queue.user_id AND u.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int));
--> statement-breakpoint

ALTER TABLE auth_refresh_tokens ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE auth_refresh_tokens FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS auth_refresh_tokens_tenant_isolation ON auth_refresh_tokens;
--> statement-breakpoint
CREATE POLICY auth_refresh_tokens_tenant_isolation ON auth_refresh_tokens
  USING (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM users u WHERE u.id = auth_refresh_tokens.user_id AND u.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int))
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR EXISTS (SELECT 1 FROM users u WHERE u.id = auth_refresh_tokens.user_id AND u.tenant_id = nullif(current_setting('app.current_tenant', true), '')::int));
--> statement-breakpoint

-- NOT covered (global infra, no tenant scope): auth_revoked_jti (opaque jti),
-- schema_migrations (ledger). Both stay RLS-free by design.
