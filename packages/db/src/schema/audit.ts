import {
  pgSchema,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';

export const auditSchema = pgSchema('audit');

// ─── Immutable Audit Log ─────────────────────────────────────────────
// Every significant action in the system gets a row here.
// This table is append-only. No updates, no deletes.
export const auditLog = auditSchema.table(
  'audit_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id'),                  // null for system actions
    action: varchar('action', { length: 100 }).notNull(), // e.g., 'card.triggered', 'po.created', 'user.login'
    entityType: varchar('entity_type', { length: 100 }).notNull(), // e.g., 'kanban_card', 'purchase_order'
    entityId: uuid('entity_id'),              // the ID of the affected entity
    previousState: jsonb('previous_state'),   // snapshot before change
    newState: jsonb('new_state'),             // snapshot after change
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_tenant_idx').on(table.tenantId),
    index('audit_user_idx').on(table.userId),
    index('audit_entity_idx').on(table.entityType, table.entityId),
    index('audit_action_idx').on(table.action),
    index('audit_time_idx').on(table.timestamp),
    index('audit_tenant_time_idx').on(table.tenantId, table.timestamp),
  ]
);
