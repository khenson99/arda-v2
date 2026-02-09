# PostgreSQL Row-Level Security (RLS) Policies -- Arda V2

## Overview

All tenant-scoped tables enforce Row-Level Security (RLS) via the session
variable `app.tenant_id`. The application middleware sets this variable at
the start of each request using:

```sql
SELECT set_config('app.tenant_id', '<uuid>', true);
```

The `true` parameter makes the setting transaction-local, so it automatically
resets between requests and cannot leak between tenants.

## Architecture

1. **Application role**: `arda_app` -- used by the Express services
2. **Session variable**: `app.tenant_id` -- set per-request by tenant-context middleware
3. **Policy pattern**: All tenant-scoped tables get `USING (tenant_id = current_setting('app.tenant_id')::uuid)`

## Schemas & Tables Requiring RLS

### auth schema
| Table | Has tenant_id | RLS |
|---|---|---|
| `auth.tenants` | No (is the tenant) | No RLS -- app-level filtering |
| `auth.users` | Yes | Yes |
| `auth.oauth_accounts` | No (keyed by user FK) | No -- filtered via user join |
| `auth.refresh_tokens` | No (keyed by user FK) | No -- filtered via user join |

### locations schema
| Table | Has tenant_id | RLS |
|---|---|---|
| `locations.facilities` | Yes | Yes |
| `locations.storage_locations` | Yes | Yes |

### catalog schema
| Table | Has tenant_id | RLS |
|---|---|---|
| `catalog.part_categories` | Yes | Yes |
| `catalog.parts` | Yes | Yes |
| `catalog.suppliers` | Yes | Yes |
| `catalog.supplier_parts` | Yes | Yes |
| `catalog.bom_items` | Yes | Yes |

### kanban schema
| Table | Has tenant_id | RLS |
|---|---|---|
| `kanban.kanban_loops` | Yes | Yes |
| `kanban.kanban_cards` | Yes | Yes |
| `kanban.card_stage_transitions` | Yes | Yes |
| `kanban.kanban_parameter_history` | Yes | Yes |
| `kanban.relowisa_recommendations` | Yes | Yes |

### orders schema
| Table | Has tenant_id | RLS |
|---|---|---|
| `orders.purchase_orders` | Yes | Yes |
| `orders.purchase_order_lines` | Yes | Yes |
| `orders.work_centers` | Yes | Yes |
| `orders.work_orders` | Yes | Yes |
| `orders.work_order_routings` | Yes | Yes |
| `orders.transfer_orders` | Yes | Yes |
| `orders.transfer_order_lines` | Yes | Yes |

### notifications schema
| Table | Has tenant_id | RLS |
|---|---|---|
| `notifications.notifications` | Yes | Yes |
| `notifications.notification_preferences` | Yes | Yes |

### audit schema
| Table | Has tenant_id | RLS |
|---|---|---|
| `audit.audit_log` | Yes | Yes |

### billing schema
| Table | Has tenant_id | RLS |
|---|---|---|
| `billing.subscription_plans` | No (global) | No |
| `billing.usage_records` | Yes | Yes |

## Policy Types

Each RLS-enabled table gets three policies:

1. **SELECT**: `USING (tenant_id = current_setting('app.tenant_id')::uuid)`
2. **INSERT**: `WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid)`
3. **UPDATE/DELETE**: `USING (tenant_id = current_setting('app.tenant_id')::uuid)`

## Security Notes

- **Superuser bypass**: PostgreSQL superusers and table owners bypass RLS by default. The `arda_app` role is NOT a superuser.
- **Missing context**: If `app.tenant_id` is not set, `current_setting()` returns an empty string, and the `::uuid` cast will fail, preventing any data access. This is a fail-safe.
- **Migrations**: RLS policies are applied after table creation and must be included in the migration pipeline.
