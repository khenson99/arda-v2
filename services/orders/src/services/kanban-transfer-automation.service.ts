/**
 * Kanban-to-Transfer Automation Service
 *
 * Auto-creates a draft Transfer Order when a transfer-type kanban card
 * reaches the 'triggered' stage. After creating the TO it transitions
 * the card to 'ordered' via the centralized card-lifecycle service.
 *
 * Designed to be idempotent: if the card already has a linked TO the
 * endpoint returns the existing link without error.
 */

import { and, eq } from 'drizzle-orm';
import { db, schema, writeAuditEntry } from '@arda/db';
import { getEventBus } from '@arda/events';
import { config } from '@arda/config';
import { AppError } from '../middleware/error-handler.js';
import { getNextTONumber } from './order-number.service.js';
import { transitionTriggeredCardToOrdered } from './card-lifecycle.service.js';

const {
  kanbanCards,
  kanbanLoops,
  transferOrders,
  transferOrderLines,
} = schema;

// ─── Types ───────────────────────────────────────────────────────────

export interface AutoCreateTransferOrderInput {
  tenantId: string;
  cardId: string;
  userId?: string;
}

export interface AutoCreateTransferOrderResult {
  transferOrderId: string;
  toNumber: string;
  cardId: string;
  loopId: string;
}

// ─── Service ─────────────────────────────────────────────────────────

/**
 * Auto-create a draft Transfer Order from a triggered kanban card.
 *
 * 1. Validate card state (triggered, active, no duplicate link)
 * 2. Validate loop (transfer type, active, has sourceFacilityId)
 * 3. Insert TO + TO line + transition card → ordered (in a txn)
 * 4. Publish events outside the transaction
 */
export async function autoCreateTransferOrder(
  input: AutoCreateTransferOrderInput,
): Promise<AutoCreateTransferOrderResult> {
  const { tenantId, cardId, userId } = input;

  // ── 1. Fetch + validate the kanban card ────────────────────────────

  const [card] = await db
    .select({
      id: kanbanCards.id,
      tenantId: kanbanCards.tenantId,
      loopId: kanbanCards.loopId,
      currentStage: kanbanCards.currentStage,
      linkedTransferOrderId: kanbanCards.linkedTransferOrderId,
      isActive: kanbanCards.isActive,
      cardNumber: kanbanCards.cardNumber,
    })
    .from(kanbanCards)
    .where(and(eq(kanbanCards.id, cardId), eq(kanbanCards.tenantId, tenantId)))
    .limit(1);

  if (!card) {
    throw new AppError(404, `Kanban card ${cardId} not found`);
  }

  if (!card.isActive) {
    throw new AppError(400, `Kanban card ${cardId} is not active`);
  }

  if (card.currentStage !== 'triggered') {
    throw new AppError(
      400,
      `Kanban card ${cardId} must be in triggered stage (current: ${card.currentStage})`,
    );
  }

  // ── Duplicate guard — idempotent return ────────────────────────────
  if (card.linkedTransferOrderId) {
    // Already linked — fetch the existing TO number and return
    const [existingTO] = await db
      .select({ id: transferOrders.id, toNumber: transferOrders.toNumber })
      .from(transferOrders)
      .where(
        and(
          eq(transferOrders.id, card.linkedTransferOrderId),
          eq(transferOrders.tenantId, tenantId),
        ),
      )
      .limit(1);

    return {
      transferOrderId: card.linkedTransferOrderId,
      toNumber: existingTO?.toNumber ?? 'UNKNOWN',
      cardId,
      loopId: card.loopId,
    };
  }

  // ── 2. Fetch + validate the kanban loop ────────────────────────────

  const [loop] = await db
    .select({
      id: kanbanLoops.id,
      tenantId: kanbanLoops.tenantId,
      partId: kanbanLoops.partId,
      facilityId: kanbanLoops.facilityId,
      sourceFacilityId: kanbanLoops.sourceFacilityId,
      loopType: kanbanLoops.loopType,
      orderQuantity: kanbanLoops.orderQuantity,
      isActive: kanbanLoops.isActive,
    })
    .from(kanbanLoops)
    .where(
      and(eq(kanbanLoops.id, card.loopId), eq(kanbanLoops.tenantId, tenantId)),
    )
    .limit(1);

  if (!loop) {
    throw new AppError(404, `Kanban loop ${card.loopId} not found`);
  }

  if (!loop.isActive) {
    throw new AppError(400, `Kanban loop ${card.loopId} is not active`);
  }

  if (loop.loopType !== 'transfer') {
    throw new AppError(
      400,
      `Kanban loop ${card.loopId} is not a transfer loop (type: ${loop.loopType})`,
    );
  }

  if (!loop.sourceFacilityId) {
    throw new AppError(
      400,
      `Kanban loop ${card.loopId} does not have a source facility configured`,
    );
  }

  // ── 3. Create TO + line + transition card (atomic) ─────────────────

  let createdTOId: string;
  let toNumber: string;

  await db.transaction(async (tx) => {
    toNumber = await getNextTONumber(tenantId, tx);

    const [createdTO] = await tx
      .insert(transferOrders)
      .values({
        tenantId,
        toNumber,
        sourceFacilityId: loop.sourceFacilityId!,
        destinationFacilityId: loop.facilityId,
        status: 'draft',
        notes: `Auto-created from kanban card ${card.cardNumber} (loop ${loop.id})`,
        kanbanCardId: cardId,
        createdByUserId: userId ?? null,
      })
      .returning({ id: transferOrders.id });

    createdTOId = createdTO.id;

    await tx
      .insert(transferOrderLines)
      .values({
        tenantId,
        transferOrderId: createdTOId,
        partId: loop.partId,
        quantityRequested: loop.orderQuantity,
        quantityShipped: 0,
        quantityReceived: 0,
      });

    await transitionTriggeredCardToOrdered(tx, {
      tenantId,
      cardId,
      linkedTransferOrderId: createdTOId,
      notes: `Auto-created TO ${toNumber}`,
      userId,
    });

    await writeAuditEntry(tx, {
      tenantId,
      userId: userId ?? null,
      action: 'automation.to_created',
      entityType: 'transfer_order',
      entityId: createdTOId,
      previousState: null,
      newState: {
        status: 'draft',
        toNumber,
        kanbanCardId: cardId,
        loopId: loop.id,
      },
      metadata: { source: 'kanban_transfer_automation' },
    });
  });

  // ── 4. Publish events (best-effort, outside txn) ───────────────────

  try {
    const eventBus = getEventBus(config.REDIS_URL);
    await eventBus.publish({
      type: 'order.created',
      tenantId,
      orderType: 'transfer_order',
      orderId: createdTOId!,
      orderNumber: toNumber!,
      linkedCardIds: [cardId],
      timestamp: new Date().toISOString(),
    });
    await eventBus.publish({
      type: 'automation.to_created',
      tenantId,
      transferOrderId: createdTOId!,
      toNumber: toNumber!,
      source: 'automation',
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Event publishing is best-effort — log but don't fail
    console.error(
      '[kanban-transfer-automation] Failed to publish events for TO',
      toNumber!,
    );
  }

  return {
    transferOrderId: createdTOId!,
    toNumber: toNumber!,
    cardId,
    loopId: loop.id,
  };
}
