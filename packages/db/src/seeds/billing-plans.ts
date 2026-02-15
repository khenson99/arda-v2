/**
 * Billing Plan Seeds — Idempotent seed data for subscription plan tiers.
 *
 * Defines Free/Starter/Pro/Enterprise plans per PRD pricing and feature limits.
 * Uses ON CONFLICT (upsert) so this can run repeatedly in local/CI bootstrap.
 *
 * Plan limits use -1 to represent unlimited (Enterprise tier).
 */

import type { PlanFeatures } from '../schema/billing.js';

export interface PlanSeed {
  id: string;
  name: string;
  description: string;
  monthlyPriceCents: number;
  annualPriceCents: number | null;
  cardLimit: number;    // -1 = unlimited
  seatLimit: number;    // -1 = unlimited
  cardOveragePriceCents: number | null;
  seatOveragePriceCents: number | null;
  features: PlanFeatures;
  contactSales: boolean;
  sortOrder: number;
}

export const PLAN_SEEDS: PlanSeed[] = [
  {
    id: 'free',
    name: 'Free',
    description: 'Get started with basic kanban inventory management.',
    monthlyPriceCents: 0,
    annualPriceCents: null,
    cardLimit: 50,
    seatLimit: 3,
    cardOveragePriceCents: null,
    seatOveragePriceCents: null,
    features: {
      multiLocation: false,
      productionKanban: false,
      transferKanban: false,
      reloWisa: false,
      ecommerceApi: false,
      scheduledReports: false,
      sso: false,
      webhooks: false,
      customBranding: false,
      prioritySupport: false,
    },
    contactSales: false,
    sortOrder: 0,
  },
  {
    id: 'starter',
    name: 'Starter',
    description: 'For growing teams that need production and transfer kanban.',
    monthlyPriceCents: 4900,        // $49/mo
    annualPriceCents: 47000,         // $470/yr (~$39.17/mo, ~20% off)
    cardLimit: 200,
    seatLimit: 10,
    cardOveragePriceCents: 25,       // $0.25 per additional card/month
    seatOveragePriceCents: 500,      // $5.00 per additional seat/month
    features: {
      multiLocation: false,
      productionKanban: true,
      transferKanban: true,
      reloWisa: false,
      ecommerceApi: false,
      scheduledReports: false,
      sso: false,
      webhooks: false,
      customBranding: false,
      prioritySupport: false,
    },
    contactSales: false,
    sortOrder: 1,
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'Full-featured plan for multi-location manufacturing operations.',
    monthlyPriceCents: 14900,        // $149/mo
    annualPriceCents: 143000,         // $1,430/yr (~$119.17/mo, ~20% off)
    cardLimit: 1000,
    seatLimit: 50,
    cardOveragePriceCents: 15,       // $0.15 per additional card/month
    seatOveragePriceCents: 300,      // $3.00 per additional seat/month
    features: {
      multiLocation: true,
      productionKanban: true,
      transferKanban: true,
      reloWisa: true,
      ecommerceApi: true,
      scheduledReports: true,
      sso: false,
      webhooks: true,
      customBranding: false,
      prioritySupport: true,
    },
    contactSales: false,
    sortOrder: 2,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'Unlimited usage with SSO, custom branding, and dedicated support.',
    monthlyPriceCents: 0,            // Custom pricing via sales
    annualPriceCents: null,
    cardLimit: -1,                   // Unlimited
    seatLimit: -1,                   // Unlimited
    cardOveragePriceCents: null,
    seatOveragePriceCents: null,
    features: {
      multiLocation: true,
      productionKanban: true,
      transferKanban: true,
      reloWisa: true,
      ecommerceApi: true,
      scheduledReports: true,
      sso: true,
      webhooks: true,
      customBranding: true,
      prioritySupport: true,
    },
    contactSales: true,
    sortOrder: 3,
  },
];
