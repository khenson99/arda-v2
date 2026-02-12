/**
 * Automation Orchestrator
 *
 * Main TCAAF (Trigger -> Condition -> Action -> Approval -> Fallback)
 * pipeline coordinator. Ties together rule evaluation, idempotency,
 * guardrails, and action handlers into a single coherent flow.
 *
 * Each pipeline execution produces an AutomationDecision audit record
 * for full traceability.
 */

import { Redis } from 'ioredis';
import { db, schema } from '@arda/db';
import { createLogger, config } from '@arda/config';
import { getEventBus } from '@arda/events';
import { evaluateRules, buildIdempotencyKey, loadActiveRules } from './rule-evaluator.js';


import { IdempotencyManager, ConcurrentExecutionError } from './idempotency-manager.js';
import { checkGuardrails, recordPOCreated, recordEmailDispatched } from './guardrails.js';
import { dispatchAction } from './action-handlers.js';
import type {
  AutomationJobPayload,
  AutomationDecision,
  AutomationAuditEntry,
  ActionExecutionResult,
  GuardrailCheckResult,
  DecisionOutcome,
  TenantAutomationLimits,
} from './types.js';
import { DEFAULT_TENANT_LIMITS, isValidUUID } from './types.js';

const log = createLogger('automation:orchestrator');

const { auditLog } = schema;

// ─── Kill Switch ─────────────────────────────────────────────────────

/** Redis key for the global kill switch. */
const KILL_SWITCH_KEY = 'arda:automation:kill_switch';

// ─── Orchestrator Class ──────────────────────────────────────────────

