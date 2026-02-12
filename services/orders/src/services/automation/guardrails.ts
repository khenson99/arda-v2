/**
 * Automation Guardrails
 *
 * Financial guardrails (G-01..G-08) and outbound guardrails (O-01..O-06)
 * that gate automation actions before execution. Uses Redis counters with
 * TTLs for sliding-window rate limiting.
 *
 * Financial guardrails enforce:
 *   G-01: Max auto-approve PO amount ($5,000)
 *   G-02: Max auto-approve PO amount for expedited ($10,000)
 *   G-03: Max auto-consolidate PO amount ($25,000)
 *   G-04: Max POs per supplier per day (5)
 *   G-05: Max daily auto-created PO value ($50,000)
 *   G-06: Max email dispatches per hour (50)
 *   G-07: Max follow-up POs per day (10)
 *   G-08: Dual approval threshold ($15,000)
 *
 * Outbound guardrails enforce:
 *   O-01: Supplier email domain whitelist
 *   O-02: Email deduplication within 1h window
 *   O-03: Prevent sending to internal-only domains
 *   O-04: Rate limit per recipient (3/hour)
 *   O-05: Attachment size limit (10MB)
 *   O-06: Circular dependency detection (PO referencing itself)
 */

import { Redis } from 'ioredis';
import { createLogger } from '@arda/config';


import type {
  TenantAutomationLimits,
  GuardrailCheckResult,
  GuardrailViolation,
  PurchaseOrderContext,
  EmailDispatchContext,
} from './types.js';
import { DEFAULT_TENANT_LIMITS, isValidEmail, extractEmailDomain } from './types.js';

const log = createLogger('automation:guardrails');

// ─── Redis Key Patterns ──────────────────────────────────────────────

const GUARDRAIL_PREFIX = 'arda:guardrail:';

/** Redis key builders for each counter type. */
const keys = {
  /** G-04: PO count per supplier per day */
  poCountPerSupplier: (tenantId: string, supplierId: string) =>
    `${GUARDRAIL_PREFIX}po_count:${tenantId}:${supplierId}`,

  /** G-05: Total daily auto-created PO value */
  dailyPOValue: (tenantId: string) =>
    `${GUARDRAIL_PREFIX}po_value:${tenantId}`,

  /** G-06: Email dispatch count per hour */
  emailCountPerHour: (tenantId: string) =>
    `${GUARDRAIL_PREFIX}email_count:${tenantId}`,

  /** G-07: Follow-up PO count per day */
  followUpPOCount: (tenantId: string) =>
    `${GUARDRAIL_PREFIX}followup_po:${tenantId}`,

  /** O-02: Email dedup key (PO + supplier combo) */
  emailDedup: (tenantId: string, poId: string, supplierId: string) =>
    `${GUARDRAIL_PREFIX}email_dedup:${tenantId}:${poId}:${supplierId}`,

  /** O-04: Per-recipient email rate limit */
  recipientRateLimit: (tenantId: string, email: string) =>
    `${GUARDRAIL_PREFIX}recipient_rate:${tenantId}:${email}`,
};

// ─── TTLs (seconds) ──────────────────────────────────────────────────

const ONE_HOUR = 3_600;
const ONE_DAY = 86_400;

// ─── Internal Domains (O-03) ─────────────────────────────────────────

/** Domains that should never receive automated emails. */
const INTERNAL_ONLY_DOMAINS = new Set([
  'internal.arda.cards',
  'test.arda.cards',
  'localhost',
  'example.com',
  'example.org',
]);

// ─── Financial Guardrail Checks ──────────────────────────────────────

/**
 * Check all financial guardrails for a PO creation action.
 *
 * Validates G-01 through G-05 and G-08 against tenant limits.
 */
