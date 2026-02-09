import { Router } from 'express';
import { z } from 'zod';
import { eq, and, sql, inArray, desc, asc } from 'drizzle-orm';
import { db, schema } from '@arda/db';
import { getEventBus } from '@arda/events';
import { config } from '@arda/config';
import type { AuthRequest } from '@arda/auth-utils';
import { AppError } from '../middleware/error-handler.js';
import {
  getNextPONumber,
  getNextWONumber,
  getNextTONumber,
} from '../services/order-number.service.js';
import { transitionTriggeredCardToOrdered } from '../services/card-lifecycle.service.js';

export const orderQueueRouter = Router();

const {
  kanbanCards,
  kanbanLoops,
  auditLog,
  purchaseOrders,
  purchaseOrderLines,
  workOrders,
  workOrderRoutings,
  transferOrders,
  transferOrderLines,
} = schema;

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

interface RequestAuditContext {
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
}

function getRequestAuditContext(req: AuthRequest): RequestAuditContext {
  const forwarded = req.headers['x-forwarded-for'];
  const forwardedIp = Array.isArray(forwarded)
    ? forwarded[0]
    : forwarded?.split(',')[0]?.trim();

  const rawIp = forwardedIp || req.socket.remoteAddress || undefined;
  const userAgentHeader = req.headers['user-agent'];
  const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader;

  return {
    userId: req.user?.sub,
    ipAddress: rawIp?.slice(0, 45),
    userAgent,
  };
}

async function writeOrderQueueAudit(
  tx: DbTransaction,
  input: {
    tenantId: string;
    action: string;
    entityType: string;
    entityId: string;
    newState: Record<string, unknown>;
    metadata: Record<string, unknown>;
    context: RequestAuditContext;
  }
) {
  await tx.insert(auditLog).values({
    tenantId: input.tenantId,
    userId: input.context.userId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    previousState: null,
    newState: input.newState,
    metadata: input.metadata,
    ipAddress: input.context.ipAddress,
    userAgent: input.context.userAgent,
    timestamp: new Date(),
  });
}

async function writeCardTransitionAudit(
  tx: DbTransaction,
  input: {
    tenantId: string;
    transitionedCards: Array<{ cardId: string; loopId: string }>;
    orderType: 'purchase_order' | 'work_order' | 'transfer_order';
    orderId: string;
    orderNumber: string;
    context: RequestAuditContext;
  }
) {
  if (input.transitionedCards.length === 0) return;

  await tx.insert(auditLog).values(
    input.transitionedCards.map((card) => ({
      tenantId: input.tenantId,
      userId: input.context.userId,
      action: 'kanban_card.transitioned_to_ordered',
      entityType: 'kanban_card',
      entityId: card.cardId,
      previousState: { stage: 'triggered' },
      newState: {
        stage: 'ordered',
        orderType: input.orderType,
        orderId: input.orderId,
        orderNumber: input.orderNumber,
      },
      metadata: {
        loopId: card.loopId,
        source: 'order_queue',
      },
      ipAddress: input.context.ipAddress,
      userAgent: input.context.userAgent,
      timestamp: new Date(),
    }))
  );
}

async function publishOrderCreatedEvent(input: {
  tenantId: string;
  orderType: 'purchase_order' | 'work_order' | 'transfer_order';
  orderId: string;
  orderNumber: string;
  linkedCardIds: string[];
}) {
  try {
    const eventBus = getEventBus(config.REDIS_URL);
    await eventBus.publish({
      type: 'order.created',
      tenantId: input.tenantId,
      orderType: input.orderType,
      orderId: input.orderId,
      orderNumber: input.orderNumber,
      linkedCardIds: input.linkedCardIds,
      timestamp: new Date().toISOString(),
    });
  } catch {
    console.error(
      `[order-queue] Failed to publish order.created event for ${input.orderType} ${input.orderNumber}`
    );
  }
}

