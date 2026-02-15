import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as schema from '../schema/index.js';
import type { PlanFeatures } from '../schema/billing.js';
import { PLAN_SEEDS } from '../seeds/billing-plans.js';

// ─── Read migration SQL ────────────────────────────────────────────────
const MIGRATION_SQL = readFileSync(
  resolve(__dirname, '../../drizzle/0012_billing_foundation.sql'),
  'utf-8'
);

// ─── Migration structure tests ─────────────────────────────────────────
describe('0012_billing_foundation migration', () => {
  describe('idempotency guards', () => {
    it('uses IF NOT EXISTS for new columns on subscription_plans', () => {
      expect(MIGRATION_SQL).toContain(
        'ADD COLUMN IF NOT EXISTS "contact_sales"'
      );
    });

    it('uses IF NOT EXISTS for new columns on usage_records', () => {
      expect(MIGRATION_SQL).toContain(
        'ADD COLUMN IF NOT EXISTS "stripe_invoice_id"'
      );
      expect(MIGRATION_SQL).toContain(
        'ADD COLUMN IF NOT EXISTS "reconciled_at"'
      );
    });

    it('uses IF NOT EXISTS for new table creation', () => {
      expect(MIGRATION_SQL).toContain(
        'CREATE TABLE IF NOT EXISTS "billing"."tenant_subscriptions"'
      );
      expect(MIGRATION_SQL).toContain(
        'CREATE TABLE IF NOT EXISTS "billing"."stripe_events"'
      );
      expect(MIGRATION_SQL).toContain(
        'CREATE TABLE IF NOT EXISTS "billing"."invoices"'
      );
    });

    it('uses IF NOT EXISTS for index creation', () => {
      expect(MIGRATION_SQL).toContain('CREATE INDEX IF NOT EXISTS "tenant_sub_tenant_idx"');
      expect(MIGRATION_SQL).toContain('CREATE INDEX IF NOT EXISTS "tenant_sub_stripe_sub_idx"');
      expect(MIGRATION_SQL).toContain('CREATE INDEX IF NOT EXISTS "tenant_sub_status_idx"');
      expect(MIGRATION_SQL).toContain('CREATE INDEX IF NOT EXISTS "stripe_events_type_idx"');
      expect(MIGRATION_SQL).toContain('CREATE INDEX IF NOT EXISTS "stripe_events_processed_idx"');
      expect(MIGRATION_SQL).toContain('CREATE INDEX IF NOT EXISTS "invoices_tenant_idx"');
      expect(MIGRATION_SQL).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "invoices_stripe_id_idx"');
      expect(MIGRATION_SQL).toContain('CREATE INDEX IF NOT EXISTS "invoices_status_idx"');
    });

    it('uses DO $$ exception handler for enum creation', () => {
      const enumBlocks = MIGRATION_SQL.match(/DO \$\$ BEGIN[\s\S]*?END \$\$/g) ?? [];
      expect(enumBlocks.length).toBe(3); // subscription_status, billing_interval, invoice_status
      for (const block of enumBlocks) {
        expect(block).toContain('EXCEPTION WHEN duplicate_object THEN NULL');
      }
    });
  });

  describe('enum definitions', () => {
    it('defines subscription_status enum', () => {
      expect(MIGRATION_SQL).toContain('"billing"."subscription_status"');
      expect(MIGRATION_SQL).toContain("'trialing'");
      expect(MIGRATION_SQL).toContain("'active'");
      expect(MIGRATION_SQL).toContain("'past_due'");
      expect(MIGRATION_SQL).toContain("'canceled'");
      expect(MIGRATION_SQL).toContain("'unpaid'");
      expect(MIGRATION_SQL).toContain("'paused'");
    });

    it('defines billing_interval enum', () => {
      expect(MIGRATION_SQL).toContain('"billing"."billing_interval"');
      expect(MIGRATION_SQL).toContain("'monthly'");
      expect(MIGRATION_SQL).toContain("'annual'");
    });

    it('defines invoice_status enum', () => {
      expect(MIGRATION_SQL).toContain('"billing"."invoice_status"');
      expect(MIGRATION_SQL).toContain("'draft'");
      expect(MIGRATION_SQL).toContain("'open'");
      expect(MIGRATION_SQL).toContain("'paid'");
      expect(MIGRATION_SQL).toContain("'void'");
      expect(MIGRATION_SQL).toContain("'uncollectible'");
    });
  });

  describe('table structures', () => {
    it('tenant_subscriptions has required columns', () => {
      expect(MIGRATION_SQL).toContain('"tenant_id" uuid NOT NULL UNIQUE');
      expect(MIGRATION_SQL).toContain('"plan_id" varchar(50) NOT NULL REFERENCES "billing"."subscription_plans"("id")');
      expect(MIGRATION_SQL).toContain('"stripe_subscription_id" varchar(255)');
      expect(MIGRATION_SQL).toContain('"stripe_customer_id" varchar(255)');
      expect(MIGRATION_SQL).toContain('"status" "billing"."subscription_status" NOT NULL DEFAULT \'active\'');
      expect(MIGRATION_SQL).toContain('"billing_interval" "billing"."billing_interval" NOT NULL DEFAULT \'monthly\'');
      expect(MIGRATION_SQL).toContain('"cancel_at_period_end" boolean NOT NULL DEFAULT false');
    });

    it('stripe_events has varchar PK for Stripe event IDs', () => {
      expect(MIGRATION_SQL).toContain('"id" varchar(255) PRIMARY KEY');
    });

    it('invoices has required columns with unique stripe_invoice_id', () => {
      expect(MIGRATION_SQL).toContain('"stripe_invoice_id" varchar(255) NOT NULL');
      expect(MIGRATION_SQL).toContain('"amount_due_cents" integer NOT NULL');
      expect(MIGRATION_SQL).toContain('"currency" varchar(3) NOT NULL DEFAULT \'usd\'');
    });
  });

  describe('rollback instructions', () => {
    it('documents rollback SQL in header comments', () => {
      expect(MIGRATION_SQL).toContain('-- Rollback:');
      expect(MIGRATION_SQL).toContain('DROP TABLE IF EXISTS "billing"."invoices"');
      expect(MIGRATION_SQL).toContain('DROP TABLE IF EXISTS "billing"."stripe_events"');
      expect(MIGRATION_SQL).toContain('DROP TABLE IF EXISTS "billing"."tenant_subscriptions"');
      expect(MIGRATION_SQL).toContain('DROP TYPE IF EXISTS "billing"."invoice_status"');
      expect(MIGRATION_SQL).toContain('DROP TYPE IF EXISTS "billing"."billing_interval"');
      expect(MIGRATION_SQL).toContain('DROP TYPE IF EXISTS "billing"."subscription_status"');
    });
  });
});

