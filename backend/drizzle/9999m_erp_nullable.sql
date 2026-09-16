-- ERP connector-nullable fields (Wave D4): sftp_* only apply to connector='sftp'.
ALTER TABLE erp_profiles ALTER COLUMN sftp_host DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE erp_profiles ALTER COLUMN sftp_user DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE erp_profiles ALTER COLUMN remote_path DROP NOT NULL;
--> statement-breakpoint
