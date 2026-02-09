-- ═══════════════════════════════════════════════════════════════════════
-- Arda V2 — Row-Level Security (RLS) Policies
-- ═══════════════════════════════════════════════════════════════════════
--
-- Each tenant-scoped table gets RLS enabled with policies that restrict
-- access based on the session variable `app.tenant_id`.
--
-- Run after table creation / in a migration.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── Application Role ────────────────────────────────────────────────
-- Create the application role if it doesn't exist.
-- Services connect as this role (not superuser).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'arda_app') THEN
    CREATE ROLE arda_app LOGIN;
  END IF;
END
$$;

-- ─── Helper: Enable RLS + Create Policies ────────────────────────────
-- We use a DO block with EXECUTE to avoid duplication.

-- ═══════════════════════════════════════════════════════════════════════
-- auth schema
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.users FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_select ON auth.users;
CREATE POLICY tenant_isolation_select ON auth.users
  FOR SELECT USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_insert ON auth.users;
CREATE POLICY tenant_isolation_insert ON auth.users
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_update ON auth.users;
CREATE POLICY tenant_isolation_update ON auth.users
  FOR UPDATE USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_delete ON auth.users;
CREATE POLICY tenant_isolation_delete ON auth.users
  FOR DELETE USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- ═══════════════════════════════════════════════════════════════════════
-- locations schema
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE locations.facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations.facilities FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_select ON locations.facilities;
CREATE POLICY tenant_isolation_select ON locations.facilities
  FOR SELECT USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_insert ON locations.facilities;
CREATE POLICY tenant_isolation_insert ON locations.facilities
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_update ON locations.facilities;
CREATE POLICY tenant_isolation_update ON locations.facilities
  FOR UPDATE USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_delete ON locations.facilities;
CREATE POLICY tenant_isolation_delete ON locations.facilities
  FOR DELETE USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- storage_locations
ALTER TABLE locations.storage_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations.storage_locations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_select ON locations.storage_locations;
CREATE POLICY tenant_isolation_select ON locations.storage_locations
  FOR SELECT USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_insert ON locations.storage_locations;
CREATE POLICY tenant_isolation_insert ON locations.storage_locations
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_update ON locations.storage_locations;
CREATE POLICY tenant_isolation_update ON locations.storage_locations
  FOR UPDATE USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_delete ON locations.storage_locations;
CREATE POLICY tenant_isolation_delete ON locations.storage_locations
  FOR DELETE USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- ═══════════════════════════════════════════════════════════════════════
-- catalog schema
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE catalog.part_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog.part_categories FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_select ON catalog.part_categories;
CREATE POLICY tenant_isolation_select ON catalog.part_categories
  FOR SELECT USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_insert ON catalog.part_categories;
CREATE POLICY tenant_isolation_insert ON catalog.part_categories
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_update ON catalog.part_categories;
CREATE POLICY tenant_isolation_update ON catalog.part_categories
  FOR UPDATE USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_delete ON catalog.part_categories;
CREATE POLICY tenant_isolation_delete ON catalog.part_categories
  FOR DELETE USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- parts
ALTER TABLE catalog.parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog.parts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_select ON catalog.parts;
CREATE POLICY tenant_isolation_select ON catalog.parts
  FOR SELECT USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_insert ON catalog.parts;
CREATE POLICY tenant_isolation_insert ON catalog.parts
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_update ON catalog.parts;
CREATE POLICY tenant_isolation_update ON catalog.parts
  FOR UPDATE USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_delete ON catalog.parts;
CREATE POLICY tenant_isolation_delete ON catalog.parts
  FOR DELETE USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- suppliers
ALTER TABLE catalog.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog.suppliers FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_select ON catalog.suppliers;
CREATE POLICY tenant_isolation_select ON catalog.suppliers
  FOR SELECT USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_insert ON catalog.suppliers;
CREATE POLICY tenant_isolation_insert ON catalog.suppliers
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_update ON catalog.suppliers;
CREATE POLICY tenant_isolation_update ON catalog.suppliers
  FOR UPDATE USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_delete ON catalog.suppliers;