async function publishCardOrderedTransitions(input: {
  tenantId: string;
  cards: Array<{
    cardId: string;
    loopId: string;
  }>;
}) {
  if (input.cards.length === 0) return;

  const eventBus = getEventBus(config.REDIS_URL);

  await Promise.all(
    input.cards.map(async (card) => {
      try {
        await eventBus.publish({
          type: 'card.transition',
          tenantId: input.tenantId,
          cardId: card.cardId,
          loopId: card.loopId,
          fromStage: 'triggered',
          toStage: 'ordered',
          method: 'system',
          timestamp: new Date().toISOString(),
        });
      } catch {
        console.error(
          `[order-queue] Failed to publish card.transition event for card ${card.cardId}`
        );
      }
    })
  );
}

export async function emitQueueOrderEvents(input: {
  tenantId: string;
  orderType: 'purchase_order' | 'work_order' | 'transfer_order';
  orderId: string;
  orderNumber: string;
  linkedCardIds: string[];
  transitionedCards: Array<{ cardId: string; loopId: string }>;
}) {
  await publishOrderCreatedEvent({
    tenantId: input.tenantId,
    orderType: input.orderType,
    orderId: input.orderId,
    orderNumber: input.orderNumber,
    linkedCardIds: input.linkedCardIds,
  });

  await publishCardOrderedTransitions({
    tenantId: input.tenantId,
    cards: input.transitionedCards,
  });
}

// Validation schemas
const createPOSchema = z.object({
  cardIds: z.array(z.string()).min(1, 'At least one card ID is required'),
  supplierId: z.string().optional(),
  facilityId: z.string().optional(),
  expectedDeliveryDate: z.string().datetime().optional(),
  notes: z.string().optional(),
});

const createWOSchema = z.object({
  cardId: z.string(),
  routingSteps: z
    .array(
      z.object({
        workCenterId: z.string(),
        stepNumber: z.number().int().positive(),
        operationName: z.string(),
        estimatedMinutes: z.number().int().positive().optional(),
      })
    )
    .optional(),
  scheduledStartDate: z.string().datetime().optional(),
  scheduledEndDate: z.string().datetime().optional(),
  notes: z.string().optional(),
});

const createTOSchema = z.object({
  cardIds: z.array(z.string()).min(1, 'At least one card ID is required'),
  notes: z.string().optional(),
});

// GET / - List all triggered cards needing orders
orderQueueRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const { loopType } = req.query;
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      throw new AppError(401, 'Tenant ID not found');
    }

    // Build query to fetch triggered cards with loop details
    const conditions = [
      eq(kanbanCards.tenantId, tenantId),
      eq(kanbanCards.currentStage, 'triggered'),
      eq(kanbanCards.isActive, true),
    ];

    // Filter by loopType if provided
    if (loopType && ['procurement', 'production', 'transfer'].includes(String(loopType))) {
      conditions.push(eq(kanbanLoops.loopType, String(loopType) as (typeof schema.loopTypeEnum.enumValues)[number]));
    }

    const query = db
      .select({
        id: kanbanCards.id,
        cardNumber: kanbanCards.cardNumber,
        currentStage: kanbanCards.currentStage,
        currentStageEnteredAt: kanbanCards.currentStageEnteredAt,
        linkedPurchaseOrderId: kanbanCards.linkedPurchaseOrderId,
        linkedWorkOrderId: kanbanCards.linkedWorkOrderId,
        linkedTransferOrderId: kanbanCards.linkedTransferOrderId,
        loopId: kanbanCards.loopId,
        loopType: kanbanLoops.loopType,
        partId: kanbanLoops.partId,
        facilityId: kanbanLoops.facilityId,
        primarySupplierId: kanbanLoops.primarySupplierId,
        sourceFacilityId: kanbanLoops.sourceFacilityId,
        orderQuantity: kanbanLoops.orderQuantity,
        minQuantity: kanbanLoops.minQuantity,
        numberOfCards: kanbanLoops.numberOfCards,
      })
      .from(kanbanCards)
      .innerJoin(kanbanLoops, eq(kanbanCards.loopId, kanbanLoops.id))
      .where(and(...conditions))
      .orderBy(asc(kanbanCards.currentStageEnteredAt));

    const cards = await query.execute();

    // Group by loop type for response
    const grouped = cards.reduce(
      (acc, card) => {
        if (!acc[card.loopType]) {
          acc[card.loopType] = [];
        }
        acc[card.loopType].push(card);
        return acc;
      },
      {} as Record<string, typeof cards>
    );

    res.json({
      success: true,
      data: grouped,
      total: cards.length,
    });
  } catch (error) {
    next(error);
  }
});