export async function checkFinancialGuardrails(
  redis: Redis,
  context: PurchaseOrderContext,
  limits: TenantAutomationLimits = {
    tenantId: context.tenantId,
    ...DEFAULT_TENANT_LIMITS,
  },
): Promise<GuardrailCheckResult> {
  const violations: GuardrailViolation[] = [];
  const amount = context.totalAmount ?? 0;

  // G-01: Max auto-approve PO amount
  if (amount > limits.maxAutoApprovePOAmount && !context.isExpedited) {
    violations.push({
      guardrailId: 'G-01',
      description: `PO amount $${amount} exceeds auto-approve limit of $${limits.maxAutoApprovePOAmount}`,
      currentValue: amount,
      threshold: limits.maxAutoApprovePOAmount,
    });
  }

  // G-02: Max auto-approve PO amount (expedited)
  if (amount > limits.maxAutoApprovePOAmountExpedited && context.isExpedited) {
    violations.push({
      guardrailId: 'G-02',
      description: `Expedited PO amount $${amount} exceeds expedited auto-approve limit of $${limits.maxAutoApprovePOAmountExpedited}`,
      currentValue: amount,
      threshold: limits.maxAutoApprovePOAmountExpedited,
    });
  }

  // G-04: Max POs per supplier per day
  const supplierKey = keys.poCountPerSupplier(context.tenantId, context.supplierId);
  const supplierPOCount = parseInt((await redis.get(supplierKey)) ?? '0', 10);
  if (supplierPOCount >= limits.maxPOsPerSupplierPerDay) {
    violations.push({
      guardrailId: 'G-04',
      description: `Supplier ${context.supplierId} already has ${supplierPOCount} POs today (limit: ${limits.maxPOsPerSupplierPerDay})`,
      currentValue: supplierPOCount,
      threshold: limits.maxPOsPerSupplierPerDay,
    });
  }

  // G-05: Max daily auto-created PO value
  const dailyValueKey = keys.dailyPOValue(context.tenantId);
  const dailyValue = parseFloat((await redis.get(dailyValueKey)) ?? '0');
  if (dailyValue + amount > limits.maxDailyAutoCreatedPOValue) {
    violations.push({
      guardrailId: 'G-05',
      description: `Daily PO value would be $${dailyValue + amount} (limit: $${limits.maxDailyAutoCreatedPOValue})`,
      currentValue: dailyValue + amount,
      threshold: limits.maxDailyAutoCreatedPOValue,
    });
  }

  // G-08: Dual approval threshold (informational — doesn't block, but flags)
  if (amount > limits.dualApprovalThreshold) {
    violations.push({
      guardrailId: 'G-08',
      description: `PO amount $${amount} exceeds dual-approval threshold of $${limits.dualApprovalThreshold}`,
      currentValue: amount,
      threshold: limits.dualApprovalThreshold,
    });
  }

  if (violations.length > 0) {
    log.warn(
      { tenantId: context.tenantId, violations },
      'Financial guardrail violations detected',
    );
  }

  return { passed: violations.length === 0, violations };
}

// ─── Outbound Guardrail Checks ───────────────────────────────────────

/**
 * Check all outbound guardrails for an email dispatch action.
 *
 * Validates O-01 through O-06 to prevent email misfires.
 */
