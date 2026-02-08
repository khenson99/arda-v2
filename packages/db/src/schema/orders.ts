import {
  pgSchema,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  numeric,
  jsonb,
  index,
  uniqueIndex,
  pgEnum,
  serial,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { parts, suppliers } from './catalog.js';
import { facilities } from './locations.js';

export const ordersSchema = pgSchema('orders');

// ─── Enums ────────────────────────────────────────────────────────────
export const poStatusEnum = pgEnum('po_status', [
  'draft',
  'pending_approval',
  'approved',
  'sent',
  'acknowledged',
  'partially_received',
  'received',
  'closed',
  'cancelled',
]);

export const woStatusEnum = pgEnum('wo_status', [
  'draft',
  'scheduled',
  'in_progress',
  'on_hold',
  'completed',
  'cancelled',
]);

export const transferStatusEnum = pgEnum('transfer_status', [
  'draft',
  'requested',
  'approved',
  'picking',
  'shipped',
  'in_transit',
  'received',
  'closed',
  'cancelled',
]);

export const routingStepStatusEnum = pgEnum('routing_step_status', [
  'pending',
  'in_progress',
  'complete',
  'on_hold',
  'skipped',
]);

// ─── Purchase Orders ─────────────────────────────────────────────────
export const purchaseOrders = ordersSchema.table(
  'purchase_orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    poNumber: varchar('po_number', { length: 50 }).notNull(), // auto-generated or manual
    supplierId: uuid('supplier_id').notNull(),
    facilityId: uuid('facility_id').notNull(), // receiving facility
    status: poStatusEnum('status').notNull().default('draft'),
    orderDate: timestamp('order_date', { withTimezone: true }),
    expectedDeliveryDate: timestamp('expected_delivery_date', { withTimezone: true }),
    actualDeliveryDate: timestamp('actual_delivery_date', { withTimezone: true }),
    subtotal: numeric('subtotal', { precision: 12, scale: 2 }).default('0'),
    taxAmount: numeric('tax_amount', { precision: 12, scale: 2 }).default('0'),
    shippingAmount: numeric('shipping_amount', { precision: 12, scale: 2 }).default('0'),
    totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).default('0'),
    currency: varchar('currency', { length: 3 }).default('USD'),
    notes: text('notes'),
    internalNotes: text('internal_notes'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    sentToEmail: varchar('sent_to_email', { length: 255 }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelReason: text('cancel_reason'),
    createdByUserId: uuid('created_by_user_id'),
    approvedByUserId: uuid('approved_by_user_id'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('po_tenant_number_idx').on(table.tenantId, table.poNumber),
    index('po_tenant_idx').on(table.tenantId),
    index('po_supplier_idx').on(table.supplierId),
    index('po_status_idx').on(table.tenantId, table.status),
    index('po_facility_idx').on(table.facilityId),
  ]
);

// ─── Purchase Order Lines ────────────────────────────────────────────
export const purchaseOrderLines = ordersSchema.table(
  'purchase_order_lines',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    purchaseOrderId: uuid('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
    partId: uuid('part_id').notNull(),
    kanbanCardId: uuid('kanban_card_id'), // linked Kanban card that triggered this line
    lineNumber: integer('line_number').notNull(),
    quantityOrdered: integer('quantity_ordered').notNull(),
    quantityReceived: integer('quantity_received').notNull().default(0),
    unitCost: numeric('unit_cost', { precision: 12, scale: 4 }).notNull(),
    lineTotal: numeric('line_total', { precision: 12, scale: 2 }).notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('po_lines_tenant_idx').on(table.tenantId),
    index('po_lines_po_idx').on(table.purchaseOrderId),
    index('po_lines_part_idx').on(table.partId),
    index('po_lines_card_idx').on(table.kanbanCardId),
  ]
);

// ─── Work Centers ────────────────────────────────────────────────────
export const workCenters = ordersSchema.table(
  'work_centers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    facilityId: uuid('facility_id').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    code: varchar('code', { length: 50 }).notNull(),
    description: text('description'),
    capacityPerHour: numeric('capacity_per_hour', { precision: 10, scale: 2 }),
    costPerHour: numeric('cost_per_hour', { precision: 10, scale: 2 }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('work_centers_tenant_code_idx').on(table.tenantId, table.code),
    index('work_centers_tenant_idx').on(table.tenantId),
    index('work_centers_facility_idx').on(table.facilityId),
  ]
);

// ─── Work Orders ─────────────────────────────────────────────────────
export const workOrders = ordersSchema.table(
  'work_orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    woNumber: varchar('wo_number', { length: 50 }).notNull(),
    partId: uuid('part_id').notNull(), // the part being produced
    facilityId: uuid('facility_id').notNull(),
    status: woStatusEnum('status').notNull().default('draft'),
    quantityToProduce: integer('quantity_to_produce').notNull(),
    quantityProduced: integer('quantity_produced').notNull().default(0),
    quantityRejected: integer('quantity_rejected').notNull().default(0),
    scheduledStartDate: timestamp('scheduled_start_date', { withTimezone: true }),
    scheduledEndDate: timestamp('scheduled_end_date', { withTimezone: true }),
    actualStartDate: timestamp('actual_start_date', { withTimezone: true }),
    actualEndDate: timestamp('actual_end_date', { withTimezone: true }),
    priority: integer('priority').notNull().default(0), // higher = more urgent
    notes: text('notes'),
    kanbanCardId: uuid('kanban_card_id'),
    createdByUserId: uuid('created_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('wo_tenant_number_idx').on(table.tenantId, table.woNumber),
    index('wo_tenant_idx').on(table.tenantId),
    index('wo_part_idx').on(table.partId),
    index('wo_status_idx').on(table.tenantId, table.status),
    index('wo_facility_idx').on(table.facilityId),
    index('wo_card_idx').on(table.kanbanCardId),
  ]
);

// ─── Work Order Routing Steps ────────────────────────────────────────
export const workOrderRoutings = ordersSchema.table(
  'work_order_routings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    workOrderId: uuid('work_order_id')
      .notNull()
      .references(() => workOrders.id, { onDelete: 'cascade' }),
    workCenterId: uuid('work_center_id')
      .notNull()
      .references(() => workCenters.id),
    stepNumber: integer('step_number').notNull(),
    operationName: varchar('operation_name', { length: 255 }).notNull(),
    status: routingStepStatusEnum('status').notNull().default('pending'),
    estimatedMinutes: integer('estimated_minutes'),
    actualMinutes: integer('actual_minutes'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('wo_routing_tenant_idx').on(table.tenantId),
    index('wo_routing_wo_idx').on(table.workOrderId),
    index('wo_routing_wc_idx').on(table.workCenterId),
    uniqueIndex('wo_routing_step_idx').on(table.workOrderId, table.stepNumber),
  ]
);

// ─── Transfer Orders ─────────────────────────────────────────────────
export const transferOrders = ordersSchema.table(
  'transfer_orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    toNumber: varchar('to_number', { length: 50 }).notNull(),
    sourceFacilityId: uuid('source_facility_id').notNull(),
    destinationFacilityId: uuid('destination_facility_id').notNull(),
    status: transferStatusEnum('status').notNull().default('draft'),
    requestedDate: timestamp('requested_date', { withTimezone: true }),
    shippedDate: timestamp('shipped_date', { withTimezone: true }),
    receivedDate: timestamp('received_date', { withTimezone: true }),
    notes: text('notes'),
    kanbanCardId: uuid('kanban_card_id'),
    createdByUserId: uuid('created_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('to_tenant_number_idx').on(table.tenantId, table.toNumber),
    index('to_tenant_idx').on(table.tenantId),
    index('to_source_facility_idx').on(table.sourceFacilityId),
    index('to_dest_facility_idx').on(table.destinationFacilityId),
    index('to_status_idx').on(table.tenantId, table.status),
  ]
);

// ─── Transfer Order Lines ────────────────────────────────────────────
export const transferOrderLines = ordersSchema.table(
  'transfer_order_lines',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    transferOrderId: uuid('transfer_order_id')
      .notNull()
      .references(() => transferOrders.id, { onDelete: 'cascade' }),
    partId: uuid('part_id').notNull(),
    quantityRequested: integer('quantity_requested').notNull(),
    quantityShipped: integer('quantity_shipped').notNull().default(0),
    quantityReceived: integer('quantity_received').notNull().default(0),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('to_lines_tenant_idx').on(table.tenantId),
    index('to_lines_to_idx').on(table.transferOrderId),
    index('to_lines_part_idx').on(table.partId),
  ]
);

// ─── Relations ────────────────────────────────────────────────────────
export const purchaseOrdersRelations = relations(purchaseOrders, ({ many }) => ({
  lines: many(purchaseOrderLines),
}));

export const purchaseOrderLinesRelations = relations(purchaseOrderLines, ({ one }) => ({
  purchaseOrder: one(purchaseOrders, {
    fields: [purchaseOrderLines.purchaseOrderId],
    references: [purchaseOrders.id],
  }),
}));

export const workOrdersRelations = relations(workOrders, ({ many }) => ({
  routings: many(workOrderRoutings),
}));

export const workOrderRoutingsRelations = relations(workOrderRoutings, ({ one }) => ({
  workOrder: one(workOrders, {
    fields: [workOrderRoutings.workOrderId],
    references: [workOrders.id],
  }),
  workCenter: one(workCenters, {
    fields: [workOrderRoutings.workCenterId],
    references: [workCenters.id],
  }),
}));

export const transferOrdersRelations = relations(transferOrders, ({ many }) => ({
  lines: many(transferOrderLines),
}));

export const transferOrderLinesRelations = relations(transferOrderLines, ({ one }) => ({
  transferOrder: one(transferOrders, {
    fields: [transferOrderLines.transferOrderId],
    references: [transferOrders.id],
  }),
}));
