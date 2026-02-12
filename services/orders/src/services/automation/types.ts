/**
 * Automation Engine — Central Type Definitions
 *
 * Types for the TCAAF (Trigger -> Condition -> Action -> Approval -> Fallback)
 * automation pipeline. Aligned with automation-policy.md specification.
 */

// ─── Action Types ────────────────────────────────────────────────────

export type ActionType =
  | 'create_purchase_order'
  | 'create_work_order'
  | 'create_transfer_order'
  | 'dispatch_email'
  | 'add_to_shopping_list'
  | 'transition_card'
  | 'resolve_exception'
  | 'escalate';

export type RuleCategory =
  | 'email_dispatch'
  | 'po_creation'
  | 'wo_creation'
  | 'to_creation'
  | 'shopping_list'
  | 'card_transition'
  | 'exception_handling';

// ─── Rule Schema ─────────────────────────────────────────────────────

export type RuleType = 'allow' | 'deny';

export interface AutomationTrigger {
  event: string;
  sourceEntity: string;
  filters?: Record<string, unknown>;
}

export type ConditionOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'not_in'
  | 'exists'
  | 'regex';

export interface AutomationCondition {
  field: string;
  operator: ConditionOperator;
  value: unknown;
  description?: string;
}

export interface AutomationAction {
  type: ActionType;
  params: Record<string, unknown>;
  idempotencyKeyTemplate: string;
  timeoutMs: number;
}

export interface ApprovalRequirement {
  required: boolean;
  strategy: 'auto_approve' | 'single_approver' | 'threshold_based' | 'always_manual';
  thresholds?: {
    autoApproveBelow: number;
    requireApprovalAbove: number;
    requireDualApprovalAbove: number;
  };
  approverRoles?: string[];
  timeoutHours?: number;
  escalateOnTimeout?: boolean;
}

export interface FallbackBehavior {
  onConditionFail: 'skip' | 'escalate' | 'queue_for_review';
  onActionFail: 'retry' | 'escalate' | 'compensate' | 'halt';
  maxRetries: number;
  retryDelayMs: number;
  retryBackoffMultiplier: number;
  compensationAction?: ActionType;
}

export interface AutomationRule {
  id: string;
  name: string;
  description: string;
  ruleType: RuleType;
  category: RuleCategory;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  action: AutomationAction;
  approval: ApprovalRequirement;
  fallback: FallbackBehavior;
  isActive: boolean;
  priority: number;
  tenantConfigurable: boolean;
}

// ─── Idempotency ─────────────────────────────────────────────────────

export interface IdempotencyRecord {
  key: string;
  actionType: ActionType;
  status: 'pending' | 'completed' | 'failed';
  result?: unknown;
  createdAt: string;
  expiresAt: string;
  tenantId: string;
}

/**
 * TTL in seconds for each action type's idempotency key.
 */
export const IDEMPOTENCY_TTL_MAP: Record<ActionType, number> = {
  create_purchase_order: 86_400,     // 24h
  create_work_order: 86_400,         // 24h
  create_transfer_order: 86_400,     // 24h
  dispatch_email: 259_200,           // 72h
  add_to_shopping_list: 86_400,      // 24h
  transition_card: 3_600,            // 1h
  resolve_exception: 86_400,         // 24h
  escalate: 3_600,                   // 1h
};

/** Short TTL for failed idempotency keys to allow quick retry. */
export const IDEMPOTENCY_FAILURE_TTL = 60;

// ─── Job Payload ─────────────────────────────────────────────────────

export interface AutomationJobPayload {
  actionType: ActionType;
  ruleId: string;
  tenantId: string;
  triggerEvent: string;
  idempotencyKey: string;
  context: Record<string, unknown>;
  approval: ApprovalRequirement;
  fallback: FallbackBehavior;
  actionParams: Record<string, unknown>;
}

// ─── Decision / Audit ────────────────────────────────────────────────

export type DecisionOutcome = 'allowed' | 'denied' | 'overridden' | 'escalated';

export interface AutomationDecision {
  tenantId: string;
  triggerEvent: string;
  entityType: string;
  entityId: string;
  decision: DecisionOutcome;
  matchedRuleId?: string;
  deniedByRule?: string;
  actionType?: ActionType;
  idempotencyKey?: string;
  context: Record<string, unknown>;
  timestamp: Date;
}