// ─── Schema export tests ───────────────────────────────────────────────
describe('billing schema exports', () => {
  it('exports billingSchema', () => {
    expect(schema.billingSchema).toBeDefined();
  });

  it('exports subscriptionPlans table', () => {
    expect(schema.subscriptionPlans).toBeDefined();
  });

  it('exports tenantSubscriptions table', () => {
    expect(schema.tenantSubscriptions).toBeDefined();
  });

  it('exports stripeEvents table', () => {
    expect(schema.stripeEvents).toBeDefined();
  });

  it('exports invoices table', () => {
    expect(schema.invoices).toBeDefined();
  });

  it('exports usageRecords table', () => {
    expect(schema.usageRecords).toBeDefined();
  });

  it('exports billing enums', () => {
    expect(schema.subscriptionStatusEnum).toBeDefined();
    expect(schema.billingIntervalEnum).toBeDefined();
    expect(schema.invoiceStatusEnum).toBeDefined();
  });

  it('exports relations', () => {
    expect(schema.subscriptionPlansRelations).toBeDefined();
    expect(schema.tenantSubscriptionsRelations).toBeDefined();
    expect(schema.invoicesRelations).toBeDefined();
  });
});

// ─── Seed data tests ───────────────────────────────────────────────────
describe('billing plan seeds', () => {
  it('defines exactly 4 plan tiers', () => {
    expect(PLAN_SEEDS).toHaveLength(4);
  });

  it('has correct plan IDs in order', () => {
    expect(PLAN_SEEDS.map((p) => p.id)).toEqual([
      'free',
      'starter',
      'pro',
      'enterprise',
    ]);
  });

  describe('Free plan', () => {
    const free = PLAN_SEEDS.find((p) => p.id === 'free')!;

    it('costs $0', () => {
      expect(free.monthlyPriceCents).toBe(0);
      expect(free.annualPriceCents).toBeNull();
    });

    it('has 50 card limit and 3 seat limit', () => {
      expect(free.cardLimit).toBe(50);
      expect(free.seatLimit).toBe(3);
    });

    it('has no overage pricing', () => {
      expect(free.cardOveragePriceCents).toBeNull();
      expect(free.seatOveragePriceCents).toBeNull();
    });

    it('has all features disabled', () => {
      for (const value of Object.values(free.features)) {
        expect(value).toBe(false);
      }
    });

    it('is not contact-sales gated', () => {
      expect(free.contactSales).toBe(false);
    });
  });

  describe('Starter plan', () => {
    const starter = PLAN_SEEDS.find((p) => p.id === 'starter')!;

    it('has monthly and annual pricing', () => {
      expect(starter.monthlyPriceCents).toBeGreaterThan(0);
      expect(starter.annualPriceCents).toBeGreaterThan(0);
    });

    it('annual price is less than 12x monthly', () => {
      expect(starter.annualPriceCents!).toBeLessThan(
        starter.monthlyPriceCents * 12
      );
    });

    it('has higher limits than Free', () => {
      const free = PLAN_SEEDS.find((p) => p.id === 'free')!;
      expect(starter.cardLimit).toBeGreaterThan(free.cardLimit);
      expect(starter.seatLimit).toBeGreaterThan(free.seatLimit);
    });

    it('has overage pricing', () => {
      expect(starter.cardOveragePriceCents).toBeGreaterThan(0);
      expect(starter.seatOveragePriceCents).toBeGreaterThan(0);
    });

    it('enables production and transfer kanban', () => {
      expect(starter.features.productionKanban).toBe(true);
      expect(starter.features.transferKanban).toBe(true);
    });

    it('does not enable advanced features', () => {
      expect(starter.features.multiLocation).toBe(false);
      expect(starter.features.reloWisa).toBe(false);
      expect(starter.features.sso).toBe(false);
    });
  });

  describe('Pro plan', () => {
    const pro = PLAN_SEEDS.find((p) => p.id === 'pro')!;

    it('has monthly and annual pricing', () => {
      expect(pro.monthlyPriceCents).toBeGreaterThan(0);
      expect(pro.annualPriceCents).toBeGreaterThan(0);
    });

    it('annual price is less than 12x monthly', () => {
      expect(pro.annualPriceCents!).toBeLessThan(pro.monthlyPriceCents * 12);
    });

    it('costs more than Starter', () => {
      const starter = PLAN_SEEDS.find((p) => p.id === 'starter')!;
      expect(pro.monthlyPriceCents).toBeGreaterThan(
        starter.monthlyPriceCents
      );
    });

    it('has higher limits than Starter', () => {
      const starter = PLAN_SEEDS.find((p) => p.id === 'starter')!;
      expect(pro.cardLimit).toBeGreaterThan(starter.cardLimit);
      expect(pro.seatLimit).toBeGreaterThan(starter.seatLimit);
    });

    it('enables multi-location, reloWisa, webhooks, and priority support', () => {
      expect(pro.features.multiLocation).toBe(true);
      expect(pro.features.reloWisa).toBe(true);
      expect(pro.features.webhooks).toBe(true);
      expect(pro.features.prioritySupport).toBe(true);
    });
  });

  describe('Enterprise plan', () => {
    const enterprise = PLAN_SEEDS.find((p) => p.id === 'enterprise')!;

    it('uses -1 for unlimited card and seat limits', () => {
      expect(enterprise.cardLimit).toBe(-1);
      expect(enterprise.seatLimit).toBe(-1);
    });

    it('has $0 monthly price (custom pricing via sales)', () => {
      expect(enterprise.monthlyPriceCents).toBe(0);
      expect(enterprise.annualPriceCents).toBeNull();
    });

    it('is contact-sales gated', () => {
      expect(enterprise.contactSales).toBe(true);
    });

    it('has all features enabled', () => {
      for (const value of Object.values(enterprise.features)) {
        expect(value).toBe(true);
      }
    });

    it('has no overage pricing', () => {
      expect(enterprise.cardOveragePriceCents).toBeNull();
      expect(enterprise.seatOveragePriceCents).toBeNull();
    });
  });

  describe('plan ordering', () => {
    it('sortOrder increases monotonically', () => {
      for (let i = 1; i < PLAN_SEEDS.length; i++) {
        expect(PLAN_SEEDS[i].sortOrder).toBeGreaterThan(
          PLAN_SEEDS[i - 1].sortOrder
        );
      }
    });

    it('card limits increase (or go unlimited) across tiers', () => {
      for (let i = 1; i < PLAN_SEEDS.length; i++) {
        const prev = PLAN_SEEDS[i - 1].cardLimit;
        const curr = PLAN_SEEDS[i].cardLimit;
        // -1 means unlimited, which is always >= any finite limit
        if (curr === -1) continue;
        expect(curr).toBeGreaterThan(prev);
      }
    });

    it('feature count increases or stays equal across tiers', () => {
      const featureCount = (features: PlanFeatures) =>
        Object.values(features).filter(Boolean).length;

      for (let i = 1; i < PLAN_SEEDS.length; i++) {
        expect(featureCount(PLAN_SEEDS[i].features)).toBeGreaterThanOrEqual(
          featureCount(PLAN_SEEDS[i - 1].features)
        );
      }
    });
  });
});

// ─── Backward compatibility tests ─────────────────────────────────────
describe('backward compatibility', () => {
  it('auth.tenants still has planId, cardLimit, seatLimit columns', () => {
    // Verify the tenant schema is unchanged — these fields must remain for existing reads
    const tenantColumns = schema.tenants;
    expect(tenantColumns.planId).toBeDefined();
    expect(tenantColumns.cardLimit).toBeDefined();
    expect(tenantColumns.seatLimit).toBeDefined();
  });

  it('migration body (non-comment lines) has no destructive DDL', () => {
    // Strip comment lines to check only executable SQL
    const executableLines = MIGRATION_SQL.split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
    expect(executableLines).not.toContain('DROP TABLE');
    expect(executableLines).not.toContain('DROP COLUMN');
    expect(executableLines).not.toContain('ALTER COLUMN');
  });

  it('free plan limits match default tenant creation values', () => {
    const free = PLAN_SEEDS.find((p) => p.id === 'free')!;
    // Default tenants are created with planId='free', cardLimit=50, seatLimit=3
    expect(free.cardLimit).toBe(50);
    expect(free.seatLimit).toBe(3);
  });
});