CREATE POLICY tenant_isolation_delete ON catalog.suppliers
  FOR DELETE USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- supplier_parts
ALTER TABLE catalog.supplier_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog.supplier_parts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_select ON catalog.supplier_parts;
CREATE POLICY tenant_isolation_select ON catalog.supplier_parts
  FOR SELECT USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_insert ON catalog.supplier_parts;
CREATE POLICY tenant_isolation_insert ON catalog.supplier_parts
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_update ON catalog.supplier_parts;
CREATE POLICY tenant_isolation_update ON catalog.supplier_parts
  FOR UPDATE USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_delete ON catalog.supplier_parts;
CREATE POLICY tenant_isolation_delete ON catalog.supplier_parts
  FOR DELETE USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- bom_items
ALTER TABLE catalog.bom_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog.bom_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_select ON catalog.bom_items;
CREATE POLICY tenant_isolation_select ON catalog.bom_items
  FOR SELECT USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_insert ON catalog.bom_items;
CREATE POLICY tenant_isolation_insert ON catalog.bom_items
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_update ON catalog.bom_items;
CREATE POLICY tenant_isolation_update ON catalog.bom_items
  FOR UPDATE USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_delete ON catalog.bom_items;
CREATE POLICY tenant_isolation_delete ON catalog.bom_items
  FOR DELETE USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- ═══════════════════════════════════════════════════════════════════════
-- kanban schema
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE kanban.kanban_loops ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban.kanban_loops FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_select ON kanban.kanban_loops;
CREATE POLICY tenant_isolation_select ON kanban.kanban_loops
  FOR SELECT USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_insert ON kanban.kanban_loops;
CREATE POLICY tenant_isolation_insert ON kanban.kanban_loops
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_update ON kanban.kanban_loops;
CREATE POLICY tenant_isolation_update ON kanban.kanban_loops
  FOR UPDATE USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_delete ON kanban.kanban_loops;
CREATE POLICY tenant_isolation_delete ON kanban.kanban_loops
  FOR DELETE USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- kanban_cards
ALTER TABLE kanban.kanban_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban.kanban_cards FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_select ON kanban.kanban_cards;
CREATE POLICY tenant_isolation_select ON kanban.kanban_cards
  FOR SELECT USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_insert ON kanban.kanban_cards;
CREATE POLICY tenant_isolation_insert ON kanban.kanban_cards
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_update ON kanban.kanban_cards;
CREATE POLICY tenant_isolation_update ON kanban.kanban_cards
  FOR UPDATE USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_delete ON kanban.kanban_cards;
CREATE POLICY tenant_isolation_delete ON kanban.kanban_cards
  FOR DELETE USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- card_stage_transitions
ALTER TABLE kanban.card_stage_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban.card_stage_transitions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_select ON kanban.card_stage_transitions;
CREATE POLICY tenant_isolation_select ON kanban.card_stage_transitions
  FOR SELECT USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_insert ON kanban.card_stage_transitions;
CREATE POLICY tenant_isolation_insert ON kanban.card_stage_transitions
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_update ON kanban.card_stage_transitions;
CREATE POLICY tenant_isolation_update ON kanban.card_stage_transitions
  FOR UPDATE USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_delete ON kanban.card_stage_transitions;
CREATE POLICY tenant_isolation_delete ON kanban.card_stage_transitions
  FOR DELETE USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- kanban_parameter_history
ALTER TABLE kanban.kanban_parameter_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban.kanban_parameter_history FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_select ON kanban.kanban_parameter_history;
CREATE POLICY tenant_isolation_select ON kanban.kanban_parameter_history
  FOR SELECT USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_insert ON kanban.kanban_parameter_history;
CREATE POLICY tenant_isolation_insert ON kanban.kanban_parameter_history
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_update ON kanban.kanban_parameter_history;
CREATE POLICY tenant_isolation_update ON kanban.kanban_parameter_history
  FOR UPDATE USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_delete ON kanban.kanban_parameter_history;
