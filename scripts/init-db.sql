-- Arda V2 Database Initialization
-- This runs once when the Docker PostgreSQL container is first created.

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create schemas for service isolation
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS catalog;
CREATE SCHEMA IF NOT EXISTS kanban;
CREATE SCHEMA IF NOT EXISTS orders;
CREATE SCHEMA IF NOT EXISTS locations;
CREATE SCHEMA IF NOT EXISTS notifications;
CREATE SCHEMA IF NOT EXISTS billing;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS audit;

-- Create the application role used by services (RLS enforced)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'arda_app') THEN
    CREATE ROLE arda_app LOGIN PASSWORD 'arda_app_password';
  END IF;
END
$$;

-- Grant schema usage to app role
GRANT USAGE ON SCHEMA auth, catalog, kanban, orders, locations, notifications, billing, analytics, audit TO arda_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA auth, catalog, kanban, orders, locations, notifications, billing, analytics, audit TO arda_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth, catalog, kanban, orders, locations, notifications, billing, analytics, audit
  GRANT ALL PRIVILEGES ON TABLES TO arda_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth, catalog, kanban, orders, locations, notifications, billing, analytics, audit
  GRANT ALL PRIVILEGES ON SEQUENCES TO arda_app;

-- RLS helper: set current tenant context per connection
-- Services call: SET LOCAL app.current_tenant_id = '<uuid>';
-- This is read by RLS policies to filter rows.
