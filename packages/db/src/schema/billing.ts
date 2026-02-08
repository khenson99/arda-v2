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
  pgEnum,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const billingSchema = pgSchema('billing');

// ─── Subscription Plans ──────────────────────────────────────────────
export const subscriptionPlans = billingSchema.table(
  'subscription_plans',
  {
    id: varchar('id', { length: 50 }).primaryKey(), // 'free', 'starter', 'pro', 'enterprise'
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    monthlyPriceCents: integer('monthly_price_cents').notNull(),
    annualPriceCents: integer('annual_price_cents'),
    cardLimit: integer('card_limit').notNull(),
    seatLimit: integer('seat_limit').notNull(),
    cardOveragePriceCents: integer('card_overage_price_cents'), // per additional card/month
    seatOveragePriceCents: integer('seat_overage_price_cents'), // per additional seat/month
    features: jsonb('features').$type<PlanFeatures>().default({}),
    stripePriceIdMonthly: varchar('stripe_price_id_monthly', { length: 255 }),
    stripePriceIdAnnual: varchar('stripe_price_id_annual', { length: 255 }),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  }
);

// ─── Usage Records (for metered billing) ─────────────────────────────
export const usageRecords = billingSchema.table(
  'usage_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    cardCount: integer('card_count').notNull().default(0),
    seatCount: integer('seat_count').notNull().default(0),
    cardOverage: integer('card_overage').notNull().default(0),
    seatOverage: integer('seat_overage').notNull().default(0),
    reportedToStripe: boolean('reported_to_stripe').notNull().default(false),
    stripeUsageRecordId: varchar('stripe_usage_record_id', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('usage_tenant_idx').on(table.tenantId),
    index('usage_period_idx').on(table.tenantId, table.periodStart),
  ]
);

// ─── Types ────────────────────────────────────────────────────────────
export interface PlanFeatures {
  multiLocation?: boolean;
  productionKanban?: boolean;
  transferKanban?: boolean;
  reloWisa?: boolean;
  ecommerceApi?: boolean;
  scheduledReports?: boolean;
  sso?: boolean;
  webhooks?: boolean;
  customBranding?: boolean;
  prioritySupport?: boolean;
}
