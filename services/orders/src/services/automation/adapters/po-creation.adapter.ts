/**
 * PO Creation Adapter
 *
 * Wraps purchase-order creation through the normalized ActionAdapter
 * interface. Integrates financial guardrails, records counters for
 * rate-limit tracking, and emits domain events on success.
 */

import { createLogger } from '@arda/config';
import type {
  ActionAdapter,
  ActionAdapterResult,
  PurchaseOrderContext,
  TenantAutomationLimits,
} from '../types.js';

const log = createLogger('automation:adapter:po-creation');

// ─── Persistence Interface ──────────────────────────────────────────

/**
 * Thin abstraction over DB operations so the adapter is testable
 * without real DB/event-bus dependencies.
 */
export interface POPersistence {
  /** Create the PO + PO line in a single transaction. */
  createPurchaseOrder(ctx: PurchaseOrderContext): Promise<POCreationRecord>;
  /** Insert an audit log entry. */
  writeAuditLog(entry: {
    tenantId: string;
    entityType: string;
    entityId: string;
    action: string;
    newState: string;
  }): Promise<void>;
}

export interface POCreationRecord {
  id: string;
  poNumber: string;
}

/**
 * Thin abstraction over guardrail checks.
 */
export interface POGuardrailChecker {
  checkFinancial(
    context: PurchaseOrderContext,
    limits?: TenantAutomationLimits,
  ): Promise<{ passed: boolean; violations: Array<{ guardrailId: string; description: string }> }>;
  /** Record counters after successful PO creation (G-04, G-05). */
  recordPOCreated(tenantId: string, supplierId: string, amount: number): Promise<void>;
}

/**
 * Thin abstraction over event publishing.
 */
export interface POEventPublisher {
  publishPOCreated(event: {
    tenantId: string;
    purchaseOrderId: string;
    poNumber: string;
  }): Promise<void>;
}

// ─── Adapter Result ─────────────────────────────────────────────────

export interface POCreationAdapterResult {
  purchaseOrderId: string;
  poNumber: string;
  guardrailViolations: Array<{ guardrailId: string; description: string }>;
}

// ─── PO Creation Adapter ────────────────────────────────────────────

export class POCreationAdapter
  implements ActionAdapter<PurchaseOrderContext, POCreationAdapterResult>
{
  readonly name = 'po_creation';

  constructor(
    private persistence: POPersistence,
    private guardrails: POGuardrailChecker,
    private events: POEventPublisher,
  ) {}

  async execute(
    context: PurchaseOrderContext,
  ): Promise<ActionAdapterResult<POCreationAdapterResult>> {
    try {
      // ── Step 1: Run financial guardrails ──
      const guardrailResult = await this.guardrails.checkFinancial(context);

      // Non-blocking violations (G-08 dual-approval) are informational.
      // Blocking violations (G-01, G-02, G-04, G-05) prevent execution.
      const blockingViolations = guardrailResult.violations.filter(
        (v) => v.guardrailId !== 'G-08',
      );

      if (blockingViolations.length > 0) {
        log.warn(
          { tenantId: context.tenantId, violations: blockingViolations },
          'PO creation blocked by financial guardrails',
        );
        return {
          success: false,
          error: `Guardrail violations: ${blockingViolations.map((v) => v.guardrailId).join(', ')}`,
          data: {
            purchaseOrderId: '',
            poNumber: '',
            guardrailViolations: guardrailResult.violations,
          },
          retryable: false,
        };
      }

      // ── Step 2: Create the PO ──
      const record = await this.persistence.createPurchaseOrder(context);

      // ── Step 3: Audit log ──
      await this.persistence.writeAuditLog({
        tenantId: context.tenantId,
        entityType: 'purchase_order',
        entityId: record.id,
        action: 'automation_created',
        newState: JSON.stringify({
          poNumber: record.poNumber,
          supplierId: context.supplierId,
          amount: context.totalAmount,
          isExpedited: context.isExpedited ?? false,
          source: 'automation_adapter',
        }),
      });

      // ── Step 4: Increment guardrail counters ──
      await this.guardrails.recordPOCreated(
        context.tenantId,
        context.supplierId,
        context.totalAmount ?? 0,
      );

      // ── Step 5: Emit domain event ──
      await this.events.publishPOCreated({
        tenantId: context.tenantId,
        purchaseOrderId: record.id,
        poNumber: record.poNumber,
      });

      log.info(
        { poId: record.id, poNumber: record.poNumber },
        'PO created via adapter',
      );

      return {
        success: true,
        data: {
          purchaseOrderId: record.id,
          poNumber: record.poNumber,
          guardrailViolations: guardrailResult.violations,
        },
        retryable: false,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error({ err, context }, 'PO creation adapter failed');
      return {
        success: false,
        error: message,
        retryable: true,
      };
    }
  }
}
