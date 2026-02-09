# RBAC Matrix -- Arda V2 MVP-02 Security Foundation

## Permission Naming Convention

All permissions follow the pattern: `service:resource:action`

- **service**: `kanban`, `orders`, `catalog`, `notifications`, `auth`
- **resource**: the entity (e.g., `loops`, `cards`, `purchase_orders`)
- **action**: `read`, `create`, `update`, `delete`, `manage` (full CRUD + special ops)

`manage` implies all actions on that resource.

## Roles

| Role | Description |
|---|---|
| `tenant_admin` | Full access to all resources within the tenant |
| `inventory_manager` | Manages kanban loops, cards, and inventory operations |
| `procurement_manager` | Manages purchase orders and supplier relationships |
| `receiving_manager` | Receives goods, updates PO/TO receipt status |
| `ecommerce_director` | Read access to catalog and orders, manages ecommerce settings |
| `salesperson` | Read access to catalog, limited order visibility |
| `executive` | Read-only dashboards, audit logs, and analytics |

## Permission Matrix

### Auth Service

| Permission | tenant_admin | inventory_manager | procurement_manager | receiving_manager | ecommerce_director | salesperson | executive |
|---|---|---|---|---|---|---|---|
| `auth:users:manage` | Y | - | - | - | - | - | - |
| `auth:profile:read` | Y | Y | Y | Y | Y | Y | Y |
| `auth:profile:update` | Y | Y | Y | Y | Y | Y | Y |

### Kanban Service

| Permission | tenant_admin | inventory_manager | procurement_manager | receiving_manager | ecommerce_director | salesperson | executive |
|---|---|---|---|---|---|---|---|
| `kanban:loops:read` | Y | Y | Y | Y | Y | - | Y |
| `kanban:loops:create` | Y | Y | - | - | - | - | - |
| `kanban:loops:update` | Y | Y | - | - | - | - | - |
| `kanban:loops:update_parameters` | Y | Y | - | - | - | - | - |
| `kanban:cards:read` | Y | Y | Y | Y | Y | - | Y |
| `kanban:cards:transition` | Y | Y | Y | Y | - | - | - |
| `kanban:cards:link_order` | Y | Y | Y | - | - | - | - |
| `kanban:scan:read` | Y | Y | Y | Y | Y | Y | Y |
| `kanban:scan:trigger` | Y | Y | Y | Y | - | - | - |
| `kanban:velocity:read` | Y | Y | Y | - | Y | - | Y |

### Orders Service

| Permission | tenant_admin | inventory_manager | procurement_manager | receiving_manager | ecommerce_director | salesperson | executive |
|---|---|---|---|---|---|---|---|
| `orders:purchase_orders:read` | Y | Y | Y | Y | Y | Y | Y |
| `orders:purchase_orders:create` | Y | - | Y | - | - | - | - |
| `orders:purchase_orders:update_status` | Y | - | Y | - | - | - | - |
| `orders:purchase_orders:add_lines` | Y | - | Y | - | - | - | - |
| `orders:purchase_orders:receive` | Y | - | - | Y | - | - | - |
| `orders:work_orders:read` | Y | Y | Y | Y | Y | - | Y |
| `orders:work_orders:create` | Y | Y | - | - | - | - | - |
| `orders:work_orders:update_status` | Y | Y | - | - | - | - | - |
| `orders:work_orders:update_routing` | Y | Y | - | - | - | - | - |
| `orders:work_orders:update_production` | Y | Y | - | - | - | - | - |
| `orders:transfer_orders:read` | Y | Y | Y | Y | Y | - | Y |
| `orders:transfer_orders:create` | Y | Y | - | - | - | - | - |
| `orders:transfer_orders:update_status` | Y | Y | - | - | - | - | - |
| `orders:transfer_orders:ship` | Y | Y | - | - | - | - | - |
| `orders:transfer_orders:receive` | Y | - | - | Y | - | - | - |
| `orders:order_queue:read` | Y | Y | Y | Y | Y | - | Y |
| `orders:order_queue:create_po` | Y | - | Y | - | - | - | - |
| `orders:order_queue:create_wo` | Y | Y | - | - | - | - | - |
| `orders:order_queue:create_to` | Y | Y | - | - | - | - | - |
| `orders:order_queue:risk_scan` | Y | Y | Y | - | - | - | Y |
| `orders:work_centers:read` | Y | Y | - | - | - | - | Y |
| `orders:work_centers:create` | Y | Y | - | - | - | - | - |
| `orders:work_centers:update` | Y | Y | - | - | - | - | - |
| `orders:work_centers:delete` | Y | - | - | - | - | - | - |
| `orders:audit:read` | Y | - | - | - | - | - | Y |

### Catalog Service

| Permission | tenant_admin | inventory_manager | procurement_manager | receiving_manager | ecommerce_director | salesperson | executive |
|---|---|---|---|---|---|---|---|
| `catalog:parts:read` | Y | Y | Y | Y | Y | Y | Y |
| `catalog:parts:create` | Y | Y | Y | - | - | - | - |
| `catalog:parts:update` | Y | Y | Y | - | - | - | - |
| `catalog:parts:delete` | Y | - | - | - | - | - | - |
| `catalog:suppliers:read` | Y | Y | Y | Y | Y | - | Y |
| `catalog:suppliers:create` | Y | - | Y | - | - | - | - |
| `catalog:suppliers:update` | Y | - | Y | - | - | - | - |
| `catalog:suppliers:link_parts` | Y | - | Y | - | - | - | - |
| `catalog:categories:read` | Y | Y | Y | Y | Y | Y | Y |
| `catalog:categories:create` | Y | Y | - | - | - | - | - |
| `catalog:categories:update` | Y | Y | - | - | - | - | - |
| `catalog:bom:read` | Y | Y | Y | Y | Y | - | Y |
| `catalog:bom:create` | Y | Y | - | - | - | - | - |
| `catalog:bom:delete` | Y | - | - | - | - | - | - |

### Notifications Service

| Permission | tenant_admin | inventory_manager | procurement_manager | receiving_manager | ecommerce_director | salesperson | executive |
|---|---|---|---|---|---|---|---|
| `notifications:notifications:read` | Y | Y | Y | Y | Y | Y | Y |
| `notifications:notifications:update` | Y | Y | Y | Y | Y | Y | Y |
| `notifications:notifications:delete` | Y | Y | Y | Y | Y | Y | Y |
| `notifications:preferences:read` | Y | Y | Y | Y | Y | Y | Y |
| `notifications:preferences:update` | Y | Y | Y | Y | Y | Y | Y |

## Design Decisions

1. **tenant_admin bypasses all permission checks** -- this is enforced at the middleware level, not by listing every permission.
2. **Notifications are self-scoped** -- users can only read/update their own notifications regardless of role.
3. **Audit logs are restricted** -- only `tenant_admin` and `executive` roles can view audit trails.
4. **QR scan read is public** -- the GET endpoint redirects to the app; the POST trigger endpoint requires auth.
5. **receiving_manager has narrow write scope** -- can only receive goods on POs and TOs, not create or update status.
6. **executive is read-only** -- dashboards, analytics, and audit only.
7. **salesperson is minimal** -- catalog read, PO read for tracking, and own notifications.
