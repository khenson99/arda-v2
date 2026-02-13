/**
 * Work Order Orchestration Service (Ticket #74)
 *
 * Handles the full lifecycle of work orders in the production queue:
 * - Idempotent WO creation from triggered kanban cards
 * - Status transitions with hold/resume/cancel validation
 * - Expedite, split, and priority score refresh
 * - Production queue queries with pagination
 */

import { db, schema, writeAuditEntry } from '@arda/db';
import { eq, and, sql, desc, asc, inArray } from 'drizzle-orm';
import { getEventBus } from '@arda/events';
import { config, createLogger } from '@arda/config';
import type {
  OrderCreatedEvent,
  OrderStatusChangedEvent,
  ProductionHoldEvent,
  ProductionResumeEvent,
  ProductionExpediteEvent,
  ProductionSplitEvent,
} from '@arda/events';
import { WO_VALID_TRANSITIONS } from '@arda/shared-types';
import type { WOStatus, WOHoldReason } from '@arda/shared-types';
import { AppError } from '../middleware/error-handler.js';
import { getNextWONumber } from './order-number.service.js';
import { applyRoutingTemplate } from './routing-engine.service.js';

const log = createLogger('wo-orchestration');

const {
  workOrders,
  workOrderRoutings,
  kanbanCards,
  cardStageTransitions,
  productionQueueEntries,
} = schema;

// ─── Types ────────────────────────────────────────────────────────────

export interface CreateWOFromTriggerInput {
  tenantId: string;
  cardId: string;
  loopId: string;
  partId: string;
  facilityId: string;
  quantity: number;
  templateId?: string;
  userId?: string;
}

export interface CreateWOFromTriggerResult {
  workOrderId: string;
  woNumber: string;
  alreadyExisted: boolean;
  templateApplied?: string;
}

export interface TransitionWOStatusInput {
  tenantId: string;
  workOrderId: string;
  toStatus: WOStatus;
  holdReason?: WOHoldReason;
  holdNotes?: string;
  cancelReason?: string;
  userId?: string;
}

export interface TransitionWOStatusResult {
  workOrderId: string;
  fromStatus: string;
  toStatus: string;
  woNumber: string;
}

export interface ExpediteWOInput {
  tenantId: string;
  workOrderId: string;
  userId?: string;
}

export interface SplitWOInput {
  tenantId: string;
  workOrderId: string;
  splitQuantity: number;
  userId?: string;
}

export interface SplitWOResult {
  parentWorkOrderId: string;
  childWorkOrderId: string;
  childWoNumber: string;
  parentQuantity: number;
  childQuantity: number;
}

// ─── Priority Scoring ────────────────────────────────────────────────

/**
 * Compute a composite production priority score (0-100 scale).
 *
 * Weights:
 *   - triggeredAgeHours (0.30): How long the card has been waiting
 *   - daysOfSupply      (0.25): Urgency from low inventory
 *   - manualPriority    (0.20): Operator / planner override
 *   - dueDateProximity  (0.15): How close the scheduled start date is
 *   - capacityUtil      (0.10): Reserved for future capacity integration
 */
