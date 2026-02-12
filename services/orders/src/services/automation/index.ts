/**
 * Automation Engine — Barrel Export
 *
 * Public API surface for the TCAAF automation subsystem.
 * Import everything automation-related from this module.
 */

// ─── Types ──────────────────────────────────────────────────────────
export type {
  ActionType,
  RuleCategory,
  RuleType,
  ConditionOperator,
  AutomationTrigger,
  AutomationCondition,
  AutomationAction,
  ApprovalRequirement,
  FallbackBehavior,
  AutomationRule,
  IdempotencyRecord,
  AutomationJobPayload,
  DecisionOutcome,
  AutomationDecision,
  AutomationAuditEntry,
  TenantAutomationLimits,
  RuleEvaluationResult,
  ActionExecutionResult,
  PurchaseOrderContext,
  WorkOrderContext,
  TransferOrderContext,
  EmailDispatchContext,
  CardTransitionContext,
  ExceptionResolutionContext,
  GuardrailCheckResult,
  GuardrailViolation,
} from './types.js';

export {
  IDEMPOTENCY_TTL_MAP,
  IDEMPOTENCY_FAILURE_TTL,
  DEFAULT_TENANT_LIMITS,
} from './types.js';

// ─── Orchestrator ───────────────────────────────────────────────────
export { AutomationOrchestrator } from './orchestrator.js';

// ─── Rule Evaluator ─────────────────────────────────────────────────
export {
  evaluateRules,
  buildIdempotencyKey,
  loadActiveRules,
} from './rule-evaluator.js';

// ─── Idempotency ────────────────────────────────────────────────────
export {
  IdempotencyManager,
  ConcurrentExecutionError,
} from './idempotency-manager.js';

// ─── Guardrails ─────────────────────────────────────────────────────
export {
  checkGuardrails,
  checkFinancialGuardrails,
  checkOutboundGuardrails,
  checkFollowUpPOGuardrail,
  checkConsolidationGuardrail,
  recordPOCreated,
  recordEmailDispatched,
  recordFollowUpPOCreated,
} from './guardrails.js';

// ─── Action Handlers ────────────────────────────────────────────────
export { dispatchAction } from './action-handlers.js';
export type { ActionHandlerResult } from './action-handlers.js';

// ─── Action Adapters ────────────────────────────────────────────────
export {
  EmailActionAdapter,
  ConsoleEmailBackend,
  EventBusEmailBackend,
  renderTemplate,
  URLHandoffAdapter,
  buildSignedUrl,
  verifySignedUrl,
  POCreationAdapter,
  ShoppingListAdapter,
  EventBusShoppingListPublisher,
  InMemoryShoppingListPersistence,
  buildGroupKey,
} from './adapters/index.js';
export type {
  EmailDeliveryBackend,
  EmailDeliveryResult,
  EmailTemplate,
  EmailAdapterResult,
  URLSignerOptions,
  POPersistence,
  POCreationRecord,
  POGuardrailChecker,
  POEventPublisher,
  POCreationAdapterResult,
  ShoppingListPersistence,
  ShoppingListItem,
  ShoppingListRecord,
  ShoppingListEventPublisher,
  ShoppingListAdapterResult,
} from './adapters/index.js';

// ─── Adapter-Level Types (from types.ts) ────────────────────────────
export type {
  ShoppingListContext,
  URLHandoffContext,
  URLHandoffResult,
  ActionAdapter,
  ActionAdapterResult,
} from './types.js';
