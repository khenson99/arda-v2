/**
 * Automation Rule Evaluator
 *
 * Pure rule evaluation engine for the TCAAF pipeline.
 * Evaluates conditions against context data, resolves priority,
 * and enforces deny-first semantics per automation-policy.md.
 */

import { createLogger } from '@arda/config';
import type {
  AutomationRule,
  AutomationCondition,
  ConditionOperator,
  RuleCategory,
  RuleEvaluationResult,
  ActionType,
} from './types.js';

const log = createLogger('automation:rule-evaluator');

// ─── Seed Rules ──────────────────────────────────────────────────────

/**
 * Default seed rules that every tenant starts with.
 * These correspond to the decision matrix in automation-policy.md.
 */
function getSeedRules(): AutomationRule[] {
  return [
    // ── PO Creation Rules ──
    {
      id: 'P-01',
      name: 'Card must be triggered for PO',
      description: 'Card must be in triggered stage',
      ruleType: 'allow',
      category: 'po_creation',
      trigger: { event: 'card.stage.triggered', sourceEntity: 'kanban_card' },
      conditions: [{ field: 'card.currentStage', operator: 'eq', value: 'triggered' }],
      action: {
        type: 'create_purchase_order',
        params: {},
        idempotencyKeyTemplate: 'po_create:{{tenantId}}:{{supplierId}}:{{facilityId}}:{{date}}',
        timeoutMs: 30_000,
      },
      approval: {
        required: true,
        strategy: 'threshold_based',
        thresholds: { autoApproveBelow: 5_000, requireApprovalAbove: 5_000, requireDualApprovalAbove: 15_000 },
      },
      fallback: {
        onConditionFail: 'queue_for_review',
        onActionFail: 'retry',
        maxRetries: 3,
        retryDelayMs: 1_000,
        retryBackoffMultiplier: 2,
      },
      isActive: true,
      priority: 10,
      tenantConfigurable: true,
    },
    {
      id: 'P-02',
      name: 'Loop must be procurement type',
      description: 'Loop must be procurement type for PO creation',
      ruleType: 'allow',
      category: 'po_creation',
      trigger: { event: 'card.stage.triggered', sourceEntity: 'kanban_card' },
      conditions: [{ field: 'loop.loopType', operator: 'eq', value: 'procurement' }],
      action: {
        type: 'create_purchase_order',
        params: {},
        idempotencyKeyTemplate: 'po_create:{{tenantId}}:{{supplierId}}:{{facilityId}}:{{date}}',
        timeoutMs: 30_000,
      },
      approval: { required: false, strategy: 'auto_approve' },
      fallback: { onConditionFail: 'skip', onActionFail: 'retry', maxRetries: 3, retryDelayMs: 1_000, retryBackoffMultiplier: 2 },
      isActive: true,
      priority: 10,
      tenantConfigurable: false,
    },
    {
      id: 'P-04',
      name: 'Block inactive loops',
      description: 'Inactive loops cannot generate POs',
      ruleType: 'deny',
      category: 'po_creation',
      trigger: { event: 'card.stage.triggered', sourceEntity: 'kanban_card' },
      conditions: [{ field: 'loop.isActive', operator: 'eq', value: false }],
      action: {
        type: 'create_purchase_order',
        params: {},
        idempotencyKeyTemplate: '',
        timeoutMs: 0,
      },
      approval: { required: false, strategy: 'auto_approve' },
      fallback: { onConditionFail: 'skip', onActionFail: 'halt', maxRetries: 0, retryDelayMs: 0, retryBackoffMultiplier: 1 },
      isActive: true,
      priority: 1,
      tenantConfigurable: false,
    },
    {
      id: 'P-05',
      name: 'Block inactive cards',
      description: 'Inactive cards cannot generate POs',
      ruleType: 'deny',
      category: 'po_creation',
      trigger: { event: 'card.stage.triggered', sourceEntity: 'kanban_card' },
      conditions: [{ field: 'card.isActive', operator: 'eq', value: false }],
      action: {
        type: 'create_purchase_order',
        params: {},
        idempotencyKeyTemplate: '',
        timeoutMs: 0,
      },
      approval: { required: false, strategy: 'auto_approve' },
      fallback: { onConditionFail: 'skip', onActionFail: 'halt', maxRetries: 0, retryDelayMs: 0, retryBackoffMultiplier: 1 },
      isActive: true,
      priority: 1,
      tenantConfigurable: false,
    },
    {
      id: 'P-07',
      name: 'Tenant PO kill switch',
      description: 'Tenant-level kill switch for PO creation',
      ruleType: 'deny',
      category: 'po_creation',
      trigger: { event: 'card.stage.triggered', sourceEntity: 'kanban_card' },
      conditions: [{ field: 'tenant.poCreationPaused', operator: 'eq', value: true }],
      action: {
        type: 'create_purchase_order',
        params: {},
        idempotencyKeyTemplate: '',
        timeoutMs: 0,
      },
      approval: { required: false, strategy: 'auto_approve' },
      fallback: { onConditionFail: 'skip', onActionFail: 'halt', maxRetries: 0, retryDelayMs: 0, retryBackoffMultiplier: 1 },
      isActive: true,
      priority: 0,
      tenantConfigurable: true,
    },

    // ── Email Dispatch Rules ──
    {
      id: 'E-01',
      name: 'PO must be approved for dispatch',
      description: 'PO must be approved before email dispatch',
      ruleType: 'allow',
      category: 'email_dispatch',
      trigger: { event: 'po.status.approved', sourceEntity: 'purchase_order' },
      conditions: [{ field: 'po.status', operator: 'eq', value: 'approved' }],
      action: {
        type: 'dispatch_email',
        params: {},
        idempotencyKeyTemplate: 'email_dispatch:{{tenantId}}:{{poId}}',
        timeoutMs: 30_000,
      },
      approval: { required: false, strategy: 'auto_approve' },
      fallback: { onConditionFail: 'skip', onActionFail: 'retry', maxRetries: 3, retryDelayMs: 1_000, retryBackoffMultiplier: 2 },
      isActive: true,
      priority: 10,
      tenantConfigurable: true,
    },
    {
      id: 'E-04',
      name: 'Block blacklisted suppliers',
      description: 'Never auto-email blacklisted suppliers',
      ruleType: 'deny',
      category: 'email_dispatch',
      trigger: { event: 'po.status.approved', sourceEntity: 'purchase_order' },
      conditions: [{ field: 'supplier.isBlacklisted', operator: 'eq', value: true }],
      action: {
        type: 'dispatch_email',
        params: {},
        idempotencyKeyTemplate: '',
        timeoutMs: 0,
      },
      approval: { required: false, strategy: 'auto_approve' },
      fallback: { onConditionFail: 'skip', onActionFail: 'halt', maxRetries: 0, retryDelayMs: 0, retryBackoffMultiplier: 1 },
      isActive: true,
      priority: 1,
      tenantConfigurable: false,
    },
    {
      id: 'E-06',
      name: 'Block re-dispatch',
      description: 'Block re-dispatch of already sent POs',
      ruleType: 'deny',
      category: 'email_dispatch',
      trigger: { event: 'po.status.approved', sourceEntity: 'purchase_order' },
      conditions: [{ field: 'po.sentToEmail', operator: 'exists', value: true }],
      action: {
        type: 'dispatch_email',
        params: {},
        idempotencyKeyTemplate: '',
        timeoutMs: 0,
      },
      approval: { required: false, strategy: 'auto_approve' },
      fallback: { onConditionFail: 'skip', onActionFail: 'halt', maxRetries: 0, retryDelayMs: 0, retryBackoffMultiplier: 1 },
      isActive: true,
      priority: 1,
      tenantConfigurable: false,
    },
    {
      id: 'E-07',
      name: 'Tenant email kill switch',
      description: 'Tenant-level email dispatch kill switch',
      ruleType: 'deny',
      category: 'email_dispatch',
      trigger: { event: 'po.status.approved', sourceEntity: 'purchase_order' },
      conditions: [{ field: 'tenant.emailDispatchPaused', operator: 'eq', value: true }],
      action: {
        type: 'dispatch_email',
        params: {},
        idempotencyKeyTemplate: '',
        timeoutMs: 0,
      },
      approval: { required: false, strategy: 'auto_approve' },
      fallback: { onConditionFail: 'skip', onActionFail: 'halt', maxRetries: 0, retryDelayMs: 0, retryBackoffMultiplier: 1 },
      isActive: true,
      priority: 0,
      tenantConfigurable: true,
    },

    // ── WO Creation Rules ──
    {
      id: 'W-01',
      name: 'Card must be triggered for WO',
      description: 'Card must be in triggered stage',
      ruleType: 'allow',
      category: 'wo_creation',
      trigger: { event: 'card.stage.triggered', sourceEntity: 'kanban_card' },
      conditions: [{ field: 'card.currentStage', operator: 'eq', value: 'triggered' }],
      action: {
        type: 'create_work_order',
        params: {},
        idempotencyKeyTemplate: 'wo_create:{{tenantId}}:{{facilityId}}:{{partId}}:{{date}}',
        timeoutMs: 30_000,
      },
      approval: { required: false, strategy: 'auto_approve' },
      fallback: { onConditionFail: 'escalate', onActionFail: 'escalate', maxRetries: 3, retryDelayMs: 1_000, retryBackoffMultiplier: 2 },
      isActive: true,
      priority: 10,
      tenantConfigurable: true,
    },
    {
      id: 'W-02',
      name: 'Loop must be production type',
      description: 'Loop must be production type for WO creation',
      ruleType: 'allow',
      category: 'wo_creation',
      trigger: { event: 'card.stage.triggered', sourceEntity: 'kanban_card' },
      conditions: [{ field: 'loop.loopType', operator: 'eq', value: 'production' }],
      action: {
        type: 'create_work_order',
        params: {},
        idempotencyKeyTemplate: 'wo_create:{{tenantId}}:{{facilityId}}:{{partId}}:{{date}}',
        timeoutMs: 30_000,
      },
      approval: { required: false, strategy: 'auto_approve' },
      fallback: { onConditionFail: 'skip', onActionFail: 'escalate', maxRetries: 3, retryDelayMs: 1_000, retryBackoffMultiplier: 2 },
      isActive: true,
      priority: 10,
      tenantConfigurable: false,
    },

    // ── TO Creation Rules ──
    {
      id: 'T-01',
      name: 'Card must be triggered for TO',
      description: 'Card must be in triggered stage',
      ruleType: 'allow',
      category: 'to_creation',
      trigger: { event: 'card.stage.triggered', sourceEntity: 'kanban_card' },
      conditions: [{ field: 'card.currentStage', operator: 'eq', value: 'triggered' }],
      action: {
        type: 'create_transfer_order',
        params: {},
        idempotencyKeyTemplate: 'to_create:{{tenantId}}:{{sourceFacilityId}}:{{destFacilityId}}:{{date}}',
        timeoutMs: 30_000,
      },
      approval: { required: false, strategy: 'auto_approve' },
      fallback: { onConditionFail: 'escalate', onActionFail: 'escalate', maxRetries: 3, retryDelayMs: 1_000, retryBackoffMultiplier: 2 },
      isActive: true,
      priority: 10,
      tenantConfigurable: true,
    },
    {
      id: 'T-02',
      name: 'Loop must be transfer type',
      description: 'Loop must be transfer type for TO creation',
      ruleType: 'allow',
      category: 'to_creation',
      trigger: { event: 'card.stage.triggered', sourceEntity: 'kanban_card' },
      conditions: [{ field: 'loop.loopType', operator: 'eq', value: 'transfer' }],
      action: {
        type: 'create_transfer_order',
        params: {},
        idempotencyKeyTemplate: 'to_create:{{tenantId}}:{{sourceFacilityId}}:{{destFacilityId}}:{{date}}',
        timeoutMs: 30_000,
      },
      approval: { required: false, strategy: 'auto_approve' },
      fallback: { onConditionFail: 'skip', onActionFail: 'escalate', maxRetries: 3, retryDelayMs: 1_000, retryBackoffMultiplier: 2 },
      isActive: true,
      priority: 10,
      tenantConfigurable: false,
    },
  ];
}

