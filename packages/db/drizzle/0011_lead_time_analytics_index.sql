-- Migration: 0011_lead_time_analytics_index
-- Purpose: Add composite index on (tenant_id, received_at) to orders.lead_time_history
--          for performant date-range analytics queries.
-- Rollback: DROP INDEX IF EXISTS "orders"."lt_hist_tenant_received_idx";

CREATE INDEX IF NOT EXISTS "lt_hist_tenant_received_idx"
  ON "orders"."lead_time_history" USING btree ("tenant_id", "received_at");
