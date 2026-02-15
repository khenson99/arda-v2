-- Migration: 0012_billing_foundation
-- Purpose: Add billing foundation tables for Stripe-backed subscriptions,
--          idempotent webhook processing, invoice caching, and plan entitlements.
--          Extends existing subscription_plans and usage_records tables.
-- Rollback:
--   DROP TABLE IF EXISTS "billing"."invoices";
--   DROP TABLE IF EXISTS "billing"."stripe_events";
--   DROP TABLE IF EXISTS "billing"."tenant_subscriptions";
--   DROP TYPE IF EXISTS "billing"."invoice_status";
--   DROP TYPE IF EXISTS "billing"."billing_interval";
--   DROP TYPE IF EXISTS "billing"."subscription_status";
--   ALTER TABLE "billing"."subscription_plans" DROP COLUMN IF EXISTS "contact_sales";
--   ALTER TABLE "billing"."usage_records" DROP COLUMN IF EXISTS "stripe_invoice_id";
--   ALTER TABLE "billing"."usage_records" DROP COLUMN IF EXISTS "reconciled_at";

-- ─── Enums ───────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "billing"."subscription_status" AS ENUM (
    'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "billing"."billing_interval" AS ENUM (
    'monthly', 'annual'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "billing"."invoice_status" AS ENUM (
    'draft', 'open', 'paid', 'void', 'uncollectible'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Extend subscription_plans ───────────────────────────────────────

ALTER TABLE "billing"."subscription_plans"
  ADD COLUMN IF NOT EXISTS "contact_sales" boolean NOT NULL DEFAULT false;

-- ─── Extend usage_records ────────────────────────────────────────────

ALTER TABLE "billing"."usage_records"
  ADD COLUMN IF NOT EXISTS "stripe_invoice_id" varchar(255);

ALTER TABLE "billing"."usage_records"
  ADD COLUMN IF NOT EXISTS "reconciled_at" timestamp with time zone;

-- ─── tenant_subscriptions ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "billing"."tenant_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL UNIQUE,
  "plan_id" varchar(50) NOT NULL REFERENCES "billing"."subscription_plans"("id"),
  "stripe_subscription_id" varchar(255),
  "stripe_customer_id" varchar(255),
  "status" "billing"."subscription_status" NOT NULL DEFAULT 'active',
  "billing_interval" "billing"."billing_interval" NOT NULL DEFAULT 'monthly',
  "current_period_start" timestamp with time zone,
  "current_period_end" timestamp with time zone,
  "cancel_at_period_end" boolean NOT NULL DEFAULT false,
  "canceled_at" timestamp with time zone,
  "trial_start" timestamp with time zone,
  "trial_end" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "tenant_sub_tenant_idx"
  ON "billing"."tenant_subscriptions" ("tenant_id");
CREATE INDEX IF NOT EXISTS "tenant_sub_stripe_sub_idx"
  ON "billing"."tenant_subscriptions" ("stripe_subscription_id");
CREATE INDEX IF NOT EXISTS "tenant_sub_status_idx"
  ON "billing"."tenant_subscriptions" ("status");

-- ─── stripe_events ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "billing"."stripe_events" (
  "id" varchar(255) PRIMARY KEY,
  "type" varchar(255) NOT NULL,
  "processed_at" timestamp with time zone NOT NULL DEFAULT now(),
  "payload" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "stripe_events_type_idx"
  ON "billing"."stripe_events" ("type");
CREATE INDEX IF NOT EXISTS "stripe_events_processed_idx"
  ON "billing"."stripe_events" ("processed_at");

-- ─── invoices ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "billing"."invoices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "stripe_invoice_id" varchar(255) NOT NULL,
  "stripe_subscription_id" varchar(255),
  "status" "billing"."invoice_status" NOT NULL,
  "amount_due_cents" integer NOT NULL,
  "amount_paid_cents" integer NOT NULL DEFAULT 0,
  "currency" varchar(3) NOT NULL DEFAULT 'usd',
  "invoice_pdf_url" text,
  "hosted_invoice_url" text,
  "period_start" timestamp with time zone,
  "period_end" timestamp with time zone,
  "paid_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "invoices_tenant_idx"
  ON "billing"."invoices" ("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_stripe_id_idx"
  ON "billing"."invoices" ("stripe_invoice_id");
CREATE INDEX IF NOT EXISTS "invoices_status_idx"
  ON "billing"."invoices" ("status");
