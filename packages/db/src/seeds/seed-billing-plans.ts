/**
 * Seed runner for billing plans.
 * Idempotent: uses ON CONFLICT DO UPDATE (upsert) on subscription_plans.id.
 */

import { sql } from 'drizzle-orm';
import type { DbOrTransaction } from '../client.js';
import { subscriptionPlans } from '../schema/billing.js';
import { PLAN_SEEDS } from './billing-plans.js';

/**
 * Upsert all billing plan seeds into billing.subscription_plans.
 * Safe to call repeatedly — updates existing rows, inserts missing ones.
 */
export async function seedBillingPlans(db: DbOrTransaction): Promise<void> {
  for (const plan of PLAN_SEEDS) {
    await db
      .insert(subscriptionPlans)
      .values({
        id: plan.id,
        name: plan.name,
        description: plan.description,
        monthlyPriceCents: plan.monthlyPriceCents,
        annualPriceCents: plan.annualPriceCents,
        cardLimit: plan.cardLimit,
        seatLimit: plan.seatLimit,
        cardOveragePriceCents: plan.cardOveragePriceCents,
        seatOveragePriceCents: plan.seatOveragePriceCents,
        features: plan.features,
        contactSales: plan.contactSales,
        sortOrder: plan.sortOrder,
      })
      .onConflictDoUpdate({
        target: subscriptionPlans.id,
        set: {
          name: sql`EXCLUDED."name"`,
          description: sql`EXCLUDED."description"`,
          monthlyPriceCents: sql`EXCLUDED."monthly_price_cents"`,
          annualPriceCents: sql`EXCLUDED."annual_price_cents"`,
          cardLimit: sql`EXCLUDED."card_limit"`,
          seatLimit: sql`EXCLUDED."seat_limit"`,
          cardOveragePriceCents: sql`EXCLUDED."card_overage_price_cents"`,
          seatOveragePriceCents: sql`EXCLUDED."seat_overage_price_cents"`,
          features: sql`EXCLUDED."features"`,
          contactSales: sql`EXCLUDED."contact_sales"`,
          sortOrder: sql`EXCLUDED."sort_order"`,
          updatedAt: sql`now()`,
        },
      });
  }
}
