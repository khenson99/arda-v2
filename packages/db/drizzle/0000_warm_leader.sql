CREATE SCHEMA "auth";
--> statement-breakpoint
CREATE SCHEMA "locations";
--> statement-breakpoint
CREATE SCHEMA "catalog";
--> statement-breakpoint
CREATE SCHEMA "kanban";
--> statement-breakpoint
CREATE SCHEMA "orders";
--> statement-breakpoint
CREATE SCHEMA "notifications";
--> statement-breakpoint
CREATE SCHEMA "billing";
--> statement-breakpoint
CREATE SCHEMA "audit";
--> statement-breakpoint
CREATE TYPE "public"."oauth_provider" AS ENUM('google');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('tenant_admin', 'inventory_manager', 'procurement_manager', 'receiving_manager', 'ecommerce_director', 'salesperson', 'executive');--> statement-breakpoint
CREATE TYPE "public"."part_type" AS ENUM('raw_material', 'component', 'subassembly', 'finished_good', 'consumable', 'packaging', 'other');--> statement-breakpoint
CREATE TYPE "public"."unit_of_measure" AS ENUM('each', 'box', 'case', 'pallet', 'kg', 'lb', 'meter', 'foot', 'liter', 'gallon', 'roll', 'sheet', 'pair', 'set', 'other');--> statement-breakpoint
CREATE TYPE "public"."card_mode" AS ENUM('single', 'multi');--> statement-breakpoint
CREATE TYPE "public"."card_stage" AS ENUM('created', 'triggered', 'ordered', 'in_transit', 'received', 'restocked');--> statement-breakpoint
CREATE TYPE "public"."loop_type" AS ENUM('procurement', 'production', 'transfer');--> statement-breakpoint
CREATE TYPE "public"."po_status" AS ENUM('draft', 'pending_approval', 'approved', 'sent', 'acknowledged', 'partially_received', 'received', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."routing_step_status" AS ENUM('pending', 'in_progress', 'complete', 'on_hold', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."transfer_status" AS ENUM('draft', 'requested', 'approved', 'picking', 'shipped', 'in_transit', 'received', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."wo_status" AS ENUM('draft', 'scheduled', 'in_progress', 'on_hold', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('in_app', 'email', 'webhook');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('card_triggered', 'po_created', 'po_sent', 'po_received', 'stockout_warning', 'relowisa_recommendation', 'exception_alert', 'wo_status_change', 'transfer_status_change', 'system_alert');--> statement-breakpoint
CREATE TABLE "auth"."tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"domain" varchar(255),
	"logo_url" text,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"stripe_customer_id" varchar(255),
	"stripe_subscription_id" varchar(255),
	"plan_id" varchar(50) DEFAULT 'free' NOT NULL,
	"card_limit" integer DEFAULT 50 NOT NULL,
	"seat_limit" integer DEFAULT 3 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "auth"."oauth_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "oauth_provider" NOT NULL,
	"provider_account_id" varchar(255) NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(255) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"replaced_by_token_id" uuid,
	"user_agent" text,
	"ip_address" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "auth"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"avatar_url" text,
	"role" "user_role" DEFAULT 'inventory_manager' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations"."facilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"code" varchar(50) NOT NULL,
	"type" varchar(50) DEFAULT 'warehouse' NOT NULL,
	"address_line_1" varchar(255),
	"address_line_2" varchar(255),
	"city" varchar(100),
	"state" varchar(100),
	"postal_code" varchar(20),
	"country" varchar(100) DEFAULT 'US',
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"timezone" varchar(50) DEFAULT 'America/Chicago',
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations"."storage_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"facility_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"code" varchar(100) NOT NULL,
	"zone" varchar(100),
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog"."bom_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"parent_part_id" uuid NOT NULL,
	"child_part_id" uuid NOT NULL,
	"quantity_per" numeric(10, 4) NOT NULL,
	"sort_order" integer DEFAULT 0,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog"."part_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"parent_category_id" uuid,
	"description" text,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog"."parts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"part_number" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"category_id" uuid,
	"type" "part_type" DEFAULT 'component' NOT NULL,
	"uom" "unit_of_measure" DEFAULT 'each' NOT NULL,
	"unit_cost" numeric(12, 4),
	"unit_price" numeric(12, 4),
	"weight" numeric(10, 4),
	"upc_barcode" varchar(50),
	"manufacturer_part_number" varchar(100),
	"image_url" text,
	"specifications" jsonb DEFAULT '{}'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_sellable" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog"."supplier_parts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"part_id" uuid NOT NULL,
	"supplier_part_number" varchar(100),
	"unit_cost" numeric(12, 4),
	"minimum_order_qty" integer DEFAULT 1,
	"lead_time_days" integer,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog"."suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"code" varchar(50),
	"contact_name" varchar(255),
	"contact_email" varchar(255),
	"contact_phone" varchar(50),
	"address_line_1" varchar(255),
	"address_line_2" varchar(255),
	"city" varchar(100),
	"state" varchar(100),
	"postal_code" varchar(20),
	"country" varchar(100) DEFAULT 'US',
	"website" text,
	"notes" text,
	"stated_lead_time_days" integer,
	"payment_terms" varchar(100),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kanban"."card_stage_transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"loop_id" uuid NOT NULL,
	"cycle_number" integer NOT NULL,
	"from_stage" "card_stage",
	"to_stage" "card_stage" NOT NULL,
	"transitioned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"transitioned_by_user_id" uuid,
	"method" varchar(50) DEFAULT 'manual' NOT NULL,
	"notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "kanban"."kanban_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"loop_id" uuid NOT NULL,
	"card_number" integer DEFAULT 1 NOT NULL,
	"current_stage" "card_stage" DEFAULT 'created' NOT NULL,
	"current_stage_entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"linked_purchase_order_id" uuid,
	"linked_work_order_id" uuid,
	"linked_transfer_order_id" uuid,
	"last_printed_at" timestamp with time zone,
	"print_count" integer DEFAULT 0 NOT NULL,
	"completed_cycles" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kanban"."kanban_loops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"part_id" uuid NOT NULL,
	"facility_id" uuid NOT NULL,
	"storage_location_id" uuid,
	"loop_type" "loop_type" NOT NULL,
	"card_mode" "card_mode" DEFAULT 'single' NOT NULL,
	"min_quantity" integer NOT NULL,
	"order_quantity" integer NOT NULL,
	"number_of_cards" integer DEFAULT 1 NOT NULL,
	"safety_stock_days" numeric(5, 1) DEFAULT '0',
	"primary_supplier_id" uuid,
	"source_facility_id" uuid,
	"stated_lead_time_days" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kanban"."kanban_parameter_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"loop_id" uuid NOT NULL,
	"change_type" varchar(50) NOT NULL,
	"previous_min_quantity" integer,
	"new_min_quantity" integer,
	"previous_order_quantity" integer,
	"new_order_quantity" integer,
	"previous_number_of_cards" integer,
	"new_number_of_cards" integer,
	"reason" text,
	"changed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kanban"."relowisa_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"loop_id" uuid NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"recommended_min_quantity" integer,
	"recommended_order_quantity" integer,
	"recommended_number_of_cards" integer,
	"confidence_score" numeric(5, 2),
	"reasoning" text,
	"data_points_used" integer,
	"projected_impact" jsonb DEFAULT '{}'::jsonb,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders"."purchase_order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"part_id" uuid NOT NULL,
	"kanban_card_id" uuid,
	"line_number" integer NOT NULL,
	"quantity_ordered" integer NOT NULL,
	"quantity_received" integer DEFAULT 0 NOT NULL,
	"unit_cost" numeric(12, 4) NOT NULL,
	"line_total" numeric(12, 2) NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders"."purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"po_number" varchar(50) NOT NULL,
	"supplier_id" uuid NOT NULL,
	"facility_id" uuid NOT NULL,
	"status" "po_status" DEFAULT 'draft' NOT NULL,
	"order_date" timestamp with time zone,
	"expected_delivery_date" timestamp with time zone,
	"actual_delivery_date" timestamp with time zone,
	"subtotal" numeric(12, 2) DEFAULT '0',
	"tax_amount" numeric(12, 2) DEFAULT '0',
	"shipping_amount" numeric(12, 2) DEFAULT '0',
	"total_amount" numeric(12, 2) DEFAULT '0',
	"currency" varchar(3) DEFAULT 'USD',
	"notes" text,
	"internal_notes" text,
	"sent_at" timestamp with time zone,
	"sent_to_email" varchar(255),
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_by_user_id" uuid,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders"."transfer_order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"transfer_order_id" uuid NOT NULL,
	"part_id" uuid NOT NULL,
	"quantity_requested" integer NOT NULL,
	"quantity_shipped" integer DEFAULT 0 NOT NULL,
	"quantity_received" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders"."transfer_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"to_number" varchar(50) NOT NULL,
	"source_facility_id" uuid NOT NULL,
	"destination_facility_id" uuid NOT NULL,
	"status" "transfer_status" DEFAULT 'draft' NOT NULL,
	"requested_date" timestamp with time zone,
	"shipped_date" timestamp with time zone,
	"received_date" timestamp with time zone,
	"notes" text,
	"kanban_card_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders"."work_centers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"facility_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"code" varchar(50) NOT NULL,
	"description" text,
	"capacity_per_hour" numeric(10, 2),
	"cost_per_hour" numeric(10, 2),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders"."work_order_routings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"work_order_id" uuid NOT NULL,
	"work_center_id" uuid NOT NULL,
	"step_number" integer NOT NULL,
	"operation_name" varchar(255) NOT NULL,
	"status" "routing_step_status" DEFAULT 'pending' NOT NULL,
	"estimated_minutes" integer,
	"actual_minutes" integer,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders"."work_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"wo_number" varchar(50) NOT NULL,
	"part_id" uuid NOT NULL,
	"facility_id" uuid NOT NULL,
	"status" "wo_status" DEFAULT 'draft' NOT NULL,
	"quantity_to_produce" integer NOT NULL,
	"quantity_produced" integer DEFAULT 0 NOT NULL,
	"quantity_rejected" integer DEFAULT 0 NOT NULL,
	"scheduled_start_date" timestamp with time zone,
	"scheduled_end_date" timestamp with time zone,
	"actual_start_date" timestamp with time zone,
	"actual_end_date" timestamp with time zone,
	"priority" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"kanban_card_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications"."notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"notification_type" "notification_type" NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications"."notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" varchar(255) NOT NULL,
	"body" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"action_url" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing"."subscription_plans" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"monthly_price_cents" integer NOT NULL,
	"annual_price_cents" integer,
	"card_limit" integer NOT NULL,
	"seat_limit" integer NOT NULL,
	"card_overage_price_cents" integer,
	"seat_overage_price_cents" integer,
	"features" jsonb DEFAULT '{}'::jsonb,
	"stripe_price_id_monthly" varchar(255),
	"stripe_price_id_annual" varchar(255),
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing"."usage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"card_count" integer DEFAULT 0 NOT NULL,
	"seat_count" integer DEFAULT 0 NOT NULL,
	"card_overage" integer DEFAULT 0 NOT NULL,
	"seat_overage" integer DEFAULT 0 NOT NULL,
	"reported_to_stripe" boolean DEFAULT false NOT NULL,
	"stripe_usage_record_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit"."audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" uuid,
	"previous_state" jsonb,
	"new_state" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"ip_address" varchar(45),
	"user_agent" text,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth"."oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "auth"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations"."storage_locations" ADD CONSTRAINT "storage_locations_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "locations"."facilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."bom_items" ADD CONSTRAINT "bom_items_parent_part_id_parts_id_fk" FOREIGN KEY ("parent_part_id") REFERENCES "catalog"."parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."bom_items" ADD CONSTRAINT "bom_items_child_part_id_parts_id_fk" FOREIGN KEY ("child_part_id") REFERENCES "catalog"."parts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."parts" ADD CONSTRAINT "parts_category_id_part_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "catalog"."part_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."supplier_parts" ADD CONSTRAINT "supplier_parts_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "catalog"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."supplier_parts" ADD CONSTRAINT "supplier_parts_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "catalog"."parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban"."card_stage_transitions" ADD CONSTRAINT "card_stage_transitions_card_id_kanban_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "kanban"."kanban_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban"."card_stage_transitions" ADD CONSTRAINT "card_stage_transitions_loop_id_kanban_loops_id_fk" FOREIGN KEY ("loop_id") REFERENCES "kanban"."kanban_loops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban"."kanban_cards" ADD CONSTRAINT "kanban_cards_loop_id_kanban_loops_id_fk" FOREIGN KEY ("loop_id") REFERENCES "kanban"."kanban_loops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban"."kanban_parameter_history" ADD CONSTRAINT "kanban_parameter_history_loop_id_kanban_loops_id_fk" FOREIGN KEY ("loop_id") REFERENCES "kanban"."kanban_loops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban"."relowisa_recommendations" ADD CONSTRAINT "relowisa_recommendations_loop_id_kanban_loops_id_fk" FOREIGN KEY ("loop_id") REFERENCES "kanban"."kanban_loops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders"."purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "orders"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders"."transfer_order_lines" ADD CONSTRAINT "transfer_order_lines_transfer_order_id_transfer_orders_id_fk" FOREIGN KEY ("transfer_order_id") REFERENCES "orders"."transfer_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders"."work_order_routings" ADD CONSTRAINT "work_order_routings_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "orders"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders"."work_order_routings" ADD CONSTRAINT "work_order_routings_work_center_id_work_centers_id_fk" FOREIGN KEY ("work_center_id") REFERENCES "orders"."work_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tenants_slug_idx" ON "auth"."tenants" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "tenants_stripe_customer_idx" ON "auth"."tenants" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_provider_account_idx" ON "auth"."oauth_accounts" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE INDEX "oauth_user_idx" ON "auth"."oauth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_idx" ON "auth"."refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_hash_idx" ON "auth"."refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "users_tenant_email_idx" ON "auth"."users" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "users_tenant_idx" ON "auth"."users" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "auth"."users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "facilities_tenant_code_idx" ON "locations"."facilities" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "facilities_tenant_idx" ON "locations"."facilities" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "storage_locations_tenant_facility_code_idx" ON "locations"."storage_locations" USING btree ("tenant_id","facility_id","code");--> statement-breakpoint
CREATE INDEX "storage_locations_tenant_idx" ON "locations"."storage_locations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "storage_locations_facility_idx" ON "locations"."storage_locations" USING btree ("facility_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bom_items_parent_child_idx" ON "catalog"."bom_items" USING btree ("tenant_id","parent_part_id","child_part_id");--> statement-breakpoint
CREATE INDEX "bom_items_tenant_idx" ON "catalog"."bom_items" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "bom_items_parent_idx" ON "catalog"."bom_items" USING btree ("parent_part_id");--> statement-breakpoint
CREATE INDEX "bom_items_child_idx" ON "catalog"."bom_items" USING btree ("child_part_id");--> statement-breakpoint
CREATE INDEX "part_categories_tenant_idx" ON "catalog"."part_categories" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "part_categories_tenant_name_idx" ON "catalog"."part_categories" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "parts_tenant_partnumber_idx" ON "catalog"."parts" USING btree ("tenant_id","part_number");--> statement-breakpoint
CREATE INDEX "parts_tenant_idx" ON "catalog"."parts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "parts_category_idx" ON "catalog"."parts" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "parts_upc_idx" ON "catalog"."parts" USING btree ("upc_barcode");--> statement-breakpoint
CREATE INDEX "parts_sellable_idx" ON "catalog"."parts" USING btree ("tenant_id","is_sellable");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_parts_tenant_supplier_part_idx" ON "catalog"."supplier_parts" USING btree ("tenant_id","supplier_id","part_id");--> statement-breakpoint
CREATE INDEX "supplier_parts_tenant_idx" ON "catalog"."supplier_parts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "supplier_parts_part_idx" ON "catalog"."supplier_parts" USING btree ("part_id");--> statement-breakpoint
CREATE INDEX "supplier_parts_supplier_idx" ON "catalog"."supplier_parts" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "suppliers_tenant_idx" ON "catalog"."suppliers" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_tenant_code_idx" ON "catalog"."suppliers" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "card_transitions_tenant_idx" ON "kanban"."card_stage_transitions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "card_transitions_card_idx" ON "kanban"."card_stage_transitions" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "card_transitions_loop_idx" ON "kanban"."card_stage_transitions" USING btree ("loop_id");--> statement-breakpoint
CREATE INDEX "card_transitions_time_idx" ON "kanban"."card_stage_transitions" USING btree ("transitioned_at");--> statement-breakpoint
CREATE INDEX "card_transitions_cycle_idx" ON "kanban"."card_stage_transitions" USING btree ("card_id","cycle_number");--> statement-breakpoint
CREATE INDEX "kanban_cards_tenant_idx" ON "kanban"."kanban_cards" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "kanban_cards_loop_idx" ON "kanban"."kanban_cards" USING btree ("loop_id");--> statement-breakpoint
CREATE INDEX "kanban_cards_stage_idx" ON "kanban"."kanban_cards" USING btree ("tenant_id","current_stage");--> statement-breakpoint
CREATE UNIQUE INDEX "kanban_cards_loop_number_idx" ON "kanban"."kanban_cards" USING btree ("loop_id","card_number");--> statement-breakpoint
CREATE INDEX "kanban_loops_tenant_idx" ON "kanban"."kanban_loops" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "kanban_loops_part_idx" ON "kanban"."kanban_loops" USING btree ("part_id");--> statement-breakpoint
CREATE INDEX "kanban_loops_facility_idx" ON "kanban"."kanban_loops" USING btree ("facility_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kanban_loops_unique_idx" ON "kanban"."kanban_loops" USING btree ("tenant_id","part_id","facility_id","loop_type");--> statement-breakpoint
CREATE INDEX "param_history_tenant_idx" ON "kanban"."kanban_parameter_history" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "param_history_loop_idx" ON "kanban"."kanban_parameter_history" USING btree ("loop_id");--> statement-breakpoint
CREATE INDEX "param_history_time_idx" ON "kanban"."kanban_parameter_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "relowisa_tenant_idx" ON "kanban"."relowisa_recommendations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "relowisa_loop_idx" ON "kanban"."relowisa_recommendations" USING btree ("loop_id");--> statement-breakpoint
CREATE INDEX "relowisa_status_idx" ON "kanban"."relowisa_recommendations" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "po_lines_tenant_idx" ON "orders"."purchase_order_lines" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "po_lines_po_idx" ON "orders"."purchase_order_lines" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "po_lines_part_idx" ON "orders"."purchase_order_lines" USING btree ("part_id");--> statement-breakpoint
CREATE INDEX "po_lines_card_idx" ON "orders"."purchase_order_lines" USING btree ("kanban_card_id");--> statement-breakpoint
CREATE UNIQUE INDEX "po_tenant_number_idx" ON "orders"."purchase_orders" USING btree ("tenant_id","po_number");--> statement-breakpoint
CREATE INDEX "po_tenant_idx" ON "orders"."purchase_orders" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "po_supplier_idx" ON "orders"."purchase_orders" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "po_status_idx" ON "orders"."purchase_orders" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "po_facility_idx" ON "orders"."purchase_orders" USING btree ("facility_id");--> statement-breakpoint
CREATE INDEX "to_lines_tenant_idx" ON "orders"."transfer_order_lines" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "to_lines_to_idx" ON "orders"."transfer_order_lines" USING btree ("transfer_order_id");--> statement-breakpoint
CREATE INDEX "to_lines_part_idx" ON "orders"."transfer_order_lines" USING btree ("part_id");--> statement-breakpoint
CREATE UNIQUE INDEX "to_tenant_number_idx" ON "orders"."transfer_orders" USING btree ("tenant_id","to_number");--> statement-breakpoint
CREATE INDEX "to_tenant_idx" ON "orders"."transfer_orders" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "to_source_facility_idx" ON "orders"."transfer_orders" USING btree ("source_facility_id");--> statement-breakpoint
CREATE INDEX "to_dest_facility_idx" ON "orders"."transfer_orders" USING btree ("destination_facility_id");--> statement-breakpoint
CREATE INDEX "to_status_idx" ON "orders"."transfer_orders" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "work_centers_tenant_code_idx" ON "orders"."work_centers" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "work_centers_tenant_idx" ON "orders"."work_centers" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "work_centers_facility_idx" ON "orders"."work_centers" USING btree ("facility_id");--> statement-breakpoint
CREATE INDEX "wo_routing_tenant_idx" ON "orders"."work_order_routings" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "wo_routing_wo_idx" ON "orders"."work_order_routings" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "wo_routing_wc_idx" ON "orders"."work_order_routings" USING btree ("work_center_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wo_routing_step_idx" ON "orders"."work_order_routings" USING btree ("work_order_id","step_number");--> statement-breakpoint
CREATE UNIQUE INDEX "wo_tenant_number_idx" ON "orders"."work_orders" USING btree ("tenant_id","wo_number");--> statement-breakpoint
CREATE INDEX "wo_tenant_idx" ON "orders"."work_orders" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "wo_part_idx" ON "orders"."work_orders" USING btree ("part_id");--> statement-breakpoint
CREATE INDEX "wo_status_idx" ON "orders"."work_orders" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "wo_facility_idx" ON "orders"."work_orders" USING btree ("facility_id");--> statement-breakpoint
CREATE INDEX "wo_card_idx" ON "orders"."work_orders" USING btree ("kanban_card_id");--> statement-breakpoint
CREATE INDEX "notif_prefs_user_idx" ON "notifications"."notification_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notif_prefs_tenant_idx" ON "notifications"."notification_preferences" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "notifications_tenant_idx" ON "notifications"."notifications" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications"."notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "notifications"."notifications" USING btree ("user_id","is_read");--> statement-breakpoint
CREATE INDEX "notifications_time_idx" ON "notifications"."notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "usage_tenant_idx" ON "billing"."usage_records" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "usage_period_idx" ON "billing"."usage_records" USING btree ("tenant_id","period_start");--> statement-breakpoint
CREATE INDEX "audit_tenant_idx" ON "audit"."audit_log" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "audit_user_idx" ON "audit"."audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit"."audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "audit"."audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_time_idx" ON "audit"."audit_log" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "audit_tenant_time_idx" ON "audit"."audit_log" USING btree ("tenant_id","timestamp");