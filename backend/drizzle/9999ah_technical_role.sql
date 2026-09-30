-- SRS Mục 1.4/6: thêm persona Phòng Kỹ thuật/Thiết kế.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'technical';
--> statement-breakpoint
ALTER TABLE sso_configs DROP CONSTRAINT IF EXISTS sso_configs_role_check;
--> statement-breakpoint
ALTER TABLE sso_configs ADD CONSTRAINT sso_configs_role_check
  CHECK (default_role IN ('pm','pmo','site','procurement','accounting','technical','admin'));
