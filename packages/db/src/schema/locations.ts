import {
  pgSchema,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  numeric,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants } from './tenants.js';

export const locationsSchema = pgSchema('locations');

// ─── Facilities (Plants / Warehouses / Distribution Centers) ──────────
export const facilities = locationsSchema.table(
  'facilities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    code: varchar('code', { length: 50 }).notNull(), // e.g., "PLT-01", "WH-EAST"
    type: varchar('type', { length: 50 }).notNull().default('warehouse'), // warehouse, plant, distribution_center
    addressLine1: varchar('address_line_1', { length: 255 }),
    addressLine2: varchar('address_line_2', { length: 255 }),
    city: varchar('city', { length: 100 }),
    state: varchar('state', { length: 100 }),
    postalCode: varchar('postal_code', { length: 20 }),
    country: varchar('country', { length: 100 }).default('US'),
    latitude: numeric('latitude', { precision: 10, scale: 7 }),
    longitude: numeric('longitude', { precision: 10, scale: 7 }),
    timezone: varchar('timezone', { length: 50 }).default('America/Chicago'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('facilities_tenant_code_idx').on(table.tenantId, table.code),
    index('facilities_tenant_idx').on(table.tenantId),
  ]
);

// ─── Storage Locations (Bins, Shelves, Zones within a Facility) ───────
export const storageLocations = locationsSchema.table(
  'storage_locations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    facilityId: uuid('facility_id')
      .notNull()
      .references(() => facilities.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    code: varchar('code', { length: 100 }).notNull(), // e.g., "A-01-03" (Aisle-Rack-Bin)
    zone: varchar('zone', { length: 100 }), // logical grouping: "Raw Materials", "Finished Goods"
    description: text('description'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('storage_locations_tenant_facility_code_idx').on(
      table.tenantId,
      table.facilityId,
      table.code
    ),
    index('storage_locations_tenant_idx').on(table.tenantId),
    index('storage_locations_facility_idx').on(table.facilityId),
  ]
);

// ─── Relations ────────────────────────────────────────────────────────
export const facilitiesRelations = relations(facilities, ({ many }) => ({
  storageLocations: many(storageLocations),
}));

export const storageLocationsRelations = relations(storageLocations, ({ one }) => ({
  facility: one(facilities, {
    fields: [storageLocations.facilityId],
    references: [facilities.id],
  }),
}));