CREATE POLICY tenant_isolation_delete ON kanban.kanban_parameter_history
  FOR DELETE USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- relowisa_recommendations
ALTER TABLE kanban.relowisa_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban.relowisa_recommendations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_select ON kanban.relowisa_recommendations;
CREATE POLICY tenant_isolation_select ON kanban.relowisa_recommendations
  FOR SELECT USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_insert ON kanban.relowisa_recommendations;
CREATE POLICY tenant_isolation_insert ON kanban.relowisa_recommendations
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_update ON kanban.relowisa_recommendations;
CREATE POLICY tenant_isolation_update ON kanban.relowisa_recommendations
  FOR UPDATE USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_delete ON kanban.relowisa_recommendations;
CREATE POLICY tenant_isolation_delete ON kanban.relowisa_recommendations
  FOR DELETE USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- ═══════════════════════════════════════════════════════════════════════
-- orders schema
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE orders.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders.purchase_orders FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_select ON orders.purchase_orders;
CREATE POLICY tenant_isolation_select ON orders.purchase_orders
  FOR SELECT USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_insert ON orders.purchase_orders;
CREATE POLICY tenant_isolation_insert ON orders.purchase_orders
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_update ON orders.purchase_orders;
CREATE POLICY tenant_isolation_update ON orders.purchase_orders
  FOR UPDATE USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_delete ON orders.purchase_orders;
CREATE POLICY tenant_isolation_delete ON orders.purchase_orders
  FOR DELETE USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- purchase_order_lines
ALTER TABLE orders.purchase_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders.purchase_order_lines FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_select ON orders.purchase_order_lines;
CREATE POLICY tenant_isolation_select ON orders.purchase_order_lines
  FOR SELECT USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_insert ON orders.purchase_order_lines;
CREATE POLICY tenant_isolation_insert ON orders.purchase_order_lines
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_update ON orders.purchase_order_lines;
CREATE POLICY tenant_isolation_update ON orders.purchase_order_lines
  FOR UPDATE USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_delete ON orders.purchase_order_lines;
CREATE POLICY tenant_isolation_delete ON orders.purchase_order_lines
  FOR DELETE USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- work_centers
ALTER TABLE orders.work_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders.work_centers FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_select ON orders.work_centers;
CREATE POLICY tenant_isolation_select ON orders.work_centers
  FOR SELECT USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_insert ON orders.work_centers;
CREATE POLICY tenant_isolation_insert ON orders.work_centers
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_update ON orders.work_centers;
CREATE POLICY tenant_isolation_update ON orders.work_centers
  FOR UPDATE USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_delete ON orders.work_centers;
CREATE POLICY tenant_isolation_delete ON orders.work_centers
  FOR DELETE USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- work_orders
ALTER TABLE orders.work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders.work_orders FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_select ON orders.work_orders;
CREATE POLICY tenant_isolation_select ON orders.work_orders
  FOR SELECT USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_insert ON orders.work_orders;
CREATE POLICY tenant_isolation_insert ON orders.work_orders
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_update ON orders.work_orders;
CREATE POLICY tenant_isolation_update ON orders.work_orders
  FOR UPDATE USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_delete ON orders.work_orders;
CREATE POLICY tenant_isolation_delete ON orders.work_orders
  FOR DELETE USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- work_order_routings
ALTER TABLE orders.work_order_routings ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders.work_order_routings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_select ON orders.work_order_routings;
CREATE POLICY tenant_isolation_select ON orders.work_order_routings
  FOR SELECT USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_insert ON orders.work_order_routings;
CREATE POLICY tenant_isolation_insert ON orders.work_order_routings
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_update ON orders.work_order_routings;
CREATE POLICY tenant_isolation_update ON orders.work_order_routings
  FOR UPDATE USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_delete ON orders.work_order_routings;
CREATE POLICY tenant_isolation_delete ON orders.work_order_routings
  FOR DELETE USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- transfer_orders
ALTER TABLE orders.transfer_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders.transfer_orders FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_select ON orders.transfer_orders;
CREATE POLICY tenant_isolation_select ON orders.transfer_orders
  FOR SELECT USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_insert ON orders.transfer_orders;