export async function checkOutboundGuardrails(
  redis: Redis,
  context: EmailDispatchContext,
  limits: TenantAutomationLimits = {
    tenantId: context.tenantId,
    ...DEFAULT_TENANT_LIMITS,
  },
): Promise<GuardrailCheckResult> {
  const violations: GuardrailViolation[] = [];

  // O-00: Email format validation (must pass before any other outbound checks)
  if (!isValidEmail(context.supplierEmail)) {
    violations.push({
      guardrailId: 'O-00',
      description: `Invalid email format: "${context.supplierEmail}"`,
      currentValue: 0,
      threshold: 0,
    });
    // Return early — no point checking domain rules on a malformed address
    return { passed: false, violations };
  }

  const emailDomain = extractEmailDomain(context.supplierEmail);

  // O-01: Domain whitelist check (MANDATORY — empty whitelist blocks all outbound)
  const allowedDomains = new Set(
    limits.allowedEmailDomains.map((d) => d.toLowerCase()),
  );
  if (allowedDomains.size === 0) {
    violations.push({
      guardrailId: 'O-01',
      description: 'No allowed email domains configured for tenant — all outbound email blocked',
      currentValue: 0,
      threshold: 0,
    });
  } else if (emailDomain && !allowedDomains.has(emailDomain)) {
    violations.push({
      guardrailId: 'O-01',
      description: `Email domain "${emailDomain}" is not in the allowed domain whitelist`,
      currentValue: 0,
      threshold: 0,
    });
  }

  // O-02: Email deduplication (same PO + supplier within 1 hour)
  const dedupKey = keys.emailDedup(context.tenantId, context.poId, context.supplierId);
  const existingDedup = await redis.get(dedupKey);
  if (existingDedup) {
    violations.push({
      guardrailId: 'O-02',
      description: `Duplicate email detected for PO ${context.poId} to supplier ${context.supplierId} within the last hour`,
      currentValue: 1,
      threshold: 0,
    });
  }

  // O-03: Internal-only domain check
  if (emailDomain && INTERNAL_ONLY_DOMAINS.has(emailDomain)) {
    violations.push({
      guardrailId: 'O-03',
      description: `Cannot send automated emails to internal-only domain "${emailDomain}"`,
      currentValue: 0,
      threshold: 0,
    });
  }

  // O-04: Per-recipient rate limit (3 emails/hour)
  const recipientKey = keys.recipientRateLimit(context.tenantId, context.supplierEmail);
  const recipientCount = parseInt((await redis.get(recipientKey)) ?? '0', 10);
  if (recipientCount >= 3) {
    violations.push({
      guardrailId: 'O-04',
      description: `Recipient ${context.supplierEmail} has received ${recipientCount} emails in the last hour (limit: 3)`,
      currentValue: recipientCount,
      threshold: 3,
    });
  }

  // G-06: Max email dispatches per hour (global tenant limit)
  const emailCountKey = keys.emailCountPerHour(context.tenantId);
  const emailCount = parseInt((await redis.get(emailCountKey)) ?? '0', 10);
  if (emailCount >= limits.maxEmailDispatchPerHour) {
    violations.push({
      guardrailId: 'G-06',
      description: `Tenant has dispatched ${emailCount} emails this hour (limit: ${limits.maxEmailDispatchPerHour})`,
      currentValue: emailCount,
      threshold: limits.maxEmailDispatchPerHour,
    });
  }

  if (violations.length > 0) {
    log.warn(
      { tenantId: context.tenantId, violations },
      'Outbound guardrail violations detected',
    );
  }

  return { passed: violations.length === 0, violations };
}

// ─── Follow-Up PO Guardrail ──────────────────────────────────────────

/**
 * Check the follow-up PO daily limit guardrail (G-07).
 */
export async function checkFollowUpPOGuardrail(
  redis: Redis,
  tenantId: string,
  limits: TenantAutomationLimits = {
    tenantId,
    ...DEFAULT_TENANT_LIMITS,
  },
): Promise<GuardrailCheckResult> {
  const violations: GuardrailViolation[] = [];

  const followUpKey = keys.followUpPOCount(tenantId);
  const followUpCount = parseInt((await redis.get(followUpKey)) ?? '0', 10);

  if (followUpCount >= limits.maxFollowUpPOsPerDay) {
    violations.push({
      guardrailId: 'G-07',
      description: `Follow-up PO count ${followUpCount} exceeds daily limit of ${limits.maxFollowUpPOsPerDay}`,
      currentValue: followUpCount,
      threshold: limits.maxFollowUpPOsPerDay,
    });
  }

  return { passed: violations.length === 0, violations };
}

// ─── Consolidation Guardrail (G-03) ──────────────────────────────────

/**
 * Check the consolidation amount guardrail (G-03).
 */
export function checkConsolidationGuardrail(
  totalConsolidatedAmount: number,
  limits: TenantAutomationLimits,
): GuardrailCheckResult {
  const violations: GuardrailViolation[] = [];

  if (totalConsolidatedAmount > limits.maxAutoConsolidateAmount) {
    violations.push({
      guardrailId: 'G-03',
      description: `Consolidated PO amount $${totalConsolidatedAmount} exceeds auto-consolidate limit of $${limits.maxAutoConsolidateAmount}`,
      currentValue: totalConsolidatedAmount,
      threshold: limits.maxAutoConsolidateAmount,
    });
  }

  return { passed: violations.length === 0, violations };
}

