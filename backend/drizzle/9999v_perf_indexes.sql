-- Perf indexes (SRS NFR: dashboard <3s với 20 dự án song song).
-- Lấp các cột nóng chưa có index mà dashboard/portfolio/control-summary quét:
-- daily_manpower(daily_report_id) là lỗ hổng lớn nhất (FK không index → mọi
-- query manpower phải nested-loop/scan); còn lại là composite (project_id, …)
-- cho các filter COUNT theo status/date/code. Idempotent. Rank 23.
CREATE INDEX IF NOT EXISTS daily_manpower_report_idx
  ON daily_manpower (daily_report_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS shop_drawings_project_status_idx
  ON shop_drawings (project_id, status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS material_submittals_project_status_idx
  ON material_submittals (project_id, status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS material_submittals_supervisor_deadline_idx
  ON material_submittals (supervisor_deadline);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS construction_schedule_items_project_status_idx
  ON construction_schedule_items (project_id, status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS construction_schedule_items_project_plan_end_idx
  ON construction_schedule_items (project_id, plan_end_date);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS materials_project_created_idx
  ON materials (project_id, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS kpi_targets_project_effective_code_idx
  ON kpi_targets (project_id, effective_to, kpi_code);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS issues_tenant_status_idx
  ON issues (tenant_id, status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS issues_project_status_idx
  ON issues (project_id, status);