CREATE POLICY tenant_isolation_insert ON orders.transfer_orders
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_update ON orders.transfer_orders;
CREATE POLICY tenant_isolation_update ON orders.transfer_orders
  FOR UPDATE USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_delete ON orders.transfer_orders;
CREATE POLICY tenant_isolation_delete ON orders.transfer_orders
  FOR DELETE USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- transfer_order_lines
ALTER TABLE orders.transfer_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders.transfer_order_lines FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_select ON orders.transfer_order_lines;
CREATE POLICY tenant_isolation_select ON orders.transfer_order_lines
  FOR SELECT USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_insert ON orders.transfer_order_lines;
CREATE POLICY tenant_isolation_insert ON orders.transfer_order_lines
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_update ON orders.transfer_order_lines;
CREATE POLICY tenant_isolation_update ON orders.transfer_order_lines
  FOR UPDATE USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_delete ON orders.transfer_order_lines;
CREATE POLICY tenant_isolation_delete ON orders.transfer_order_lines
  FOR DELETE USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- ═══════════════════════════════════════════════════════════════════════
-- notifications schema
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE notifications.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications.notifications FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_select ON notifications.notifications;
CREATE POLICY tenant_isolation_select ON notifications.notifications
  FOR SELECT USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_insert ON notifications.notifications;
CREATE POLICY tenant_isolation_insert ON notifications.notifications
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_update ON notifications.notifications;
CREATE POLICY tenant_isolation_update ON notifications.notifications
  FOR UPDATE USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_delete ON notifications.notifications;
CREATE POLICY tenant_isolation_delete ON notifications.notifications
  FOR DELETE USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- notification_preferences
ALTER TABLE notifications.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications.notification_preferences FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_select ON notifications.notification_preferences;
CREATE POLICY tenant_isolation_select ON notifications.notification_preferences
  FOR SELECT USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_insert ON notifications.notification_preferences;
CREATE POLICY tenant_isolation_insert ON notifications.notification_preferences
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_update ON notifications.notification_preferences;
CREATE POLICY tenant_isolation_update ON notifications.notification_preferences
  FOR UPDATE USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_delete ON notifications.notification_preferences;
CREATE POLICY tenant_isolation_delete ON notifications.notification_preferences
  FOR DELETE USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- ═══════════════════════════════════════════════════════════════════════
-- audit schema
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE audit.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.audit_log FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_select ON audit.audit_log;
CREATE POLICY tenant_isolation_select ON audit.audit_log
  FOR SELECT USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_insert ON audit.audit_log;
CREATE POLICY tenant_isolation_insert ON audit.audit_log
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_update ON audit.audit_log;
CREATE POLICY tenant_isolation_update ON audit.audit_log
  FOR UPDATE USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_delete ON audit.audit_log;
CREATE POLICY tenant_isolation_delete ON audit.audit_log
  FOR DELETE USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- ═══════════════════════════════════════════════════════════════════════
-- billing schema
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE billing.usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.usage_records FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_select ON billing.usage_records;
CREATE POLICY tenant_isolation_select ON billing.usage_records
  FOR SELECT USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_insert ON billing.usage_records;
CREATE POLICY tenant_isolation_insert ON billing.usage_records
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_update ON billing.usage_records;
CREATE POLICY tenant_isolation_update ON billing.usage_records
  FOR UPDATE USING (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_delete ON billing.usage_records;
CREATE POLICY tenant_isolation_delete ON billing.usage_records
  FOR DELETE USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- ═══════════════════════════════════════════════════════════════════════
-- Grant permissions to application role
-- ═══════════════════════════════════════════════════════════════════════

GRANT USAGE ON SCHEMA auth, locations, catalog, kanban, orders, notifications, audit, billing TO arda_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth TO arda_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA locations TO arda_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA catalog TO arda_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA kanban TO arda_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA orders TO arda_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA notifications TO arda_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA audit TO arda_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA billing TO arda_app;