// ─── Dot-path field access ───────────────────────────────────────────

/**
 * Resolve a dot-path field from a nested context object.
 * e.g. "order.totalAmount" from { order: { totalAmount: 500 } }
 */
export function resolveField(context: Record<string, unknown>, fieldPath: string): unknown {
  const parts = fieldPath.split('.');
  let current: unknown = context;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

// ─── Condition Evaluation ────────────────────────────────────────────

/**
 * Evaluate a single condition against the context data.
 * Returns true if the condition is satisfied.
 */
export function evaluateCondition(
  condition: AutomationCondition,
  context: Record<string, unknown>,
): boolean {
  const fieldValue = resolveField(context, condition.field);
  const { operator, value } = condition;

  return applyOperator(operator, fieldValue, value);
}

function applyOperator(operator: ConditionOperator, fieldValue: unknown, conditionValue: unknown): boolean {
  switch (operator) {
    case 'eq':
      return fieldValue === conditionValue;

    case 'neq':
      return fieldValue !== conditionValue;

    case 'gt':
      return typeof fieldValue === 'number' && typeof conditionValue === 'number'
        && fieldValue > conditionValue;

    case 'gte':
      return typeof fieldValue === 'number' && typeof conditionValue === 'number'
        && fieldValue >= conditionValue;

    case 'lt':
      return typeof fieldValue === 'number' && typeof conditionValue === 'number'
        && fieldValue < conditionValue;

    case 'lte':
      return typeof fieldValue === 'number' && typeof conditionValue === 'number'
        && fieldValue <= conditionValue;

    case 'in':
      return Array.isArray(conditionValue) && conditionValue.includes(fieldValue);

    case 'not_in':
      return Array.isArray(conditionValue) && !conditionValue.includes(fieldValue);

    case 'exists':
      return conditionValue === true
        ? fieldValue !== null && fieldValue !== undefined
        : fieldValue === null || fieldValue === undefined;

    case 'regex': {
      if (typeof fieldValue !== 'string' || typeof conditionValue !== 'string') return false;
      try {
        return new RegExp(conditionValue).test(fieldValue);
      } catch {
        return false;
      }
    }

    default:
      return false;
  }
}

// ─── Rule Loading ────────────────────────────────────────────────────

/**
 * Load active rules for a tenant, optionally filtered by category.
 * Currently returns seed rules; will query DB in future iterations.
 */
export function loadActiveRules(
  _tenantId: string,
  category?: RuleCategory,
): AutomationRule[] {
  let rules = getSeedRules().filter((r) => r.isActive);

  if (category) {
    rules = rules.filter((r) => r.category === category);
  }

  return rules;
}

// ─── Rule Evaluation ─────────────────────────────────────────────────

/**
 * Evaluate all matching rules against the trigger event and context.
 *
 * Priority resolution (per spec section 6.3):
 * 1. Deny rules win — any matching deny blocks the action
 * 2. Lowest priority number wins among allow rules
 * 3. More conditions = more specific = preferred
 */
export function evaluateRules(
  rules: AutomationRule[],
  triggerEvent: string,
  context: Record<string, unknown>,
): RuleEvaluationResult {
  // Filter rules by trigger event
  const applicableRules = rules.filter((r) => r.trigger.event === triggerEvent);

  // Sort by priority (lower = evaluated first)
  const sorted = [...applicableRules].sort((a, b) => a.priority - b.priority);

  const matchingAllow: AutomationRule[] = [];
  const matchingDeny: AutomationRule[] = [];

  for (const rule of sorted) {
    // All conditions must pass (AND logic)
    const allConditionsMet = rule.conditions.every((c) => evaluateCondition(c, context));

    if (!allConditionsMet) continue;

    if (rule.ruleType === 'deny') {
      matchingDeny.push(rule);
    } else {
      matchingAllow.push(rule);
    }
  }

  // Deny-first: if any deny matches, block
  if (matchingDeny.length > 0) {
    const denyingRule = matchingDeny[0];
    log.debug(
      { triggerEvent, deniedBy: denyingRule.id, totalRules: sorted.length },
      'Rule evaluation: denied',
    );
    return {
      allowed: false,
      deniedByRule: denyingRule,
      allMatchingRules: [...matchingDeny, ...matchingAllow],
      evaluation: {
        totalRulesEvaluated: sorted.length,
        allowMatches: matchingAllow.length,
        denyMatches: matchingDeny.length,
      },
    };
  }

  // No allow match = blocked by default
  if (matchingAllow.length === 0) {
    log.debug(
      { triggerEvent, totalRules: sorted.length },
      'Rule evaluation: no allow rule matched',
    );
    return {
      allowed: false,
      allMatchingRules: [],
      evaluation: {
        totalRulesEvaluated: sorted.length,
        allowMatches: 0,
        denyMatches: 0,
      },
    };
  }

  // Pick the best allow rule: lowest priority, then most conditions
  const bestAllow = matchingAllow.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return b.conditions.length - a.conditions.length;
  })[0];

  log.debug(
    { triggerEvent, allowedBy: bestAllow.id, totalRules: sorted.length },
    'Rule evaluation: allowed',
  );

  return {
    allowed: true,
    matchedAllowRule: bestAllow,
    allMatchingRules: matchingAllow,
    evaluation: {
      totalRulesEvaluated: sorted.length,
      allowMatches: matchingAllow.length,
      denyMatches: 0,
    },
  };
}

// ─── Idempotency Key Builder ─────────────────────────────────────────

/**
 * Build a deterministic idempotency key from the template and context.
 *
 * Templates use {{field}} placeholders that resolve against context.
 * e.g. "po_create:{{tenantId}}:{{supplierId}}:{{date}}"
 */
export function buildIdempotencyKey(
  actionType: ActionType,
  context: Record<string, unknown>,
  template?: string,
): string {
  if (!template) {
    // Fallback: action type + tenant + timestamp bucket (hourly)
    const tenantId = (context.tenantId as string) ?? 'unknown';
    const dateBucket = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
    return `${actionType}:${tenantId}:${dateBucket}`;
  }

  return template.replace(/\{\{(\w+)\}\}/g, (_match, field) => {
    if (field === 'date') {
      return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    }
    const value = context[field];
    return value !== undefined && value !== null ? String(value) : 'unknown';
  });
}