export interface AutomationAuditEntry {
  tenantId: string;
  action: string;
  entityType: string;
  entityId: string;
  automationRuleId?: string;
  decision: DecisionOutcome;
  deniedByRule?: string;
  context: Record<string, unknown>;
  userId?: string;
  timestamp: Date;
}

// ─── Tenant Limits ───────────────────────────────────────────────────

export interface TenantAutomationLimits {
  tenantId: string;
  maxAutoApprovePOAmount: number;           // G-01: $5,000
  maxAutoApprovePOAmountExpedited: number;  // G-02: $10,000
  maxAutoConsolidateAmount: number;         // G-03: $25,000
  maxPOsPerSupplierPerDay: number;          // G-04: 5
  maxDailyAutoCreatedPOValue: number;       // G-05: $50,000
  maxEmailDispatchPerHour: number;          // G-06: 50
  maxFollowUpPOsPerDay: number;            // G-07: 10
  dualApprovalThreshold: number;            // G-08: $15,000
  allowedEmailDomains: string[];            // O-01: Outbound email domain whitelist
}

export const DEFAULT_TENANT_LIMITS: Omit<TenantAutomationLimits, 'tenantId'> = {
  maxAutoApprovePOAmount: 5_000,
  maxAutoApprovePOAmountExpedited: 10_000,
  maxAutoConsolidateAmount: 25_000,
  maxPOsPerSupplierPerDay: 5,
  maxDailyAutoCreatedPOValue: 50_000,
  maxEmailDispatchPerHour: 50,
  maxFollowUpPOsPerDay: 10,
  dualApprovalThreshold: 15_000,
  allowedEmailDomains: [],  // Empty = no outbound emails allowed (must be configured per tenant)
};

// ─── Evaluation Results ──────────────────────────────────────────────

export interface RuleEvaluationResult {
  allowed: boolean;
  matchedAllowRule?: AutomationRule;
  deniedByRule?: AutomationRule;
  allMatchingRules: AutomationRule[];
  evaluation: {
    totalRulesEvaluated: number;
    allowMatches: number;
    denyMatches: number;
  };
}

export interface ActionExecutionResult {
  success: boolean;
  actionType: ActionType;
  result?: unknown;
  error?: string;
  wasReplay: boolean;
  durationMs: number;
}

// ─── Per-Action Context Types ────────────────────────────────────────

export interface PurchaseOrderContext {
  tenantId: string;
  cardId: string;
  loopId: string;
  partId: string;
  supplierId: string;
  facilityId: string;
  orderQuantity: number;
  totalAmount?: number;
  isExpedited?: boolean;
}

export interface WorkOrderContext {
  tenantId: string;
  cardId: string;
  loopId: string;
  facilityId: string;
  partId: string;
  orderQuantity: number;
}

export interface TransferOrderContext {
  tenantId: string;
  cardId: string;
  loopId: string;
  sourceFacilityId: string;
  destFacilityId: string;
  orderQuantity: number;
}

export interface EmailDispatchContext {
  tenantId: string;
  poId: string;
  supplierId: string;
  supplierEmail: string;
  totalAmount: number;
}

export interface CardTransitionContext {
  tenantId: string;
  cardId: string;
  loopId: string;
  fromStage: string;
  toStage: string;
  cycleNumber: number;
}

export interface ExceptionResolutionContext {
  tenantId: string;
  exceptionId: string;
  exceptionType: string;
  severity: string;
  resolutionType: string;
}

// ─── Guardrail Results ───────────────────────────────────────────────

export interface GuardrailCheckResult {
  passed: boolean;
  violations: GuardrailViolation[];
}

export interface GuardrailViolation {
  guardrailId: string;
  description: string;
  currentValue: number;
  threshold: number;
}

// ─── Security Validation ────────────────────────────────────────────

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Validate that a string is a well-formed UUID v4. */
export function isValidUUID(value: string): boolean {
  return UUID_V4_RE.test(value);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Basic email format validation (RFC 5321 simplified). */
export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value) && value.length <= 254;
}

/** Extract domain from an email address (lowercase). Returns undefined if invalid. */
export function extractEmailDomain(email: string): string | undefined {
  if (!isValidEmail(email)) return undefined;
  return email.split('@')[1]?.toLowerCase();
}
