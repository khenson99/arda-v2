import { Router } from 'express';
import { z } from 'zod';
import { eq, and, sql, inArray, desc, asc } from 'drizzle-orm';
import { db, schema } from '@arda/db';
import type { AuthRequest } from '@arda/auth-utils';
import { AppError } from '../middleware/error-handler.js';
import {
  getNextPONumber,
  getNextWONumber,
  getNextTONumber,
} from '../services/order-number.service.js';

export const orderQueueRouter = Router();

const {
  kanbanCards,
  kanbanLoops,
  cardStageTransitions,
  purchaseOrders,
  purchaseOrderLines,
  workOrders,
  workOrderRoutings,
  transferOrders,
  transferOrderLines,
} = schema;

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
      conditions.push(eq(kanbanLoops.loopType, String(loopType) as any));
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
      .where(inArray(kanbanCards.id, cardIds))
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
      .where(inArray(kanbanLoops.id, cards.map((c) => c.loopId)))
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

        // Update kanban card with PO link
        await tx
          .update(kanbanCards)
          .set({
            linkedPurchaseOrderId: poId,
            currentStage: 'ordered',
            currentStageEnteredAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(kanbanCards.id, cardDetail.id))
          .execute();

        // Insert stage transition
        await tx
          .insert(cardStageTransitions)
          .values({
            tenantId,
            cardId: cardDetail.id,
            loopId: cardDetail.loopId,
            fromStage: 'triggered',
            toStage: 'ordered',
            method: 'system',
            cycleNumber: (cardDetail.completedCycles || 0) + 1,
            notes: `Created PO ${poNumber}`,
          })
          .execute();
      }

      return { poId, poNumber };
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
      .where(eq(kanbanCards.id, cardId))
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

      // Update kanban card with WO link
      await tx
        .update(kanbanCards)
        .set({
          linkedWorkOrderId: woId,
          currentStage: 'ordered',
          currentStageEnteredAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(kanbanCards.id, cardId))
        .execute();

      // Insert stage transition
      await tx
        .insert(cardStageTransitions)
        .values({
          tenantId,
          cardId,
          loopId: card.loopId,
          fromStage: 'triggered',
          toStage: 'ordered',
          method: 'system',
          cycleNumber: (card.completedCycles || 0) + 1,
          notes: `Created WO ${woNumber}`,
        })
        .execute();

      return { woId, woNumber };
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
      .where(inArray(kanbanCards.id, cardIds))
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

        // Update kanban card with TO link
        await tx
          .update(kanbanCards)
          .set({
            linkedTransferOrderId: toId,
            currentStage: 'ordered',
            currentStageEnteredAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(kanbanCards.id, card.id))
          .execute();

        // Insert stage transition
        await tx
          .insert(cardStageTransitions)
          .values({
            tenantId,
            cardId: card.id,
            loopId: card.loopId,
            fromStage: 'triggered',
            toStage: 'ordered',
            method: 'system',
            cycleNumber: (card.completedCycles || 0) + 1,
            notes: `Created TO ${toNumber}`,
          })
          .execute();
      }

      return { toId, toNumber };
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