export function computeProductionPriorityScore(params: {
  triggeredAgeHours: number;
  daysOfSupply: number | null;
  manualPriority: number;
  scheduledStartDate: Date | null;
  isExpedited: boolean;
  now?: Date;
}): number {
  const { triggeredAgeHours, daysOfSupply, manualPriority, scheduledStartDate, isExpedited, now = new Date() } = params;

  // Expedited always gets max score
  if (isExpedited) return 100;

  // Age score: 0-100 based on hours waiting. Caps at 168h (7 days) = 100
  const ageScore = Math.min((triggeredAgeHours / 168) * 100, 100);

  // Supply score: lower days = higher urgency. Caps at 30 days = 0
  let supplyScore = 50; // default when unknown
  if (daysOfSupply !== null) {
    supplyScore = Math.max(0, Math.min(100, (1 - daysOfSupply / 30) * 100));
  }

  // Manual priority: 0-100 scale direct map
  const manualScore = Math.min(Math.max(manualPriority, 0), 100);

  // Due date proximity: days until scheduled start. Closer = higher score
  let dueDateScore = 50; // default when no date
  if (scheduledStartDate) {
    const daysUntilStart = (scheduledStartDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (daysUntilStart <= 0) {
      dueDateScore = 100; // overdue
    } else {
      dueDateScore = Math.max(0, Math.min(100, (1 - daysUntilStart / 14) * 100));
    }
  }

  // Capacity utilization: placeholder at 50
  const capacityScore = 50;

  const composite =
    ageScore * 0.30 +
    supplyScore * 0.25 +
    manualScore * 0.20 +
    dueDateScore * 0.15 +
    capacityScore * 0.10;

  return Math.round(composite * 100) / 100;
}

// ─── Create WO From Trigger ─────────────────────────────────────────

/**
 * Idempotent WO creation from a triggered production kanban card.
 *
 * Guards:
 * - If the card is already in 'ordered' stage with a linked WO, return existing.
 * - Otherwise create WO, transition card, apply template if provided.
 */
export async function createWorkOrderFromTrigger(
  input: CreateWOFromTriggerInput
): Promise<CreateWOFromTriggerResult> {
  const { tenantId, cardId, loopId, partId, facilityId, quantity, templateId, userId } = input;

  // Idempotency check: is there already a WO for this card?
  const [existingWO] = await db
    .select({ id: workOrders.id, woNumber: workOrders.woNumber })
    .from(workOrders)
    .where(and(eq(workOrders.kanbanCardId, cardId), eq(workOrders.tenantId, tenantId)))
    .execute();

  if (existingWO) {
    return {
      workOrderId: existingWO.id,
      woNumber: existingWO.woNumber,
      alreadyExisted: true,
    };
  }

  // Create WO + queue entry in transaction
  const result = await db.transaction(async (tx) => {
    const woNumber = await getNextWONumber(tenantId, tx);
    const now = new Date();

    // Insert work order
    const [wo] = await tx
      .insert(workOrders)
      .values({
        tenantId,
        woNumber,
        partId,
        facilityId,
        status: 'draft',
        quantityToProduce: quantity,
        kanbanCardId: cardId,
        createdByUserId: userId || null,
      })
      .returning({ id: workOrders.id })
      .execute();

    // Create production queue entry
    await tx
      .insert(productionQueueEntries)
      .values({
        tenantId,
        workOrderId: wo.id,
        cardId,
        loopId,
        partId,
        facilityId,
        status: 'pending',
        manualPriority: 0,
        enteredQueueAt: now,
      })
      .execute();

    const [cardState] = await tx
      .select({
        currentStage: kanbanCards.currentStage,
        completedCycles: kanbanCards.completedCycles,
      })
      .from(kanbanCards)
      .where(and(eq(kanbanCards.id, cardId), eq(kanbanCards.tenantId, tenantId)))
      .limit(1)
      .execute();

    if (!cardState) {
      throw new AppError(404, `Kanban card ${cardId} not found`);
    }

    // Transition the kanban card to 'ordered'
    await tx
      .update(kanbanCards)
      .set({ currentStage: 'ordered', updatedAt: now })
      .where(and(eq(kanbanCards.id, cardId), eq(kanbanCards.tenantId, tenantId)))
      .execute();

    // Record card stage transition
    await tx.insert(cardStageTransitions).values({
      tenantId,
      cardId,
      loopId,
      cycleNumber: cardState.completedCycles + 1,
      fromStage: cardState.currentStage,
      toStage: 'ordered',
      transitionedAt: now,
      transitionedByUserId: userId || null,
      method: 'system',
      notes: 'Auto-transition during work order creation',
      metadata: { source: 'wo_orchestration' },
    }).execute();

    // Audit
    await writeAuditEntry(tx, {
      tenantId,
      userId: userId || null,
      action: 'work_order.created_from_trigger',
      entityType: 'work_order',
      entityId: wo.id,
      previousState: null,
      newState: { woNumber, partId, facilityId, quantity, cardId, loopId },
      metadata: {
        source: 'wo_orchestration',
        ...(!userId ? { systemActor: 'wo_orchestration' } : {}),
      },
      timestamp: now,
    });

    return { workOrderId: wo.id, woNumber };
  });

  // Apply routing template if provided (outside transaction -- its own transaction)
  let templateApplied: string | undefined;
  if (templateId) {
    try {
      const templateResult = await applyRoutingTemplate({
        tenantId,
        workOrderId: result.workOrderId,
        templateId,
        userId,
      });
      templateApplied = templateResult.templateName;
    } catch (err) {
      log.warn({ err, workOrderId: result.workOrderId, templateId }, 'Failed to auto-apply routing template');
    }
  }

  // Emit event
  try {
    const eventBus = getEventBus(config.REDIS_URL);
    await eventBus.publish({
      type: 'order.created',
      tenantId,
      orderType: 'work_order',
      orderId: result.workOrderId,
      orderNumber: result.woNumber,
      linkedCardIds: [cardId],
      timestamp: new Date().toISOString(),
    } satisfies OrderCreatedEvent);
  } catch (err) {
    log.error({ err }, 'Failed to emit order.created event');
  }

  return {
    ...result,
    alreadyExisted: false,
    templateApplied,
  };
}

// ─── Status Transition ──────────────────────────────────────────────

export async function transitionWorkOrderStatus(
  input: TransitionWOStatusInput
): Promise<TransitionWOStatusResult> {
  const { tenantId, workOrderId, toStatus, holdReason, holdNotes, cancelReason, userId } = input;

  const [wo] = await db
    .select({
      id: workOrders.id,
      status: workOrders.status,
      woNumber: workOrders.woNumber,
    })
    .from(workOrders)
    .where(and(eq(workOrders.id, workOrderId), eq(workOrders.tenantId, tenantId)))
    .execute();

  if (!wo) {
    throw new AppError(404, `Work order ${workOrderId} not found`);
  }

  const fromStatus = wo.status;

  // Validate transition
  if (!WO_VALID_TRANSITIONS[fromStatus]?.includes(toStatus)) {
    throw new AppError(400, `Cannot transition work order from ${fromStatus} to ${toStatus}`);
  }

  // Hold requires a reason
  if (toStatus === 'on_hold' && !holdReason) {
    throw new AppError(400, 'holdReason is required when placing a work order on hold');
  }

  // Cancel requires a reason
  if (toStatus === 'cancelled' && !cancelReason) {
    throw new AppError(400, 'cancelReason is required when cancelling a work order');
  }

  const now = new Date();
  const updateValues: Record<string, unknown> = {
    status: toStatus,
    updatedAt: now,
  };

  if (toStatus === 'in_progress' && fromStatus !== 'on_hold') {
    updateValues.actualStartDate = now;
  }
  if (toStatus === 'completed') {
    updateValues.actualEndDate = now;
  }
  if (toStatus === 'on_hold') {
    updateValues.holdReason = holdReason;
    updateValues.holdNotes = holdNotes || null;
  }
  if (toStatus === 'in_progress' && fromStatus === 'on_hold') {
    // Resuming from hold -- clear hold fields
    updateValues.holdReason = null;
    updateValues.holdNotes = null;
  }
  if (toStatus === 'cancelled') {
    updateValues.cancelReason = cancelReason;
  }

  // Update queue entry status
  const queueStatusMap: Record<string, string> = {
    draft: 'pending',
    scheduled: 'pending',
    in_progress: 'active',
    on_hold: 'on_hold',
    completed: 'completed',
    cancelled: 'cancelled',
  };

  const queueStatus = queueStatusMap[toStatus] || 'pending';
  const queueUpdate: Record<string, unknown> = { status: queueStatus, updatedAt: now };
  if (toStatus === 'in_progress' && fromStatus !== 'on_hold') {
    queueUpdate.startedAt = now;
  }
  if (toStatus === 'completed') {
    queueUpdate.completedAt = now;
  }

  // Wrap mutation + audit in same transaction
  await db.transaction(async (tx) => {
    await tx
      .update(workOrders)
      .set(updateValues)
      .where(and(eq(workOrders.id, workOrderId), eq(workOrders.tenantId, tenantId)))
      .execute();

    await tx
      .update(productionQueueEntries)
      .set(queueUpdate)
      .where(and(eq(productionQueueEntries.workOrderId, workOrderId), eq(productionQueueEntries.tenantId, tenantId)))
      .execute();

    // Determine the specific action name for hold/resume lifecycle events
    let auditAction = 'work_order.status_changed';
    if (toStatus === 'on_hold') auditAction = 'work_order.hold';
    if (toStatus === 'in_progress' && fromStatus === 'on_hold') auditAction = 'work_order.resume';

    await writeAuditEntry(tx, {
      tenantId,
      userId: userId || null,
      action: auditAction,
      entityType: 'work_order',
      entityId: workOrderId,
      previousState: { status: fromStatus },
      newState: { status: toStatus, holdReason, cancelReason },
      metadata: {
        workOrderNumber: wo.woNumber,
        source: 'wo_orchestration',
        ...(!userId ? { systemActor: 'wo_orchestration' } : {}),
      },
    });
  });

  // Emit events
  try {
    const eventBus = getEventBus(config.REDIS_URL);

    await eventBus.publish({
      type: 'order.status_changed',
      tenantId,
      orderType: 'work_order',
      orderId: workOrderId,
      orderNumber: wo.woNumber,
      fromStatus,
      toStatus,
      timestamp: now.toISOString(),
    } satisfies OrderStatusChangedEvent);

    if (toStatus === 'on_hold') {
      await eventBus.publish({
        type: 'production.hold',
        tenantId,
        workOrderId,
        workOrderNumber: wo.woNumber,
        holdReason: holdReason!,
        holdNotes,
        userId,
        timestamp: now.toISOString(),
      } satisfies ProductionHoldEvent);
    }

    if (toStatus === 'in_progress' && fromStatus === 'on_hold') {
      await eventBus.publish({
        type: 'production.resume',
        tenantId,
        workOrderId,
        workOrderNumber: wo.woNumber,
        userId,
        timestamp: now.toISOString(),
      } satisfies ProductionResumeEvent);
    }
  } catch (err) {
    log.error({ err }, 'Failed to emit WO status event');
  }

  return {
    workOrderId,
    fromStatus,
    toStatus,
    woNumber: wo.woNumber,
  };
}

// ─── Expedite ───────────────────────────────────────────────────────

export async function expediteWorkOrder(input: ExpediteWOInput): Promise<void> {
  const { tenantId, workOrderId, userId } = input;

  const [wo] = await db
    .select({ id: workOrders.id, woNumber: workOrders.woNumber, priority: workOrders.priority, status: workOrders.status })
    .from(workOrders)
    .where(and(eq(workOrders.id, workOrderId), eq(workOrders.tenantId, tenantId)))
    .execute();

  if (!wo) throw new AppError(404, `Work order ${workOrderId} not found`);

  if (wo.status === 'completed' || wo.status === 'cancelled') {
    throw new AppError(400, `Cannot expedite a ${wo.status} work order`);
  }

  const now = new Date();
  const previousPriority = wo.priority;

  await db.transaction(async (tx) => {
    await tx
      .update(workOrders)
      .set({ priority: 100, isExpedited: true, updatedAt: now })
      .where(and(eq(workOrders.id, workOrderId), eq(workOrders.tenantId, tenantId)))
      .execute();

    await tx
      .update(productionQueueEntries)
      .set({ isExpedited: true, priorityScore: '100.0000', updatedAt: now })
      .where(and(eq(productionQueueEntries.workOrderId, workOrderId), eq(productionQueueEntries.tenantId, tenantId)))
      .execute();

    await writeAuditEntry(tx, {
      tenantId,
      userId: userId || null,
      action: 'work_order.expedite',
      entityType: 'work_order',
      entityId: workOrderId,
      previousState: { priority: previousPriority, isExpedited: false },
      newState: { priority: 100, isExpedited: true },
      metadata: {
        workOrderNumber: wo.woNumber,
        source: 'wo_orchestration',
        ...(!userId ? { systemActor: 'wo_orchestration' } : {}),
      },
    });
  });

  try {
    const eventBus = getEventBus(config.REDIS_URL);
    await eventBus.publish({
      type: 'production.expedite',
      tenantId,
      workOrderId,
      workOrderNumber: wo.woNumber,
      previousPriority,
      userId,
      timestamp: now.toISOString(),
    } satisfies ProductionExpediteEvent);
  } catch (err) {
    log.error({ err }, 'Failed to emit expedite event');
  }
}

// ─── Split ──────────────────────────────────────────────────────────

export async function splitWorkOrder(input: SplitWOInput): Promise<SplitWOResult> {
  const { tenantId, workOrderId, splitQuantity, userId } = input;

  const [wo] = await db
    .select()
    .from(workOrders)
    .where(and(eq(workOrders.id, workOrderId), eq(workOrders.tenantId, tenantId)))
    .execute();

  if (!wo) throw new AppError(404, `Work order ${workOrderId} not found`);

  if (wo.status !== 'draft' && wo.status !== 'scheduled' && wo.status !== 'in_progress') {
    throw new AppError(400, `Cannot split a ${wo.status} work order`);
  }

  const remainingQuantity = wo.quantityToProduce - wo.quantityProduced;
  if (splitQuantity <= 0 || splitQuantity >= remainingQuantity) {
    throw new AppError(400, `Split quantity must be between 1 and ${remainingQuantity - 1}`);
  }

  const result = await db.transaction(async (tx) => {
    const childWoNumber = await getNextWONumber(tenantId, tx);
    const now = new Date();
    const parentNewQuantity = wo.quantityToProduce - splitQuantity;

    // Reduce parent quantity
    await tx
      .update(workOrders)
      .set({ quantityToProduce: parentNewQuantity, updatedAt: now })
      .where(and(eq(workOrders.id, workOrderId), eq(workOrders.tenantId, tenantId)))
      .execute();

    // Create child WO
    const [child] = await tx
      .insert(workOrders)
      .values({
        tenantId,
        woNumber: childWoNumber,
        partId: wo.partId,
        facilityId: wo.facilityId,
        status: wo.status, // inherit parent status
        quantityToProduce: splitQuantity,
        priority: wo.priority,
        isExpedited: wo.isExpedited,
        parentWorkOrderId: workOrderId,
        routingTemplateId: wo.routingTemplateId,
        kanbanCardId: wo.kanbanCardId,
        scheduledStartDate: wo.scheduledStartDate,
        scheduledEndDate: wo.scheduledEndDate,
        notes: `Split from ${wo.woNumber}`,
        createdByUserId: userId || null,
      })
      .returning({ id: workOrders.id })
      .execute();

    // Copy routing steps to child
    const parentSteps = await tx
      .select()
      .from(workOrderRoutings)
      .where(and(eq(workOrderRoutings.workOrderId, workOrderId), eq(workOrderRoutings.tenantId, tenantId)))
      .orderBy(asc(workOrderRoutings.stepNumber))
      .execute();

    for (const step of parentSteps) {
      await tx
        .insert(workOrderRoutings)
        .values({
          tenantId,
          workOrderId: child.id,
          workCenterId: step.workCenterId,
          stepNumber: step.stepNumber,
          operationName: step.operationName,
          status: 'pending', // child always starts fresh
          estimatedMinutes: step.estimatedMinutes,
        })
        .execute();
    }

    // Create queue entry for child
    await tx
      .insert(productionQueueEntries)
      .values({
        tenantId,
        workOrderId: child.id,
        cardId: wo.kanbanCardId,
        partId: wo.partId,
        facilityId: wo.facilityId,
        status: wo.status === 'in_progress' ? 'active' : 'pending',
        manualPriority: wo.priority,
        isExpedited: wo.isExpedited,
        totalSteps: parentSteps.length,
        completedSteps: 0,
        enteredQueueAt: now,
      })
      .execute();

    // Audit
    await writeAuditEntry(tx, {
      tenantId,
      userId: userId || null,
      action: 'work_order.split',
      entityType: 'work_order',
      entityId: workOrderId,
      previousState: { quantityToProduce: wo.quantityToProduce },
      newState: { parentQuantity: parentNewQuantity, childId: child.id, childQuantity: splitQuantity },
      metadata: {
        parentWoNumber: wo.woNumber,
        childWoNumber,
        source: 'wo_orchestration',
        ...(!userId ? { systemActor: 'wo_orchestration' } : {}),
      },
    });

    return {
      parentWorkOrderId: workOrderId,
      childWorkOrderId: child.id,
      childWoNumber,
      parentQuantity: parentNewQuantity,
      childQuantity: splitQuantity,
    };
  });

  // Emit event
  try {
    const eventBus = getEventBus(config.REDIS_URL);
    await eventBus.publish({
      type: 'production.split',
      tenantId,
      parentWorkOrderId: workOrderId,
      childWorkOrderId: result.childWorkOrderId,
      parentQuantity: result.parentQuantity,
      childQuantity: result.childQuantity,
      timestamp: new Date().toISOString(),
    } satisfies ProductionSplitEvent);
  } catch (err) {
    log.error({ err }, 'Failed to emit split event');
  }

  return result;
}

// ─── Queue Queries ──────────────────────────────────────────────────

export async function getProductionQueue(
  tenantId: string,
  options: { facilityId?: string; status?: string; page?: number; pageSize?: number } = {}
): Promise<{ items: Array<typeof productionQueueEntries.$inferSelect & { woNumber: string }>; total: number }> {
  const page = options.page || 1;
  const pageSize = Math.min(options.pageSize || 50, 200);
  const offset = (page - 1) * pageSize;

  // Build conditions
  const conditions = [eq(productionQueueEntries.tenantId, tenantId)];
  if (options.facilityId) {
    conditions.push(eq(productionQueueEntries.facilityId, options.facilityId));
  }
  if (options.status) {
    conditions.push(eq(productionQueueEntries.status, options.status));
  }

  const whereClause = and(...conditions);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(productionQueueEntries)
    .where(whereClause!)
    .execute();

  const items = await db
    .select({
      id: productionQueueEntries.id,
      tenantId: productionQueueEntries.tenantId,
      workOrderId: productionQueueEntries.workOrderId,
      cardId: productionQueueEntries.cardId,
      loopId: productionQueueEntries.loopId,
      partId: productionQueueEntries.partId,
      facilityId: productionQueueEntries.facilityId,
      priorityScore: productionQueueEntries.priorityScore,
      manualPriority: productionQueueEntries.manualPriority,
      isExpedited: productionQueueEntries.isExpedited,
      totalSteps: productionQueueEntries.totalSteps,
      completedSteps: productionQueueEntries.completedSteps,
      status: productionQueueEntries.status,
      enteredQueueAt: productionQueueEntries.enteredQueueAt,
      startedAt: productionQueueEntries.startedAt,
      completedAt: productionQueueEntries.completedAt,
      createdAt: productionQueueEntries.createdAt,
      updatedAt: productionQueueEntries.updatedAt,
      woNumber: workOrders.woNumber,
    })
    .from(productionQueueEntries)
    .innerJoin(workOrders, eq(productionQueueEntries.workOrderId, workOrders.id))
    .where(whereClause!)
    .orderBy(desc(productionQueueEntries.priorityScore))
    .limit(pageSize)
    .offset(offset)
    .execute();

  return { items, total: countResult.count };
}

// ─── Refresh Priority Scores ────────────────────────────────────────

export async function refreshProductionQueueScores(
  tenantId: string,
  facilityId?: string
): Promise<{ updated: number }> {
  const conditions = [
    eq(productionQueueEntries.tenantId, tenantId),
    inArray(productionQueueEntries.status, ['pending', 'active']),
  ];
  if (facilityId) {
    conditions.push(eq(productionQueueEntries.facilityId, facilityId));
  }

  const entries = await db
    .select({
      id: productionQueueEntries.id,
      workOrderId: productionQueueEntries.workOrderId,
      enteredQueueAt: productionQueueEntries.enteredQueueAt,
      manualPriority: productionQueueEntries.manualPriority,
      isExpedited: productionQueueEntries.isExpedited,
    })
    .from(productionQueueEntries)
    .where(and(...conditions))
    .execute();

  if (entries.length === 0) return { updated: 0 };

  // Fetch WO scheduled dates for due date scoring
  const woIds = entries.map((e) => e.workOrderId);
  const wos = await db
    .select({
      id: workOrders.id,
      scheduledStartDate: workOrders.scheduledStartDate,
    })
    .from(workOrders)
    .where(inArray(workOrders.id, woIds))
    .execute();

  const woMap = new Map(wos.map((w) => [w.id, w]));
  const now = new Date();
  let updated = 0;

  for (const entry of entries) {
    const wo = woMap.get(entry.workOrderId);
    const triggeredAgeHours = (now.getTime() - new Date(entry.enteredQueueAt).getTime()) / (1000 * 60 * 60);

    const score = computeProductionPriorityScore({
      triggeredAgeHours,
      daysOfSupply: null, // would need inventory integration
      manualPriority: entry.manualPriority,
      scheduledStartDate: wo?.scheduledStartDate ? new Date(wo.scheduledStartDate) : null,
      isExpedited: entry.isExpedited,
      now,
    });

    await db
      .update(productionQueueEntries)
      .set({ priorityScore: score.toFixed(4), updatedAt: now })
      .where(eq(productionQueueEntries.id, entry.id))
      .execute();

    updated++;
  }

  return { updated };
}
