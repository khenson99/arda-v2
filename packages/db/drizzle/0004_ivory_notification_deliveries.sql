-- Add new notification types to the enum
ALTER TYPE "notifications"."notification_type" ADD VALUE 'receiving_completed';
ALTER TYPE "notifications"."notification_type" ADD VALUE 'production_hold';
ALTER TYPE "notifications"."notification_type" ADD VALUE 'automation_escalated';
--> statement-breakpoint

-- Create delivery_status enum
DO $$ BEGIN
  CREATE TYPE "notifications"."delivery_status" AS ENUM('pending', 'sent', 'delivered', 'failed', 'bounced');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Create tenant_default_preferences table
CREATE TABLE "notifications"."tenant_default_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"notification_type" "notifications"."notification_type" NOT NULL,
	"channel" "notifications"."notification_channel" NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Create notification_deliveries table
CREATE TABLE "notifications"."notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"notification_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" "notifications"."notification_channel" NOT NULL,
	"status" "notifications"."delivery_status" DEFAULT 'pending' NOT NULL,
	"provider" varchar(50),
	"provider_message_id" varchar(255),
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_error" text,
	"delivered_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Create indexes for tenant_default_preferences
CREATE INDEX "tenant_default_prefs_tenant_idx" ON "notifications"."tenant_default_preferences" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "tenant_default_prefs_type_idx" ON "notifications"."tenant_default_preferences" USING btree ("notification_type");
--> statement-breakpoint

-- Create indexes for notification_deliveries
CREATE INDEX "notif_deliveries_tenant_idx" ON "notifications"."notification_deliveries" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "notif_deliveries_user_status_idx" ON "notifications"."notification_deliveries" USING btree ("user_id","status");
--> statement-breakpoint
CREATE INDEX "notif_deliveries_notification_idx" ON "notifications"."notification_deliveries" USING btree ("notification_id");
--> statement-breakpoint
CREATE INDEX "notif_deliveries_status_created_idx" ON "notifications"."notification_deliveries" USING btree ("status","created_at");
