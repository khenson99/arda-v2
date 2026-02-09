CREATE TYPE "public"."print_job_status" AS ENUM('pending', 'printing', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."exception_resolution_type" AS ENUM('follow_up_po', 'replacement_card', 'return_to_supplier', 'credit', 'accept_as_is');--> statement-breakpoint
CREATE TYPE "public"."exception_severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."exception_status" AS ENUM('open', 'in_progress', 'resolved', 'escalated');--> statement-breakpoint
CREATE TYPE "public"."exception_type" AS ENUM('short_shipment', 'damaged', 'quality_reject', 'wrong_item', 'overage');--> statement-breakpoint
CREATE TYPE "public"."receipt_status" AS ENUM('complete', 'partial', 'exception');--> statement-breakpoint
CREATE TYPE "public"."wo_hold_reason" AS ENUM('material_shortage', 'equipment_failure', 'quality_hold', 'labor_unavailable', 'other');--> statement-breakpoint
CREATE TABLE "kanban"."print_job_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"print_job_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"previous_print_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kanban"."print_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"status" "print_job_status" DEFAULT 'pending' NOT NULL,
	"format" varchar(50) NOT NULL,
	"printer_class" varchar(20) NOT NULL,
	"card_count" integer NOT NULL,
	"is_reprint" boolean DEFAULT false NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"requested_by_user_id" uuid,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders"."production_operation_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"work_order_id" uuid NOT NULL,
	"routing_step_id" uuid,
	"operation_type" varchar(50) NOT NULL,
	"actual_minutes" integer,
	"quantity_produced" integer,
	"quantity_rejected" integer,
	"quantity_scrapped" integer,
	"operator_user_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders"."production_queue_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"work_order_id" uuid NOT NULL,
	"card_id" uuid,
	"loop_id" uuid,
	"part_id" uuid NOT NULL,
	"facility_id" uuid NOT NULL,
	"priority_score" numeric(8, 4) DEFAULT '0' NOT NULL,
	"manual_priority" integer DEFAULT 0 NOT NULL,
	"is_expedited" boolean DEFAULT false NOT NULL,
	"total_steps" integer DEFAULT 0 NOT NULL,
	"completed_steps" integer DEFAULT 0 NOT NULL,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"entered_queue_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders"."receipt_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"receipt_id" uuid NOT NULL,
	"order_line_id" uuid NOT NULL,
	"part_id" uuid NOT NULL,
	"quantity_expected" integer NOT NULL,
	"quantity_accepted" integer DEFAULT 0 NOT NULL,
	"quantity_damaged" integer DEFAULT 0 NOT NULL,
	"quantity_rejected" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders"."receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"receipt_number" varchar(50) NOT NULL,
	"order_id" uuid NOT NULL,
	"order_type" varchar(30) NOT NULL,
	"status" "receipt_status" DEFAULT 'complete' NOT NULL,
	"received_by_user_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders"."receiving_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"receipt_id" uuid NOT NULL,
	"receipt_line_id" uuid,
	"order_id" uuid NOT NULL,
	"order_type" varchar(30) NOT NULL,
	"exception_type" "exception_type" NOT NULL,
	"severity" "exception_severity" DEFAULT 'medium' NOT NULL,
	"status" "exception_status" DEFAULT 'open' NOT NULL,
	"quantity_affected" integer NOT NULL,
	"description" text,
	"resolution_type" "exception_resolution_type",
	"resolution_notes" text,
	"resolved_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"follow_up_order_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders"."routing_template_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"work_center_id" uuid NOT NULL,
	"step_number" integer NOT NULL,
	"operation_name" varchar(255) NOT NULL,
	"estimated_minutes" integer,
	"instructions" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders"."routing_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"part_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders"."work_center_capacity_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"work_center_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_hour" integer NOT NULL,
	"end_hour" integer NOT NULL,
	"available_minutes" integer NOT NULL,
	"allocated_minutes" integer DEFAULT 0 NOT NULL,
	"effective_date" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders"."work_orders" ADD COLUMN "quantity_scrapped" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders"."work_orders" ADD COLUMN "is_expedited" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders"."work_orders" ADD COLUMN "is_rework" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders"."work_orders" ADD COLUMN "parent_work_order_id" uuid;--> statement-breakpoint
ALTER TABLE "orders"."work_orders" ADD COLUMN "hold_reason" "wo_hold_reason";--> statement-breakpoint
ALTER TABLE "orders"."work_orders" ADD COLUMN "hold_notes" text;--> statement-breakpoint
ALTER TABLE "orders"."work_orders" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "orders"."work_orders" ADD COLUMN "routing_template_id" uuid;--> statement-breakpoint
ALTER TABLE "kanban"."print_job_items" ADD CONSTRAINT "print_job_items_print_job_id_print_jobs_id_fk" FOREIGN KEY ("print_job_id") REFERENCES "kanban"."print_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban"."print_job_items" ADD CONSTRAINT "print_job_items_card_id_kanban_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "kanban"."kanban_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders"."production_operation_logs" ADD CONSTRAINT "production_operation_logs_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "orders"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders"."production_operation_logs" ADD CONSTRAINT "production_operation_logs_routing_step_id_work_order_routings_id_fk" FOREIGN KEY ("routing_step_id") REFERENCES "orders"."work_order_routings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders"."production_queue_entries" ADD CONSTRAINT "production_queue_entries_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "orders"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders"."receipt_lines" ADD CONSTRAINT "receipt_lines_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "orders"."receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders"."receiving_exceptions" ADD CONSTRAINT "receiving_exceptions_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "orders"."receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders"."receiving_exceptions" ADD CONSTRAINT "receiving_exceptions_receipt_line_id_receipt_lines_id_fk" FOREIGN KEY ("receipt_line_id") REFERENCES "orders"."receipt_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders"."routing_template_steps" ADD CONSTRAINT "routing_template_steps_template_id_routing_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "orders"."routing_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders"."routing_template_steps" ADD CONSTRAINT "routing_template_steps_work_center_id_work_centers_id_fk" FOREIGN KEY ("work_center_id") REFERENCES "orders"."work_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders"."work_center_capacity_windows" ADD CONSTRAINT "work_center_capacity_windows_work_center_id_work_centers_id_fk" FOREIGN KEY ("work_center_id") REFERENCES "orders"."work_centers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "print_job_items_job_idx" ON "kanban"."print_job_items" USING btree ("print_job_id");--> statement-breakpoint
CREATE INDEX "print_job_items_card_idx" ON "kanban"."print_job_items" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "print_jobs_tenant_idx" ON "kanban"."print_jobs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "print_jobs_status_idx" ON "kanban"."print_jobs" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "prod_op_log_tenant_idx" ON "orders"."production_operation_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "prod_op_log_wo_idx" ON "orders"."production_operation_logs" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "prod_op_log_step_idx" ON "orders"."production_operation_logs" USING btree ("routing_step_id");--> statement-breakpoint
CREATE INDEX "prod_op_log_type_idx" ON "orders"."production_operation_logs" USING btree ("operation_type");--> statement-breakpoint
CREATE INDEX "prod_queue_tenant_idx" ON "orders"."production_queue_entries" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prod_queue_wo_idx" ON "orders"."production_queue_entries" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "prod_queue_card_idx" ON "orders"."production_queue_entries" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "prod_queue_status_idx" ON "orders"."production_queue_entries" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "prod_queue_priority_idx" ON "orders"."production_queue_entries" USING btree ("tenant_id","priority_score");--> statement-breakpoint
CREATE INDEX "prod_queue_facility_idx" ON "orders"."production_queue_entries" USING btree ("facility_id");--> statement-breakpoint
CREATE INDEX "receipt_lines_tenant_idx" ON "orders"."receipt_lines" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "receipt_lines_receipt_idx" ON "orders"."receipt_lines" USING btree ("receipt_id");--> statement-breakpoint
CREATE INDEX "receipt_lines_part_idx" ON "orders"."receipt_lines" USING btree ("part_id");--> statement-breakpoint
CREATE UNIQUE INDEX "receipt_tenant_number_idx" ON "orders"."receipts" USING btree ("tenant_id","receipt_number");--> statement-breakpoint
CREATE INDEX "receipt_tenant_idx" ON "orders"."receipts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "receipt_order_idx" ON "orders"."receipts" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "receipt_status_idx" ON "orders"."receipts" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "recv_exc_tenant_idx" ON "orders"."receiving_exceptions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "recv_exc_receipt_idx" ON "orders"."receiving_exceptions" USING btree ("receipt_id");--> statement-breakpoint
CREATE INDEX "recv_exc_order_idx" ON "orders"."receiving_exceptions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "recv_exc_status_idx" ON "orders"."receiving_exceptions" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "recv_exc_type_idx" ON "orders"."receiving_exceptions" USING btree ("exception_type");--> statement-breakpoint
CREATE INDEX "routing_tpl_step_tenant_idx" ON "orders"."routing_template_steps" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "routing_tpl_step_tpl_idx" ON "orders"."routing_template_steps" USING btree ("template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "routing_tpl_step_number_idx" ON "orders"."routing_template_steps" USING btree ("template_id","step_number");--> statement-breakpoint
CREATE INDEX "routing_tpl_tenant_idx" ON "orders"."routing_templates" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "routing_tpl_part_idx" ON "orders"."routing_templates" USING btree ("part_id");--> statement-breakpoint
CREATE INDEX "routing_tpl_active_idx" ON "orders"."routing_templates" USING btree ("tenant_id","is_active");--> statement-breakpoint
CREATE INDEX "wc_cap_tenant_idx" ON "orders"."work_center_capacity_windows" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "wc_cap_wc_idx" ON "orders"."work_center_capacity_windows" USING btree ("work_center_id");--> statement-breakpoint
CREATE INDEX "wc_cap_day_idx" ON "orders"."work_center_capacity_windows" USING btree ("work_center_id","day_of_week");--> statement-breakpoint
CREATE INDEX "wo_parent_idx" ON "orders"."work_orders" USING btree ("parent_work_order_id");--> statement-breakpoint
CREATE INDEX "wo_expedited_idx" ON "orders"."work_orders" USING btree ("tenant_id","is_expedited");