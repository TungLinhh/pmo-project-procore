CREATE TYPE "public"."area_level" AS ENUM('project', 'building', 'zone', 'floor', 'area', 'work_item');--> statement-breakpoint
CREATE TYPE "public"."health_status" AS ENUM('ON_TRACK', 'WATCH', 'BEHIND', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."master_status" AS ENUM('ACTIVE', 'INACTIVE', 'MERGED');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('in_app', 'email', 'zalo_oa', 'telegram', 'push');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('pending', 'sent', 'delivered', 'failed', 'not_implemented');--> statement-breakpoint
CREATE TYPE "public"."sync_conflict" AS ENUM('NONE', 'CLIENT_NEWER', 'SERVER_NEWER', 'EQUAL');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'pm', 'pmo', 'site', 'procurement', 'accounting', 'data_admin', 'editor', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."workflow_status" AS ENUM('DRAFT', 'PENDING', 'SUBMITTED', 'REVIEW', 'APPROVED', 'REJECTED', 'OVERDUE', 'CLOSED');--> statement-breakpoint
CREATE TABLE "area_hierarchy" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"parent_id" integer,
	"level" "area_level" NOT NULL,
	"code" varchar(100),
	"name_vi" text,
	"name_en" text,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"user_id" integer,
	"action" varchar(50) NOT NULL,
	"resource_type" varchar(50),
	"resource_id" integer,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_process_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"process_id" integer NOT NULL,
	"ordinal" integer NOT NULL,
	"name_vi" text,
	"content_vi" text,
	"responsibility_vi" text,
	"verification_vi" text
);
--> statement-breakpoint
CREATE TABLE "business_processes" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"code" varchar(100) NOT NULL,
	"name_vi" text,
	"name_en" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "construction_schedule_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"zone_id" integer NOT NULL,
	"source_sheet" text,
	"level_roman" varchar(10),
	"level_arabic" integer,
	"sublevel" integer,
	"ordinal" integer,
	"name_vi" text,
	"name_en" text,
	"progress_pct" real,
	"status" varchar(50),
	"plan_start_date" date,
	"actual_start_date" date,
	"plan_end_date" date,
	"actual_end_date" date,
	"plan_duration_days" integer,
	"baseline_version" integer DEFAULT 1,
	"baseline_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"vendor_id" integer,
	"contract_no" varchar(100) NOT NULL,
	"contract_name" text,
	"signed_date" date,
	"total_value" numeric(18, 2),
	"status" "master_status" DEFAULT 'ACTIVE',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"code" varchar(50),
	"name" text NOT NULL,
	"category" varchar(100),
	"unit" varchar(20),
	"unit_price" numeric(18, 2),
	"status" "master_status" DEFAULT 'ACTIVE',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_acceptance" (
	"id" serial PRIMARY KEY NOT NULL,
	"daily_report_id" integer NOT NULL,
	"ordinal" integer,
	"name_vi" text,
	"quantity" real,
	"unit" varchar(20),
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "daily_infos" (
	"id" serial PRIMARY KEY NOT NULL,
	"daily_report_id" integer NOT NULL,
	"category" varchar(100),
	"description" text
);
--> statement-breakpoint
CREATE TABLE "daily_manpower" (
	"id" serial PRIMARY KEY NOT NULL,
	"daily_report_id" integer NOT NULL,
	"role_code" varchar(50),
	"role_name_vi" text,
	"headcount" integer DEFAULT 0,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "daily_materials" (
	"id" serial PRIMARY KEY NOT NULL,
	"daily_report_id" integer NOT NULL,
	"material_code" varchar(50),
	"name_vi" text,
	"unit" varchar(20),
	"quantity" real,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "daily_recommendations" (
	"id" serial PRIMARY KEY NOT NULL,
	"daily_report_id" integer NOT NULL,
	"ordinal" integer,
	"text" text
);
--> statement-breakpoint
CREATE TABLE "daily_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"report_date" date NOT NULL,
	"source_sheet_name" varchar(255),
	"prepared_by" text,
	"weather_am" text,
	"weather_pm" text,
	"work_items_count" integer DEFAULT 0,
	"manpower_count" integer DEFAULT 0,
	"materials_count" integer DEFAULT 0,
	"acceptance_count" integer DEFAULT 0,
	"status" "workflow_status" DEFAULT 'DRAFT',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"submitted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "daily_safety" (
	"id" serial PRIMARY KEY NOT NULL,
	"daily_report_id" integer NOT NULL,
	"category" varchar(100),
	"description" text
);
--> statement-breakpoint
CREATE TABLE "daily_work_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"daily_report_id" integer NOT NULL,
	"parent_id" integer,
	"ordinal" integer,
	"name_vi" text,
	"system_vi" text,
	"progress_pct" real,
	"plan_start_date" date,
	"plan_end_date" date,
	"actual_start_date" date,
	"actual_end_date" date,
	"lag_days" integer,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "file_uploads" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"project_id" integer,
	"original_filename" text NOT NULL,
	"storage_key" text,
	"file_size" bigint,
	"file_hash" varchar(64),
	"mime_type" varchar(100),
	"expected_doc_type" varchar(50),
	"status" varchar(20) DEFAULT 'PROCESSING',
	"total_rows" integer DEFAULT 0,
	"ok_rows" integer DEFAULT 0,
	"error_rows" integer DEFAULT 0,
	"report_json" jsonb,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generic_sheets" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer,
	"doc_type" varchar(50),
	"source_sheet" text,
	"zone_id" integer,
	"ordinal" integer,
	"col_1" text,
	"col_2" text,
	"col_3" text,
	"col_4" text,
	"col_5" text,
	"col_6" text,
	"col_7" text,
	"col_8" text,
	"col_9" text,
	"col_10" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"contract_id" integer NOT NULL,
	"invoice_no" varchar(100) NOT NULL,
	"invoice_date" date,
	"amount" numeric(18, 2),
	"vat_amount" numeric(18, 2),
	"status" "workflow_status" DEFAULT 'DRAFT',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kpi_targets" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"kpi_code" varchar(100),
	"name_vi" text,
	"target_value" numeric(18, 4),
	"actual_value" numeric(18, 4),
	"unit" varchar(20),
	"period_start" date,
	"period_end" date,
	"version" integer DEFAULT 1,
	"effective_from" date,
	"effective_to" date,
	"approved_by" integer,
	"approved_at" timestamp,
	"period_lock" boolean DEFAULT false,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_submittals" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"material_id" integer,
	"submittal_code" varchar(100),
	"status" "workflow_status" DEFAULT 'DRAFT',
	"sla_days" integer DEFAULT 7,
	"sla_deadline" date,
	"revision_number" integer DEFAULT 0,
	"parent_submittal_id" integer,
	"rejection_reason" text,
	"submitted_by" integer,
	"approved_by" integer,
	"submitted_date" date,
	"approved_date" date,
	"rejected_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"zone_id" integer NOT NULL,
	"source_sheet" text,
	"material_code" varchar(100),
	"name_vi" text,
	"name_en" text,
	"progress_pct" real,
	"request_date_1" date,
	"delivery_date_1" date,
	"request_date_2" date,
	"delivery_date_2" date,
	"request_date_3" date,
	"delivery_date_3" date,
	"request_date_4" date,
	"delivery_date_4" date,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"user_id" integer,
	"project_id" integer,
	"issue_id" integer,
	"channel" "notification_channel" DEFAULT 'in_app',
	"delivery_status" "notification_status" DEFAULT 'pending',
	"sent_at" timestamp,
	"delivered_at" timestamp,
	"severity" varchar(20) DEFAULT 'info',
	"title" text,
	"body" text,
	"resource_type" varchar(50),
	"resource_id" integer,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offline_sync_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"device_id" varchar(100),
	"client_id" varchar(200),
	"resource_type" varchar(50),
	"resource_json" jsonb,
	"client_timestamp" timestamp NOT NULL,
	"client_created_at" timestamp,
	"conflict_resolution" "sync_conflict" DEFAULT 'NONE',
	"server_record_id" integer,
	"superseded_at" timestamp,
	"status" varchar(20) DEFAULT 'PENDING',
	"error_message" text,
	"synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"request_no" varchar(100) NOT NULL,
	"request_date" date,
	"amount" numeric(18, 2),
	"retention_amount" numeric(18, 2) DEFAULT '0',
	"due_date" date,
	"status" "workflow_status" DEFAULT 'DRAFT',
	"approved_by" integer,
	"approved_date" date,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"payment_request_id" integer,
	"vendor_id" integer,
	"contract_no" varchar(100),
	"invoice_no" varchar(100),
	"amount" numeric(18, 2),
	"paid_amount" numeric(18, 2),
	"retention_amount" numeric(18, 2),
	"retention_held" numeric(18, 2) DEFAULT '0',
	"vat_amount" numeric(18, 2),
	"vat_paid" numeric(18, 2) DEFAULT '0',
	"due_date" date,
	"paid_at" timestamp,
	"paid_method" varchar(50),
	"status" "workflow_status" DEFAULT 'DRAFT',
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"code" varchar(50) NOT NULL,
	"name_vi" text,
	"name_en" text,
	"package" varchar(100),
	"rev_prefix" varchar(50),
	"start_date" date,
	"end_date" date,
	"status" "master_status" DEFAULT 'ACTIVE',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"code" varchar(50),
	"name" text NOT NULL,
	"type" varchar(50),
	"status" "master_status" DEFAULT 'ACTIVE',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfa_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"source_sheet" text,
	"ordinal" integer,
	"rfa_code" varchar(100) NOT NULL,
	"description_vi" text,
	"date_ma" date,
	"date_sp" date,
	"date_pm" date,
	"date_tp" date,
	"date_sh" date,
	"approval_date" date,
	"status" "workflow_status" DEFAULT 'DRAFT',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_baselines" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"version" integer NOT NULL,
	"effective_date" date NOT NULL,
	"created_by" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_drawings" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"zone_id" integer NOT NULL,
	"source_sheet" text,
	"drawing_code" varchar(100) NOT NULL,
	"name_vi" text,
	"name_en" text,
	"progress_pct" real,
	"status" "workflow_status" DEFAULT 'DRAFT',
	"planned_submit_date" date,
	"actual_submit_date" date,
	"bql_l1_response" varchar(5),
	"bql_l1_date" date,
	"bql_l1_comment" text,
	"bql_l2_response" varchar(5),
	"bql_l2_date" date,
	"bql_l2_comment" text,
	"bql_l3_response" varchar(5),
	"bql_l3_date" date,
	"bql_l3_comment" text,
	"bql_l4_response" varchar(5),
	"bql_l4_date" date,
	"bql_l4_comment" text,
	"bql_l5_response" varchar(5),
	"bql_l5_date" date,
	"bql_l5_comment" text,
	"rs1_planned_date" date,
	"rs1_actual_date" date,
	"rs2_planned_date" date,
	"rs2_actual_date" date,
	"approval_date" date,
	"rejected_reason" text,
	"rejected_by" integer,
	"rejected_at" timestamp,
	"reverted_to_draft_at" timestamp,
	"reverted_to_draft_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subcontractors" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" text NOT NULL,
	"capability_summary" text,
	"status" "master_status" DEFAULT 'ACTIVE',
	"is_internal_team" boolean DEFAULT false,
	"source_sheet" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" text NOT NULL,
	"system" varchar(100),
	"category" varchar(100),
	"contact" text,
	"status" "master_status" DEFAULT 'ACTIVE',
	"source_sheet" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"code" varchar(50),
	"name" text NOT NULL,
	"lead_worker_id" integer,
	"status" "master_status" DEFAULT 'ACTIVE',
	"legacy_code" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" text,
	"is_ceo" boolean DEFAULT false,
	"role" "user_role" DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"code" varchar(50),
	"name" text NOT NULL,
	"tax_id" varchar(50),
	"contact" text,
	"category" varchar(100),
	"status" "master_status" DEFAULT 'ACTIVE',
	"legacy_code" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wbs" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"parent_id" integer,
	"code" varchar(100),
	"name_vi" text,
	"name_en" text,
	"level" integer DEFAULT 0,
	"sort_order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "work_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"wbs_id" integer,
	"code" varchar(100),
	"name_vi" text,
	"name_en" text,
	"unit" varchar(20),
	"planned_qty" numeric(18, 4),
	"actual_qty" numeric(18, 4),
	"unit_price" numeric(18, 2),
	"baseline_version" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workers" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"code" varchar(50),
	"full_name" text NOT NULL,
	"team_id" integer,
	"phone" varchar(20),
	"role" varchar(50),
	"status" "master_status" DEFAULT 'ACTIVE',
	"legacy_code" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zones" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"code" varchar(50) NOT NULL,
	"name_vi" text,
	"name_en" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "area_hierarchy" ADD CONSTRAINT "area_hierarchy_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area_hierarchy" ADD CONSTRAINT "area_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."area_hierarchy"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_process_steps" ADD CONSTRAINT "business_process_steps_process_id_business_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."business_processes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_processes" ADD CONSTRAINT "business_processes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "construction_schedule_items" ADD CONSTRAINT "construction_schedule_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "construction_schedule_items" ADD CONSTRAINT "construction_schedule_items_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_codes" ADD CONSTRAINT "cost_codes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_acceptance" ADD CONSTRAINT "daily_acceptance_daily_report_id_daily_reports_id_fk" FOREIGN KEY ("daily_report_id") REFERENCES "public"."daily_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_infos" ADD CONSTRAINT "daily_infos_daily_report_id_daily_reports_id_fk" FOREIGN KEY ("daily_report_id") REFERENCES "public"."daily_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_manpower" ADD CONSTRAINT "daily_manpower_daily_report_id_daily_reports_id_fk" FOREIGN KEY ("daily_report_id") REFERENCES "public"."daily_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_materials" ADD CONSTRAINT "daily_materials_daily_report_id_daily_reports_id_fk" FOREIGN KEY ("daily_report_id") REFERENCES "public"."daily_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_recommendations" ADD CONSTRAINT "daily_recommendations_daily_report_id_daily_reports_id_fk" FOREIGN KEY ("daily_report_id") REFERENCES "public"."daily_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_reports" ADD CONSTRAINT "daily_reports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_safety" ADD CONSTRAINT "daily_safety_daily_report_id_daily_reports_id_fk" FOREIGN KEY ("daily_report_id") REFERENCES "public"."daily_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_work_items" ADD CONSTRAINT "daily_work_items_daily_report_id_daily_reports_id_fk" FOREIGN KEY ("daily_report_id") REFERENCES "public"."daily_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_uploads" ADD CONSTRAINT "file_uploads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_uploads" ADD CONSTRAINT "file_uploads_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generic_sheets" ADD CONSTRAINT "generic_sheets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generic_sheets" ADD CONSTRAINT "generic_sheets_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_targets" ADD CONSTRAINT "kpi_targets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_targets" ADD CONSTRAINT "kpi_targets_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_submittals" ADD CONSTRAINT "material_submittals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_submittals" ADD CONSTRAINT "material_submittals_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_submittals" ADD CONSTRAINT "material_submittals_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_submittals" ADD CONSTRAINT "material_submittals_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_submittals" ADD CONSTRAINT "ms_parent_fk" FOREIGN KEY ("parent_submittal_id") REFERENCES "public"."material_submittals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_sync_queue" ADD CONSTRAINT "offline_sync_queue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payment_request_id_payment_requests_id_fk" FOREIGN KEY ("payment_request_id") REFERENCES "public"."payment_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfa_log" ADD CONSTRAINT "rfa_log_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_baselines" ADD CONSTRAINT "schedule_baselines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_baselines" ADD CONSTRAINT "schedule_baselines_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_drawings" ADD CONSTRAINT "shop_drawings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_drawings" ADD CONSTRAINT "shop_drawings_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_drawings" ADD CONSTRAINT "shop_drawings_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_drawings" ADD CONSTRAINT "shop_drawings_reverted_to_draft_by_users_id_fk" FOREIGN KEY ("reverted_to_draft_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcontractors" ADD CONSTRAINT "subcontractors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wbs" ADD CONSTRAINT "wbs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_wbs_id_wbs_id_fk" FOREIGN KEY ("wbs_id") REFERENCES "public"."wbs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zones" ADD CONSTRAINT "zones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "area_project_idx" ON "area_hierarchy" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "area_level_idx" ON "area_hierarchy" USING btree ("project_id","level");--> statement-breakpoint
CREATE INDEX "audit_resource_idx" ON "audit_log" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "audit_user_idx" ON "audit_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bp_step_ordinal_idx" ON "business_process_steps" USING btree ("process_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "bp_tenant_code_idx" ON "business_processes" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "cs_project_zone_idx" ON "construction_schedule_items" USING btree ("project_id","zone_id");--> statement-breakpoint
CREATE INDEX "cs_baseline_idx" ON "construction_schedule_items" USING btree ("baseline_id");--> statement-breakpoint
CREATE INDEX "contract_project_idx" ON "contracts" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "contract_vendor_idx" ON "contracts" USING btree ("vendor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_project_no_idx" ON "contracts" USING btree ("project_id","contract_no");--> statement-breakpoint
CREATE UNIQUE INDEX "uploads_tenant_hash_idx" ON "file_uploads" USING btree ("tenant_id","file_hash");--> statement-breakpoint
CREATE INDEX "invoice_contract_idx" ON "invoices" USING btree ("contract_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_contract_no_idx" ON "invoices" USING btree ("contract_id","invoice_no");--> statement-breakpoint
CREATE INDEX "kpi_project_idx" ON "kpi_targets" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "kpi_code_idx" ON "kpi_targets" USING btree ("kpi_code");--> statement-breakpoint
CREATE INDEX "kpi_period_idx" ON "kpi_targets" USING btree ("period_start","period_end");--> statement-breakpoint
CREATE INDEX "ms_project_idx" ON "material_submittals" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ms_material_idx" ON "material_submittals" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "ms_status_idx" ON "material_submittals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ms_deadline_idx" ON "material_submittals" USING btree ("sla_deadline");--> statement-breakpoint
CREATE INDEX "mat_project_zone_idx" ON "materials" USING btree ("project_id","zone_id");--> statement-breakpoint
CREATE INDEX "notif_user_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "notif_project_idx" ON "notifications" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "notif_channel_idx" ON "notifications" USING btree ("channel","delivery_status");--> statement-breakpoint
CREATE INDEX "sync_user_idx" ON "offline_sync_queue" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "sync_client_idx" ON "offline_sync_queue" USING btree ("client_id","resource_type");--> statement-breakpoint
CREATE INDEX "sync_resource_idx" ON "offline_sync_queue" USING btree ("resource_type","server_record_id");--> statement-breakpoint
CREATE INDEX "preq_invoice_idx" ON "payment_requests" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "preq_status_idx" ON "payment_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "preq_due_idx" ON "payment_requests" USING btree ("due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "preq_invoice_no_idx" ON "payment_requests" USING btree ("invoice_id","request_no");--> statement-breakpoint
CREATE INDEX "pay_project_idx" ON "payments" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "pay_request_idx" ON "payments" USING btree ("payment_request_id");--> statement-breakpoint
CREATE INDEX "pay_due_idx" ON "payments" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "pay_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_tenant_code_idx" ON "projects" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "rfa_project_code_idx" ON "rfa_log" USING btree ("project_id","rfa_code");--> statement-breakpoint
CREATE INDEX "sb_project_idx" ON "schedule_baselines" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sb_project_version_idx" ON "schedule_baselines" USING btree ("project_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_project_code_idx" ON "shop_drawings" USING btree ("project_id","drawing_code");--> statement-breakpoint
CREATE INDEX "shop_project_zone_idx" ON "shop_drawings" USING btree ("project_id","zone_id");--> statement-breakpoint
CREATE INDEX "shop_status_idx" ON "shop_drawings" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_tenant_email_idx" ON "users" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "zones_project_code_idx" ON "zones" USING btree ("project_id","code");