// GET /summary - Queue summary by loop type
orderQueueRouter.get('/summary', async (req: AuthRequest, res, next) => {
  try {
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      throw new AppError(401, 'Tenant ID not found');
    }

    // Get triggered cards with loop type
    const triggeredCards = await db
      .select({
        loopType: kanbanLoops.loopType,
        count: sql<number>`count(*)`.as('count'),
        oldestStageEnteredAt: sql<string>`min(${kanbanCards.currentStageEnteredAt})`.as(
          'oldestStageEnteredAt'
        ),
      })
      .from(kanbanCards)
      .innerJoin(kanbanLoops, eq(kanbanCards.loopId, kanbanLoops.id))
      .where(
        and(
          eq(kanbanCards.tenantId, tenantId),
          eq(kanbanCards.currentStage, 'triggered'),
          eq(kanbanCards.isActive, true)
        )
      )
      .groupBy(kanbanLoops.loopType)
      .execute();

    // Calculate total and oldest
    const totalTriggered = triggeredCards.reduce((sum, row) => sum + row.count, 0);
    const oldestEnteredAt = triggeredCards.reduce((oldest, row) => {
      if (!oldest || new Date(row.oldestStageEnteredAt) < new Date(oldest)) {
        return row.oldestStageEnteredAt;
      }
      return oldest;
    }, null as string | null);

    const oldestCardAge = oldestEnteredAt
      ? Math.floor((Date.now() - new Date(oldestEnteredAt).getTime()) / (1000 * 60 * 60))
      : 0; // in hours

    const summary = {
      totalAwaitingOrders: totalTriggered,
      oldestCardAgeHours: oldestCardAge,
      byLoopType: {} as Record<string, number>,
    };

    triggeredCards.forEach((row) => {
      summary.byLoopType[row.loopType] = row.count;
    });

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    next(error);
  }
});