export class AutomationOrchestrator {
  private redis: Redis;
  private idempotencyManager: IdempotencyManager;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl);
    this.idempotencyManager = new IdempotencyManager(redisUrl);
  }

  // ─── Main Pipeline ───────────────────────────────────────────────

  /**
   * Execute the full TCAAF pipeline for an automation job.
   *
   * Steps:
   * 1. Check kill switch
   * 2. Evaluate rules (Trigger + Condition)
   * 3. Check guardrails
   * 4. Check approval requirements
   * 5. Execute action with idempotency (Action)
   * 6. Record post-action counters
   * 7. Record audit decision
   *
   * @returns The execution result with replay detection
   */
  async executePipeline(
    job: AutomationJobPayload,
  ): Promise<ActionExecutionResult> {
    const startMs = Date.now();
    const {
      actionType,
      ruleId,
      tenantId,
      triggerEvent,
      idempotencyKey,
      context,
      approval,
      fallback,
      actionParams,
    } = job;

    log.info(
      { actionType, ruleId, tenantId, triggerEvent, idempotencyKey },
      'Starting TCAAF pipeline',
    );

    try {
      // ── Step 0: Tenant ID Validation ─────────────────────────
      if (!isValidUUID(tenantId)) {
        log.error(
          { tenantId, actionType, ruleId },
          'Invalid tenant ID format — rejecting automation job',
        );
        await this.emitSecurityEvent({
          type: 'security.automation.tenant_validation_failed',
          tenantId,
          actionType,
          ruleId,
          reason: 'Invalid tenant ID format',
          timestamp: new Date().toISOString(),
        });
        return {
          success: false,
          actionType,
          error: 'Invalid tenant ID format',
          wasReplay: false,
          durationMs: Date.now() - startMs,
        };
      }

      // ── Step 1: Kill Switch ────────────────────────────────────
      const isKilled = await this.isKillSwitchActive(tenantId);
      if (isKilled) {
        log.warn({ tenantId }, 'Kill switch is active, skipping automation');
        await this.emitSecurityEvent({
          type: 'security.automation.action_blocked',
          tenantId,
          actionType,
          ruleId,
          idempotencyKey,
          reason: 'kill_switch_active',
          timestamp: new Date().toISOString(),
        });
        await this.recordDecision(tenantId, triggerEvent, 'denied', {
          reason: 'kill_switch_active',
          ruleId,
          actionType,
          idempotencyKey,
          context,
        });
        return {
          success: false,
          actionType,
          error: 'Automation kill switch is active',
          wasReplay: false,
          durationMs: Date.now() - startMs,
        };
      }

      // ── Step 2: Rule Evaluation (Condition) ────────────────────
      const activeRules = loadActiveRules(tenantId);
      const ruleResult = evaluateRules(activeRules, triggerEvent, context);

      if (!ruleResult.allowed) {
        const deniedBy = ruleResult.deniedByRule?.id ?? 'default_deny';
        log.info(
          { actionType, tenantId, deniedBy },
          'Action denied by rule evaluation',
        );
        await this.emitSecurityEvent({
          type: 'security.automation.action_blocked',
          tenantId,
          actionType,
          ruleId,
          idempotencyKey,
          reason: `denied_by_rule:${deniedBy}`,
          details: { deniedByRule: deniedBy },
          timestamp: new Date().toISOString(),
        });
        await this.recordDecision(tenantId, triggerEvent, 'denied', {
          deniedByRule: deniedBy,
          ruleId,
          actionType,
          idempotencyKey,
          context,
        });
        return {
          success: false,
          actionType,
          error: `Denied by rule: ${deniedBy}`,
          wasReplay: false,
          durationMs: Date.now() - startMs,
        };
      }

      // ── Step 3: Guardrails ─────────────────────────────────────
      const limits: TenantAutomationLimits = {
        tenantId,
        ...DEFAULT_TENANT_LIMITS,
      };
      const guardrailResult = await checkGuardrails(
        this.redis,
        actionType,
        context,
        limits,
      );

      if (!guardrailResult.passed) {
        // Emit guardrail violation event for all violations (blocking or not)
        await this.emitSecurityEvent({
          type: 'security.automation.guardrail_violation',
          tenantId,
          actionType,
          violations: guardrailResult.violations.map((v) => ({
            guardrailId: v.guardrailId,
            description: v.description,
          })),
          blocked: guardrailResult.violations.some((v) => v.guardrailId !== 'G-08'),
          timestamp: new Date().toISOString(),
        });

        // G-08 violations don't block but require approval escalation
        const blockingViolations = guardrailResult.violations.filter(
          (v) => v.guardrailId !== 'G-08',
        );

        if (blockingViolations.length > 0) {
          log.warn(
            { actionType, tenantId, violations: blockingViolations },
            'Action blocked by guardrails',
          );
          await this.emitSecurityEvent({
            type: 'security.automation.action_blocked',
            tenantId,
            actionType,
            ruleId,
            idempotencyKey,
            reason: 'guardrail_violation',
            details: { violations: blockingViolations.map((v) => v.guardrailId) },
            timestamp: new Date().toISOString(),
          });
          await this.recordDecision(tenantId, triggerEvent, 'denied', {
            reason: 'guardrail_violation',
            violations: blockingViolations,
            ruleId,
            actionType,
            idempotencyKey,
            context,
          });
          return {
            success: false,
            actionType,
            error: `Guardrail violation: ${blockingViolations.map((v) => v.guardrailId).join(', ')}`,
            wasReplay: false,
            durationMs: Date.now() - startMs,
          };
        }
      }

      // ── Step 4: Approval Check ─────────────────────────────────
      if (approval.required && approval.strategy !== 'auto_approve') {
        const needsManualApproval = this.checkApprovalRequired(
          approval,
          context,
          guardrailResult,
        );

        if (needsManualApproval) {
          log.info(
            { actionType, tenantId, strategy: approval.strategy },
            'Manual approval required, escalating',
          );
          await this.emitSecurityEvent({
            type: 'security.automation.action_blocked',
            tenantId,
            actionType,
            ruleId,
            idempotencyKey,
            reason: 'manual_approval_required',
            details: { strategy: approval.strategy },
            timestamp: new Date().toISOString(),
          });
          await this.recordDecision(tenantId, triggerEvent, 'escalated', {
            reason: 'manual_approval_required',
            strategy: approval.strategy,
            ruleId,
            actionType,
            idempotencyKey,
            context,
          });
          return {
            success: false,
            actionType,
            error: 'Manual approval required',
            wasReplay: false,
            durationMs: Date.now() - startMs,
          };
        }
      }

      // ── Step 5: Execute Action with Idempotency ────────────────
      const { result: handlerResult, wasReplay } =
        await this.idempotencyManager.executeWithIdempotency(
          idempotencyKey,
          actionType,
          tenantId,
          async () => dispatchAction(actionType, { ...context, ...actionParams }),
        );

      if (!handlerResult.success) {
        log.error(
          { actionType, tenantId, error: handlerResult.error },
          'Action handler failed',
        );
        await this.emitSecurityEvent({
          type: 'security.automation.action_blocked',
          tenantId,
          actionType,
          ruleId,
          idempotencyKey,
          reason: 'action_failed',
          details: { error: handlerResult.error },
          timestamp: new Date().toISOString(),
        });
        await this.recordDecision(tenantId, triggerEvent, 'denied', {
          reason: 'action_failed',
          error: handlerResult.error,
          ruleId,
          actionType,
          idempotencyKey,
          context,
        });

        // Apply fallback behavior
        if (fallback.onActionFail === 'escalate') {
          await dispatchAction('escalate', {
            tenantId,
            reason: `Action ${actionType} failed: ${handlerResult.error}`,
            entityType: 'automation_job',
            entityId: idempotencyKey,
          });
        }

        return {
          success: false,
          actionType,
          error: handlerResult.error,
          result: handlerResult.data,
          wasReplay,
          durationMs: Date.now() - startMs,
        };
      }

      // ── Step 6: Post-Action Counter Updates ────────────────────
      if (!wasReplay) {
        await this.recordPostActionCounters(actionType, tenantId, context);
      }

      // ── Step 7: Record Audit Decision ──────────────────────────
      await this.recordDecision(tenantId, triggerEvent, 'allowed', {
        ruleId,
        actionType,
        idempotencyKey,
        wasReplay,
        result: handlerResult.data,
        context,
      });

      const durationMs = Date.now() - startMs;

      // Emit security event: action approved & executed
      await this.emitSecurityEvent({
        type: 'security.automation.action_approved',
        tenantId,
        actionType,
        ruleId,
        idempotencyKey,
        wasReplay,
        durationMs,
        timestamp: new Date().toISOString(),
      });

      log.info(
        { actionType, tenantId, wasReplay, durationMs },
        'TCAAF pipeline completed successfully',
      );

      return {
        success: true,
        actionType,
        result: handlerResult.data,
        wasReplay,
        durationMs,
      };
    } catch (err) {
      const durationMs = Date.now() - startMs;

      if (err instanceof ConcurrentExecutionError) {
        log.warn(
          { actionType, tenantId, key: err.key },
          'Concurrent execution detected',
        );
        return {
          success: false,
          actionType,
          error: err.message,
          wasReplay: false,
          durationMs,
        };
      }

      log.error(
        { actionType, tenantId, err, durationMs },
        'TCAAF pipeline failed with unexpected error',
      );

      await this.recordDecision(tenantId, triggerEvent, 'denied', {
        reason: 'unexpected_error',
        error: err instanceof Error ? err.message : String(err),
        ruleId,
        actionType,
        idempotencyKey,
        context,
      });

      throw err;
    }
  }

  // ─── Security Event Emission ────────────────────────────────────

  /**
   * Emit a security event to the EventBus (non-fatal).
   * Failures are logged but never break the pipeline.
   */
  private async emitSecurityEvent(event: Record<string, unknown>): Promise<void> {
    try {
      const eventBus = getEventBus(config.REDIS_URL);
      await eventBus.publish(event as any);
    } catch (err) {
      log.error({ err, eventType: event.type }, 'Failed to emit security event (non-fatal)');
    }
  }

  // ─── Kill Switch Management ──────────────────────────────────────

  /**
   * Check if the kill switch is active for a tenant (or globally).
   */
  async isKillSwitchActive(tenantId: string): Promise<boolean> {
    const globalKill = await this.redis.get(KILL_SWITCH_KEY);
    if (globalKill === 'active') return true;

    const tenantKill = await this.redis.get(`${KILL_SWITCH_KEY}:${tenantId}`);
    return tenantKill === 'active';
  }

  /**
   * Activate the kill switch. Can be global or per-tenant.
   */
  async activateKillSwitch(tenantId?: string): Promise<void> {
    const key = tenantId ? `${KILL_SWITCH_KEY}:${tenantId}` : KILL_SWITCH_KEY;
    await this.redis.set(key, 'active');
    log.warn({ tenantId: tenantId ?? 'global' }, 'Kill switch activated');
  }

  /**
   * Deactivate the kill switch.
   */
  async deactivateKillSwitch(tenantId?: string): Promise<void> {
    const key = tenantId ? `${KILL_SWITCH_KEY}:${tenantId}` : KILL_SWITCH_KEY;
    await this.redis.del(key);
    log.info({ tenantId: tenantId ?? 'global' }, 'Kill switch deactivated');
  }

  // ─── Approval Logic ──────────────────────────────────────────────

  /**
   * Determine if manual approval is required based on the approval
   * strategy and the current context.
   */
  private checkApprovalRequired(
    approval: AutomationJobPayload['approval'],
    context: Record<string, unknown>,
    guardrailResult: GuardrailCheckResult,
  ): boolean {
    switch (approval.strategy) {
      case 'auto_approve':
        return false;

      case 'always_manual':
        return true;

      case 'single_approver':
        return true;

      case 'threshold_based': {
        if (!approval.thresholds) return true;
        const amount = (context.totalAmount as number) ?? 0;

        // Auto-approve below the lower threshold
        if (amount < approval.thresholds.autoApproveBelow) return false;

        // Require approval above the upper threshold
        if (amount >= approval.thresholds.requireApprovalAbove) return true;

        // G-08 dual approval violations force manual review
        const hasDualApprovalViolation = guardrailResult.violations.some(
          (v) => v.guardrailId === 'G-08',
        );
        if (hasDualApprovalViolation) return true;

        return false;
      }

      default:
        return true;
    }
  }

  // ─── Post-Action Counters ────────────────────────────────────────

  /**
   * Increment guardrail counters after a successful action.
   */
  private async recordPostActionCounters(
    actionType: string,
    tenantId: string,
    context: Record<string, unknown>,
  ): Promise<void> {
    try {
      if (actionType === 'create_purchase_order') {
        await recordPOCreated(
          this.redis,
          tenantId,
          context.supplierId as string,
          (context.totalAmount as number) ?? 0,
        );
      }

      if (actionType === 'dispatch_email') {
        await recordEmailDispatched(
          this.redis,
          tenantId,
          context.poId as string,
          context.supplierId as string,
          context.supplierEmail as string,
        );
      }
    } catch (err) {
      // Counter failures should not break the pipeline
      log.error(
        { actionType, tenantId, err },
        'Failed to record post-action counters (non-fatal)',
      );
    }
  }

  // ─── Audit Decisions ─────────────────────────────────────────────

  /**
   * Record an automation decision in the audit log.
   */
  private async recordDecision(
    tenantId: string,
    triggerEvent: string,
    decision: DecisionOutcome,
    details: Record<string, unknown>,
  ): Promise<void> {
    try {
      await db
        .insert(auditLog)
        .values({
          tenantId,
          entityType: 'automation_decision',
          entityId: (details.idempotencyKey as string) ?? 'unknown',
          action: `automation:${decision}`,
          newState: JSON.stringify({
            triggerEvent,
            decision,
            ...details,
            timestamp: new Date().toISOString(),
          }),
        })
        .execute();
    } catch (err) {
      // Audit failures should not break the pipeline
      log.error({ tenantId, decision, err }, 'Failed to record audit decision');
    }
  }

  // ─── Idempotency Passthrough ─────────────────────────────────────

  /**
   * Clear an idempotency key to allow re-execution (for DLQ replay).
   */
  async clearIdempotencyKey(key: string): Promise<boolean> {
    return this.idempotencyManager.clearIdempotencyKey(key);
  }

  /**
   * Check the status of an idempotency key.
   */
  async checkIdempotencyKey(key: string) {
    return this.idempotencyManager.checkIdempotencyKey(key);
  }

  // ─── Health Check ────────────────────────────────────────────────

  /**
   * Check the health of the orchestrator's dependencies.
   */
  async healthCheck(): Promise<{
    redis: boolean;
    killSwitchGlobal: boolean;
  }> {
    try {
      const pong = await this.redis.ping();
      const killSwitch = await this.redis.get(KILL_SWITCH_KEY);
      return {
        redis: pong === 'PONG',
        killSwitchGlobal: killSwitch === 'active',
      };
    } catch {
      return { redis: false, killSwitchGlobal: false };
    }
  }

  // ─── Shutdown ────────────────────────────────────────────────────

  async shutdown(): Promise<void> {
    await this.idempotencyManager.shutdown();
    await this.redis.quit();
  }
}
