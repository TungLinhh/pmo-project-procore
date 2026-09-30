-- Health thresholds (SRS FR-1.6: đèn xanh/vàng/đỏ theo ngưỡng CẤU HÌNH ĐƯỢC).
-- project_id = 0 là default cấp tenant; row project riêng thắng row tenant.
-- direction cố định theo metric (không cho sửa — giữ ngữ nghĩa an toàn):
--   high_bad: càng lớn càng xấu (số quá hạn). green khi v < yellow_at,
--             yellow khi v < red_at, còn lại red. Yêu cầu yellow_at <= red_at.
--   low_bad: càng nhỏ càng xấu (% duyệt). red khi v < red_at,
--            yellow khi v < yellow_at, còn lại green. Yêu cầu red_at <= yellow_at.
-- Defaults mirror đúng logic cứng cũ trong ControlCenter (overdue>5 CRITICAL,
-- >0 BEHIND; approval>=90 ON_TRACK, >=50 WATCH) để hành vi mặc định không đổi.
-- Idempotent. Rank 19 (chạy sau 9999q).
CREATE TABLE IF NOT EXISTS health_thresholds (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL,
  project_id integer NOT NULL DEFAULT 0,
  metric text NOT NULL,
  direction text NOT NULL,
  yellow_at real NOT NULL,
  red_at real NOT NULL,
  updated_by integer,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT health_thresholds_metric_check CHECK (metric IN ('overdue_items', 'approval_pct', 'payment_overdue', 'material_delayed')),
  CONSTRAINT health_thresholds_direction_check CHECK (direction IN ('high_bad', 'low_bad'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS health_thresholds_tenant_project_metric_uq
  ON health_thresholds (tenant_id, project_id, metric);
--> statement-breakpoint
ALTER TABLE health_thresholds ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE health_thresholds FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS health_thresholds_tenant_isolation ON health_thresholds;
--> statement-breakpoint
CREATE POLICY health_thresholds_tenant_isolation ON health_thresholds
  USING (app_tenant_unset() OR tenant_id = app_current_tenant())
  WITH CHECK (app_tenant_unset() OR tenant_id = app_current_tenant());
--> statement-breakpoint
