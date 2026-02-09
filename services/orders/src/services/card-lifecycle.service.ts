import { and, eq } from 'drizzle-orm';
import { db, schema } from '@arda/db';
import { AppError } from '../middleware/error-handler.js';

const { kanbanCards, cardStageTransitions } = schema;

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface TransitionTriggeredCardToOrderedInput {
  tenantId: string;
  cardId: string;
  linkedPurchaseOrderId?: string;
  linkedWorkOrderId?: string;
  linkedTransferOrderId?: string;
  notes?: string;
  userId?: string;
}

export interface TransitionTriggeredCardToOrderedResult {
  cardId: string;
  loopId: string;
}

/**
 * Centralized lifecycle transition for queue-processing flows:
 * triggered -> ordered
 */
export async function transitionTriggeredCardToOrdered(
  tx: DbTransaction,
  input: TransitionTriggeredCardToOrderedInput
): Promise<TransitionTriggeredCardToOrderedResult> {
  const {
    tenantId,
    cardId,
    linkedPurchaseOrderId,
    linkedWorkOrderId,
    linkedTransferOrderId,
    notes,
    userId,
  } = input;

  const providedLinks = [
    linkedPurchaseOrderId,
    linkedWorkOrderId,
    linkedTransferOrderId,
  ].filter(Boolean);
  if (providedLinks.length !== 1) {
    throw new AppError(
      400,
      'Exactly one linked order ID must be provided for a card transition'
    );
  }

  const [existingCard] = await tx
    .select({
      id: kanbanCards.id,
      tenantId: kanbanCards.tenantId,
      loopId: kanbanCards.loopId,
      currentStage: kanbanCards.currentStage,
      completedCycles: kanbanCards.completedCycles,
      isActive: kanbanCards.isActive,
    })
    .from(kanbanCards)
    .where(and(eq(kanbanCards.id, cardId), eq(kanbanCards.tenantId, tenantId)))
    .limit(1)
    .execute();

  if (!existingCard) {
    throw new AppError(404, `Kanban card ${cardId} not found`);
  }

  if (!existingCard.isActive) {
    throw new AppError(400, `Kanban card ${cardId} is not active`);
  }

  if (existingCard.currentStage !== 'triggered') {
    throw new AppError(
      400,
      `Card ${cardId} must be in triggered stage to transition to ordered`
    );
  }

  const now = new Date();

  await tx
    .update(kanbanCards)
    .set({
      currentStage: 'ordered',
      currentStageEnteredAt: now,
      linkedPurchaseOrderId: linkedPurchaseOrderId ?? null,
      linkedWorkOrderId: linkedWorkOrderId ?? null,
      linkedTransferOrderId: linkedTransferOrderId ?? null,
      updatedAt: now,
    })
    .where(and(eq(kanbanCards.id, cardId), eq(kanbanCards.tenantId, tenantId)))
    .execute();

  await tx
    .insert(cardStageTransitions)
    .values({
      tenantId,
      cardId,
      loopId: existingCard.loopId,
      cycleNumber: (existingCard.completedCycles || 0) + 1,
      fromStage: 'triggered',
      toStage: 'ordered',
      method: 'system',
      transitionedByUserId: userId,
      notes,
      transitionedAt: now,
    })
    .execute();

  return {
    cardId,
    loopId: existingCard.loopId,
  };
}