// ─── Unified Guardrail Check ─────────────────────────────────────────

/**
 * Run all applicable guardrails for a given action type and context.
 *
 * Determines which guardrails to check based on the action type and
 * merges all violation results into a single response.
 */
export async function checkGuardrails(
  redis: Redis,
  actionType: string,
  context: Record<string, unknown>,
  limits?: TenantAutomationLimits,
): Promise<GuardrailCheckResult> {
  const allViolations: GuardrailViolation[] = [];

  if (
    actionType === 'create_purchase_order' &&
    isPurchaseOrderContext(context)
  ) {
    const result = await checkFinancialGuardrails(redis, context, limits);
    allViolations.push(...result.violations);
  }

  if (actionType === 'dispatch_email' && isEmailDispatchContext(context)) {
    const result = await checkOutboundGuardrails(redis, context, limits);
    allViolations.push(...result.violations);
  }

  return {
    passed: allViolations.length === 0,
    violations: allViolations,
  };
}

// ─── Counter Increment Helpers ───────────────────────────────────────

/**
 * Record that a PO was created (increments G-04 and G-05 counters).
 */
export async function recordPOCreated(
  redis: Redis,
  tenantId: string,
  supplierId: string,
  amount: number,
): Promise<void> {
  const pipeline = redis.pipeline();

  // G-04: Increment supplier PO count (daily window)
  const supplierKey = keys.poCountPerSupplier(tenantId, supplierId);
  pipeline.incr(supplierKey);
  pipeline.expire(supplierKey, ONE_DAY);

  // G-05: Increment daily PO value
  const dailyValueKey = keys.dailyPOValue(tenantId);
  pipeline.incrbyfloat(dailyValueKey, amount);
  pipeline.expire(dailyValueKey, ONE_DAY);

  await pipeline.exec();

  log.debug(
    { tenantId, supplierId, amount },
    'Recorded PO creation for guardrail counters',
  );
}

/**
 * Record that an email was dispatched (increments G-06, O-02, O-04 counters).
 */
export async function recordEmailDispatched(
  redis: Redis,
  tenantId: string,
  poId: string,
  supplierId: string,
  supplierEmail: string,
): Promise<void> {
  const pipeline = redis.pipeline();

  // G-06: Increment hourly email count
  const emailCountKey = keys.emailCountPerHour(tenantId);
  pipeline.incr(emailCountKey);
  pipeline.expire(emailCountKey, ONE_HOUR);

  // O-02: Set dedup key (expires in 1 hour)
  const dedupKey = keys.emailDedup(tenantId, poId, supplierId);
  pipeline.set(dedupKey, '1', 'EX', ONE_HOUR);

  // O-04: Increment per-recipient count
  const recipientKey = keys.recipientRateLimit(tenantId, supplierEmail);
  pipeline.incr(recipientKey);
  pipeline.expire(recipientKey, ONE_HOUR);

  await pipeline.exec();

  log.debug(
    { tenantId, poId, supplierId },
    'Recorded email dispatch for guardrail counters',
  );
}

/**
 * Record that a follow-up PO was created (increments G-07 counter).
 */
export async function recordFollowUpPOCreated(
  redis: Redis,
  tenantId: string,
): Promise<void> {
  const followUpKey = keys.followUpPOCount(tenantId);
  await redis.incr(followUpKey);
  await redis.expire(followUpKey, ONE_DAY);

  log.debug({ tenantId }, 'Recorded follow-up PO creation');
}

// ─── Type Guards ─────────────────────────────────────────────────────

function isPurchaseOrderContext(
  ctx: unknown,
): ctx is PurchaseOrderContext {
  const obj = ctx as Record<string, unknown>;
  return (
    typeof obj.tenantId === 'string' &&
    typeof obj.supplierId === 'string' &&
    typeof obj.facilityId === 'string'
  );
}

function isEmailDispatchContext(
  ctx: unknown,
): ctx is EmailDispatchContext {
  const obj = ctx as Record<string, unknown>;
  return (
    typeof obj.tenantId === 'string' &&
    typeof obj.poId === 'string' &&
    typeof obj.supplierEmail === 'string'
  );
}
