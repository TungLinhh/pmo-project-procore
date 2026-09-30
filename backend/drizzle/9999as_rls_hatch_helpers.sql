-- Fix two RLS policies whose "no tenant set" hatch never fires.
--
-- Every tenant-scoped table uses the helper predicate:
--     app_tenant_unset() OR tenant_id = app_current_tenant()
-- where app_tenant_unset() is coalesce(current_setting(...,true), '') = ''.
--
-- attention_digest_runs and qa_inspections were written with the raw form:
--     current_setting('app.current_tenant', true) = '' OR tenant_id = ...
-- The raw form evaluates to NULL (not TRUE) when the GUC has never been SET in
-- the session — which is exactly the unauthenticated/cron case the hatch exists
-- for. So:
--   * the overdue-digest cron hit
--     `new row violates row-level security policy for table "attention_digest_runs"`
--     and the daily digest recorded nothing;
--   * any bootstrap read of qa_inspections without a tenant was refused too.
--
-- Behaviour for an authenticated request is unchanged: the GUC is always a
-- non-empty tenant id there, so both forms pick the same rows. This only makes
-- the two tables behave like the other 60+.
DROP POLICY IF EXISTS attention_digest_runs_tenant_isolation ON attention_digest_runs;
CREATE POLICY attention_digest_runs_tenant_isolation ON attention_digest_runs
  USING (app_tenant_unset() OR tenant_id = app_current_tenant())
  WITH CHECK (app_tenant_unset() OR tenant_id = app_current_tenant());

DROP POLICY IF EXISTS qa_inspections_tenant_isolation ON qa_inspections;
CREATE POLICY qa_inspections_tenant_isolation ON qa_inspections
  USING (app_tenant_unset() OR tenant_id = app_current_tenant())
  WITH CHECK (app_tenant_unset() OR tenant_id = app_current_tenant());