// POST /create-po - Create Purchase Order from triggered cards
orderQueueRouter.post('/create-po', async (req: AuthRequest, res, next) => {
  try {
    const tenantId = req.user?.tenantId;
    const auditContext = getRequestAuditContext(req);

    if (!tenantId) {
      throw new AppError(401, 'Tenant ID not found');
    }

    const validatedData = createPOSchema.parse(req.body);
    const { cardIds, supplierId, facilityId, expectedDeliveryDate, notes } = validatedData;

    // Fetch all cards to validate
    const cards = await db
      .select({
        id: kanbanCards.id,
        tenantId: kanbanCards.tenantId,
        currentStage: kanbanCards.currentStage,
        loopId: kanbanCards.loopId,
        completedCycles: kanbanCards.completedCycles,
      })
      .from(kanbanCards)
      .where(
        and(
          inArray(kanbanCards.id, cardIds),
          eq(kanbanCards.tenantId, tenantId),
        )
      )
      .execute();

    // Validate all cards belong to tenant and are triggered
    if (cards.length !== cardIds.length) {
      throw new AppError(404, 'One or more card IDs not found');
    }

    if (cards.some((c) => c.tenantId !== tenantId)) {
      throw new AppError(403, 'Invalid card access');
    }

    if (cards.some((c) => c.currentStage !== 'triggered')) {
      throw new AppError(400, 'All cards must be in triggered stage');
    }

    // Fetch loops for all cards
    const loops = await db
      .select({
        id: kanbanLoops.id,
        loopType: kanbanLoops.loopType,
        partId: kanbanLoops.partId,
        facilityId: kanbanLoops.facilityId,
        primarySupplierId: kanbanLoops.primarySupplierId,
        orderQuantity: kanbanLoops.orderQuantity,
      })
      .from(kanbanLoops)
      .where(
        and(
          inArray(kanbanLoops.id, cards.map((c) => c.loopId)),
          eq(kanbanLoops.tenantId, tenantId),
        )
      )
      .execute();

    // Validate all loops are procurement type
    if (loops.some((l) => l.loopType !== 'procurement')) {
      throw new AppError(400, 'All cards must be from procurement loops');
    }

    // Map loop details to cards
    const cardLoopMap = new Map(loops.map((l) => [l.id, l]));
    const cardDetails = cards.map((c) => ({
      ...c,
      loopDetails: cardLoopMap.get(c.loopId)!,
    }));

    // Execute transaction
    const result = await db.transaction(async (tx) => {
      // Generate PO number
      const poNumber = await getNextPONumber(tenantId);

      // Create PO
      const insertedPO = await tx
        .insert(purchaseOrders)
        .values({
          poNumber,
          tenantId,
          supplierId: supplierId || cardDetails[0].loopDetails.primarySupplierId!,
          facilityId: facilityId || cardDetails[0].loopDetails.facilityId,
          status: 'draft',
          expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : undefined,
          notes: notes || undefined,
        })
        .returning({ id: purchaseOrders.id })
        .execute();

      const poId = insertedPO[0].id;

      const transitionedCards: Array<{ cardId: string; loopId: string }> = [];

      // Create PO lines and update cards
      for (let i = 0; i < cardDetails.length; i++) {
        const cardDetail = cardDetails[i];
        const loopDetail = cardDetail.loopDetails;

        // Insert PO line
        await tx
          .insert(purchaseOrderLines)
          .values({
            tenantId,
            purchaseOrderId: poId,
            lineNumber: i + 1,
            partId: loopDetail.partId,
            quantityOrdered: loopDetail.orderQuantity,
            quantityReceived: 0,
            unitCost: '0',
            lineTotal: '0',
            notes: notes || null,
          })
          .execute();

        const transitionedCard = await transitionTriggeredCardToOrdered(tx, {
          tenantId,
          cardId: cardDetail.id,
          linkedPurchaseOrderId: poId,
          notes: `Created PO ${poNumber}`,
          userId: auditContext.userId,
        });

        transitionedCards.push(transitionedCard);
      }

      await writeOrderQueueAudit(tx, {
        tenantId,
        action: 'order_queue.purchase_order_created',
        entityType: 'purchase_order',
        entityId: poId,
        newState: {
          status: 'draft',
          poNumber,
          lineCount: cardDetails.length,
        },
        metadata: {
          source: 'order_queue',
          linkedCardIds: cardIds,
        },
        context: auditContext,
      });

      await writeCardTransitionAudit(tx, {
        tenantId,
        transitionedCards,
        orderType: 'purchase_order',
        orderId: poId,
        orderNumber: poNumber,
        context: auditContext,
      });

      return { poId, poNumber, transitionedCards };
    });

    await emitQueueOrderEvents({
      tenantId,
      orderType: 'purchase_order',
      orderId: result.poId,
      orderNumber: result.poNumber,
      linkedCardIds: cardIds,
      transitionedCards: result.transitionedCards,
    });

    res.status(201).json({
      success: true,
      message: `Purchase Order ${result.poNumber} created with ${cardIds.length} line(s)`,
      data: {
        poId: result.poId,
        poNumber: result.poNumber,
        cardsLinked: cardIds.length,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(new AppError(400, `Validation error: ${error.errors[0].message}`));
    }
    next(error);
  }
});

// POST /create-wo - Create Work Order from triggered production card
orderQueueRouter.post('/create-wo', async (req: AuthRequest, res, next) => {
  try {
    const tenantId = req.user?.tenantId;
    const auditContext = getRequestAuditContext(req);

    if (!tenantId) {
      throw new AppError(401, 'Tenant ID not found');
    }

    const validatedData = createWOSchema.parse(req.body);
    const { cardId, routingSteps, scheduledStartDate, scheduledEndDate, notes } = validatedData;

    // Fetch card with loop details
    const cardResult = await db
      .select({
        id: kanbanCards.id,
        tenantId: kanbanCards.tenantId,
        currentStage: kanbanCards.currentStage,
        loopId: kanbanCards.loopId,
        completedCycles: kanbanCards.completedCycles,
        loopType: kanbanLoops.loopType,
        partId: kanbanLoops.partId,
        facilityId: kanbanLoops.facilityId,
        orderQuantity: kanbanLoops.orderQuantity,
      })
      .from(kanbanCards)
      .innerJoin(kanbanLoops, eq(kanbanCards.loopId, kanbanLoops.id))
      .where(
        and(
          eq(kanbanCards.id, cardId),
          eq(kanbanCards.tenantId, tenantId),
        )
      )
      .execute();

    if (cardResult.length === 0) {
      throw new AppError(404, 'Card not found');
    }

    const card = cardResult[0];

    // Validate tenant, stage, and loop type
    if (card.tenantId !== tenantId) {
      throw new AppError(403, 'Invalid card access');
    }

    if (card.currentStage !== 'triggered') {
      throw new AppError(400, 'Card must be in triggered stage');
    }

    if (card.loopType !== 'production') {
      throw new AppError(400, 'Card must be from a production loop');
    }

    // Execute transaction
    const result = await db.transaction(async (tx) => {
      // Generate WO number
      const woNumber = await getNextWONumber(tenantId);

      // Create WO
      const insertedWO = await tx
        .insert(workOrders)
        .values({
          woNumber,
          tenantId,
          partId: card.partId,
          facilityId: card.facilityId,
          quantityToProduce: card.orderQuantity,
          quantityProduced: 0,
          quantityRejected: 0,
          status: 'draft',
          scheduledStartDate: scheduledStartDate ? new Date(scheduledStartDate) : null,
          scheduledEndDate: scheduledEndDate ? new Date(scheduledEndDate) : null,
          notes: notes || null,
          createdByUserId: null,
        })
        .returning({ id: workOrders.id })
        .execute();

      const woId = insertedWO[0].id;

      // Insert routing steps if provided
      if (routingSteps && routingSteps.length > 0) {
        for (const step of routingSteps) {
          await tx
            .insert(workOrderRoutings)
            .values({
              tenantId,
              workOrderId: woId,
              workCenterId: step.workCenterId,
              stepNumber: step.stepNumber,
              operationName: step.operationName,
              status: 'pending',
              estimatedMinutes: step.estimatedMinutes || null,
            })
            .execute();
        }
      }

      const transitionedCard = await transitionTriggeredCardToOrdered(tx, {
        tenantId,
        cardId,
        linkedWorkOrderId: woId,
        notes: `Created WO ${woNumber}`,
        userId: auditContext.userId,
      });

      await writeOrderQueueAudit(tx, {
        tenantId,
        action: 'order_queue.work_order_created',
        entityType: 'work_order',
        entityId: woId,
        newState: {
          status: 'draft',
          woNumber,
          quantityToProduce: card.orderQuantity,
        },
        metadata: {
          source: 'order_queue',
          linkedCardIds: [cardId],
        },
        context: auditContext,
      });

      await writeCardTransitionAudit(tx, {
        tenantId,
        transitionedCards: [transitionedCard],
        orderType: 'work_order',
        orderId: woId,
        orderNumber: woNumber,
        context: auditContext,
      });

      return {
        woId,
        woNumber,
        transitionedCards: [transitionedCard],
      };
    });

    await emitQueueOrderEvents({
      tenantId,
      orderType: 'work_order',
      orderId: result.woId,
      orderNumber: result.woNumber,
      linkedCardIds: [cardId],
      transitionedCards: result.transitionedCards,
    });

    res.status(201).json({
      success: true,
      message: `Work Order ${result.woNumber} created`,
      data: {
        woId: result.woId,
        woNumber: result.woNumber,
        quantity: card.orderQuantity,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(new AppError(400, `Validation error: ${error.errors[0].message}`));
    }
    next(error);
  }
});

// POST /create-to - Create Transfer Order from triggered transfer cards
orderQueueRouter.post('/create-to', async (req: AuthRequest, res, next) => {
  try {
    const tenantId = req.user?.tenantId;
    const auditContext = getRequestAuditContext(req);

    if (!tenantId) {
      throw new AppError(401, 'Tenant ID not found');
    }

    const validatedData = createTOSchema.parse(req.body);
    const { cardIds, notes } = validatedData;

    // Fetch all cards with loop details
    const cardResults = await db
      .select({
        id: kanbanCards.id,
        tenantId: kanbanCards.tenantId,
        currentStage: kanbanCards.currentStage,
        loopId: kanbanCards.loopId,
        completedCycles: kanbanCards.completedCycles,
        loopType: kanbanLoops.loopType,
        partId: kanbanLoops.partId,
        facilityId: kanbanLoops.facilityId,
        sourceFacilityId: kanbanLoops.sourceFacilityId,
        orderQuantity: kanbanLoops.orderQuantity,
      })
      .from(kanbanCards)
      .innerJoin(kanbanLoops, eq(kanbanCards.loopId, kanbanLoops.id))
      .where(
        and(
          inArray(kanbanCards.id, cardIds),
          eq(kanbanCards.tenantId, tenantId),
        )
      )
      .execute();

    // Validate all cards found
    if (cardResults.length !== cardIds.length) {
      throw new AppError(404, 'One or more card IDs not found');
    }

    // Validate tenant access and stage
    if (cardResults.some((c) => c.tenantId !== tenantId)) {
      throw new AppError(403, 'Invalid card access');
    }

    if (cardResults.some((c) => c.currentStage !== 'triggered')) {
      throw new AppError(400, 'All cards must be in triggered stage');
    }

    // Validate all are transfer loops
    if (cardResults.some((c) => c.loopType !== 'transfer')) {
      throw new AppError(400, 'All cards must be from transfer loops');
    }

    // Execute transaction
    const result = await db.transaction(async (tx) => {
      // Generate TO number
      const toNumber = await getNextTONumber(tenantId);

      // Create TO
      const insertedTO = await tx
        .insert(transferOrders)
        .values({
          toNumber,
          tenantId,
          sourceFacilityId: cardResults[0].sourceFacilityId!,
          destinationFacilityId: cardResults[0].facilityId,
          status: 'draft',
          notes: notes || undefined,
        })
        .returning({ id: transferOrders.id })
        .execute();

      const toId = insertedTO[0].id;

      const transitionedCards: Array<{ cardId: string; loopId: string }> = [];

      // Create TO lines and update cards
      for (let i = 0; i < cardResults.length; i++) {
        const card = cardResults[i];

        // Insert TO line
        await tx
          .insert(transferOrderLines)
          .values({
            tenantId,
            transferOrderId: toId,
            partId: card.partId,
            quantityRequested: card.orderQuantity,
            quantityShipped: 0,
            quantityReceived: 0,
            notes: notes || null,
          })
          .execute();

        const transitionedCard = await transitionTriggeredCardToOrdered(tx, {
          tenantId,
          cardId: card.id,
          linkedTransferOrderId: toId,
          notes: `Created TO ${toNumber}`,
          userId: auditContext.userId,
        });

        transitionedCards.push(transitionedCard);
      }

      await writeOrderQueueAudit(tx, {
        tenantId,
        action: 'order_queue.transfer_order_created',
        entityType: 'transfer_order',
        entityId: toId,
        newState: {
          status: 'draft',
          toNumber,
          lineCount: cardResults.length,
        },
        metadata: {
          source: 'order_queue',
          linkedCardIds: cardIds,
        },
        context: auditContext,
      });

      await writeCardTransitionAudit(tx, {
        tenantId,
        transitionedCards,
        orderType: 'transfer_order',
        orderId: toId,
        orderNumber: toNumber,
        context: auditContext,
      });

      return { toId, toNumber, transitionedCards };
    });

    await emitQueueOrderEvents({
      tenantId,
      orderType: 'transfer_order',
      orderId: result.toId,
      orderNumber: result.toNumber,
      linkedCardIds: cardIds,
      transitionedCards: result.transitionedCards,
    });

    res.status(201).json({
      success: true,
      message: `Transfer Order ${result.toNumber} created with ${cardIds.length} line(s)`,
      data: {
        toId: result.toId,
        toNumber: result.toNumber,
        cardsLinked: cardIds.length,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(new AppError(400, `Validation error: ${error.errors[0].message}`));
    }
    next(error);
  }
});
