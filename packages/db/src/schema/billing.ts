import {
  pgSchema,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const billingSchema = pgSchema('billing');

// ─── Enums ───────────────────────────────────────────────────────────
export const subscriptionStatusEnum = billingSchema.enum('subscription_status', [
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'paused',
]);

export const billingIntervalEnum = billingSchema.enum('billing_interval', [
  'monthly',
  'annual',
]);

export const invoiceStatusEnum = billingSchema.enum('invoice_status', [
  'draft',
  'open',
  'paid',
  'void',
  'uncollectible',
]);

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
    contactSales: boolean('contact_sales').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  }
);

// ─── Tenant Subscriptions ────────────────────────────────────────────
// Tracks the active Stripe subscription for each tenant.
export const tenantSubscriptions = billingSchema.table(
  'tenant_subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull().unique(),
    planId: varchar('plan_id', { length: 50 }).notNull().references(() => subscriptionPlans.id),
    stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }),
    stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
    status: subscriptionStatusEnum('status').notNull().default('active'),
    billingInterval: billingIntervalEnum('billing_interval').notNull().default('monthly'),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    trialStart: timestamp('trial_start', { withTimezone: true }),
    trialEnd: timestamp('trial_end', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('tenant_sub_tenant_idx').on(table.tenantId),
    index('tenant_sub_stripe_sub_idx').on(table.stripeSubscriptionId),
    index('tenant_sub_status_idx').on(table.status),
  ]
);

// ─── Stripe Events (idempotent webhook processing) ───────────────────
// Stores processed Stripe event IDs to prevent duplicate webhook handling.
export const stripeEvents = billingSchema.table(
  'stripe_events',
  {
    id: varchar('id', { length: 255 }).primaryKey(), // Stripe event ID (evt_...)
    type: varchar('type', { length: 255 }).notNull(), // e.g. 'invoice.paid', 'customer.subscription.updated'
    processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
    payload: jsonb('payload'), // raw Stripe event payload for debugging
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('stripe_events_type_idx').on(table.type),
    index('stripe_events_processed_idx').on(table.processedAt),
  ]
);

// ─── Invoices (cached from Stripe) ──────────────────────────────────
export const invoices = billingSchema.table(
  'invoices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    stripeInvoiceId: varchar('stripe_invoice_id', { length: 255 }).notNull(),
    stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }),
    status: invoiceStatusEnum('status').notNull(),
    amountDueCents: integer('amount_due_cents').notNull(),
    amountPaidCents: integer('amount_paid_cents').notNull().default(0),
    currency: varchar('currency', { length: 3 }).notNull().default('usd'),
    invoicePdfUrl: text('invoice_pdf_url'),
    hostedInvoiceUrl: text('hosted_invoice_url'),
    periodStart: timestamp('period_start', { withTimezone: true }),
    periodEnd: timestamp('period_end', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('invoices_tenant_idx').on(table.tenantId),
    uniqueIndex('invoices_stripe_id_idx').on(table.stripeInvoiceId),
    index('invoices_status_idx').on(table.status),
  ]
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
    stripeInvoiceId: varchar('stripe_invoice_id', { length: 255 }),
    reconciledAt: timestamp('reconciled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('usage_tenant_idx').on(table.tenantId),
    index('usage_period_idx').on(table.tenantId, table.periodStart),
  ]
);

// ─── Relations ───────────────────────────────────────────────────────
export const subscriptionPlansRelations = relations(subscriptionPlans, ({ many }) => ({
  tenantSubscriptions: many(tenantSubscriptions),
}));

export const tenantSubscriptionsRelations = relations(tenantSubscriptions, ({ one }) => ({
  plan: one(subscriptionPlans, {
    fields: [tenantSubscriptions.planId],
    references: [subscriptionPlans.id],
  }),
}));

export const invoicesRelations = relations(invoices, ({ one }) => ({
  subscription: one(tenantSubscriptions, {
    fields: [invoices.stripeSubscriptionId],
    references: [tenantSubscriptions.stripeSubscriptionId],
  }),
}));

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
