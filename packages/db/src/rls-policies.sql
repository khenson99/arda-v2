-- ═══════════════════════════════════════════════════════════════════════
-- Arda V2 — Row-Level Security Policies
-- ═══════════════════════════════════════════════════════════════════════
-- Every table with a tenant_id column gets an RLS policy.
-- The application sets the tenant context per-request via:
--   SET LOCAL app.current_tenant_id = '<uuid>';
-- ═══════════════════════════════════════════════════════════════════════

-- Helper function to get current tenant ID from session config
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

-- ─── Auth Schema ─────────────────────────────────────────────────────

ALTER TABLE auth.tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON auth.tenants
  USING (id = current_tenant_id());

ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON auth.users
  USING (tenant_id = current_tenant_id());

ALTER TABLE auth.oauth_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON auth.oauth_accounts
  USING (user_id IN (SELECT id FROM auth.users WHERE tenant_id = current_tenant_id()));

ALTER TABLE auth.refresh_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON auth.refresh_tokens
  USING (user_id IN (SELECT id FROM auth.users WHERE tenant_id = current_tenant_id()));

-- ─── Locations Schema ────────────────────────────────────────────────

ALTER TABLE locations.facilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON locations.facilities
  USING (tenant_id = current_tenant_id());

ALTER TABLE locations.storage_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON locations.storage_locations
  USING (tenant_id = current_tenant_id());

-- ─── Catalog Schema ─────────────────────────────────────────────────

ALTER TABLE catalog.part_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON catalog.part_categories
  USING (tenant_id = current_tenant_id());

ALTER TABLE catalog.parts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON catalog.parts
  USING (tenant_id = current_tenant_id());

ALTER TABLE catalog.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON catalog.suppliers
  USING (tenant_id = current_tenant_id());

ALTER TABLE catalog.supplier_parts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON catalog.supplier_parts
  USING (tenant_id = current_tenant_id());

ALTER TABLE catalog.bom_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON catalog.bom_items
  USING (tenant_id = current_tenant_id());

-- ─── Kanban Schema ──────────────────────────────────────────────────

ALTER TABLE kanban.kanban_loops ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON kanban.kanban_loops
  USING (tenant_id = current_tenant_id());

ALTER TABLE kanban.kanban_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON kanban.kanban_cards
  USING (tenant_id = current_tenant_id());

ALTER TABLE kanban.card_stage_transitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON kanban.card_stage_transitions
  USING (tenant_id = current_tenant_id());

ALTER TABLE kanban.kanban_parameter_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON kanban.kanban_parameter_history
  USING (tenant_id = current_tenant_id());

ALTER TABLE kanban.relowisa_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON kanban.relowisa_recommendations
  USING (tenant_id = current_tenant_id());

-- ─── Orders Schema ──────────────────────────────────────────────────

ALTER TABLE orders.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON orders.purchase_orders
  USING (tenant_id = current_tenant_id());

ALTER TABLE orders.purchase_order_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON orders.purchase_order_lines
  USING (tenant_id = current_tenant_id());

ALTER TABLE orders.work_centers ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON orders.work_centers
  USING (tenant_id = current_tenant_id());

ALTER TABLE orders.work_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON orders.work_orders
  USING (tenant_id = current_tenant_id());

ALTER TABLE orders.work_order_routings ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON orders.work_order_routings
  USING (tenant_id = current_tenant_id());

ALTER TABLE orders.transfer_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON orders.transfer_orders
  USING (tenant_id = current_tenant_id());

ALTER TABLE orders.transfer_order_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON orders.transfer_order_lines
  USING (tenant_id = current_tenant_id());

-- ─── Notifications Schema ───────────────────────────────────────────

ALTER TABLE notifications.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notifications.notifications
  USING (tenant_id = current_tenant_id());

ALTER TABLE notifications.notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notifications.notification_preferences
  USING (tenant_id = current_tenant_id());

-- ─── Billing Schema ─────────────────────────────────────────────────

-- subscription_plans is NOT tenant-scoped (shared across all tenants)
-- No RLS needed.

ALTER TABLE billing.usage_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON billing.usage_records
  USING (tenant_id = current_tenant_id());

-- ─── Audit Schema ───────────────────────────────────────────────────

ALTER TABLE audit.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit.audit_log
  USING (tenant_id = current_tenant_id());

-- ═══════════════════════════════════════════════════════════════════════
-- Grant the arda_app role permission to use RLS context
-- ═══════════════════════════════════════════════════════════════════════
-- The arda_app role (used by services) does NOT bypass RLS.
-- The arda superuser (used for migrations) DOES bypass RLS.
ALTER ROLE arda_app SET row_security TO on;
