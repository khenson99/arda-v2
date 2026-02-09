import { Router } from 'express';
import { eq, and, sql, gte } from 'drizzle-orm';
import { db, schema } from '@arda/db';
import type { AuthRequest } from '@arda/auth-utils';
import { getLoopVelocity } from '../services/card-lifecycle.service.js';
import { AppError } from '../middleware/error-handler.js';

export const velocityRouter = Router();
const { kanbanLoops, cardStageTransitions } = schema;

// ─── GET /velocity/:loopId — Velocity data for a specific loop ───────
velocityRouter.get('/:loopId', async (req: AuthRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;

    // Verify loop belongs to this tenant
    const loop = await db.query.kanbanLoops.findFirst({
      where: and(eq(kanbanLoops.id, req.params.loopId as string), eq(kanbanLoops.tenantId, tenantId)),
    });
    if (!loop) throw new AppError(404, 'Loop not found');

    const velocity = await getLoopVelocity(req.params.loopId as string, tenantId);
    res.json(velocity);
  } catch (err) {
    next(err);
  }
});

// ─── GET /velocity/summary — Velocity summary across all loops ───────
velocityRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const facilityId = req.query.facilityId as string | undefined;

    // Get aggregate stats across all active loops
    const conditions = [eq(kanbanLoops.tenantId, tenantId), eq(kanbanLoops.isActive, true)];
    if (facilityId) conditions.push(eq(kanbanLoops.facilityId, facilityId));

    const loops = await db.query.kanbanLoops.findMany({
      where: and(...conditions),
      with: {
        cards: {
          columns: { id: true, currentStage: true, completedCycles: true },
        },
      },
    });

    // Compute summary stats
    const summary = {
      totalLoops: loops.length,
      totalCards: 0,
      cardsByStage: {} as Record<string, number>,
      totalCompletedCycles: 0,
      loopsByType: {} as Record<string, number>,
    };

    for (const loop of loops) {
      summary.loopsByType[loop.loopType] = (summary.loopsByType[loop.loopType] || 0) + 1;

      for (const card of loop.cards) {
        summary.totalCards++;
        summary.cardsByStage[card.currentStage] =
          (summary.cardsByStage[card.currentStage] || 0) + 1;
        summary.totalCompletedCycles += card.completedCycles;
      }
    }

    // Get recent transition activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentActivity = await db
      .select({
        date: sql<string>`DATE(${cardStageTransitions.transitionedAt})`,
        count: sql<number>`count(*)`,
      })
      .from(cardStageTransitions)
      .where(
        and(
          eq(cardStageTransitions.tenantId, tenantId),
          gte(cardStageTransitions.transitionedAt, sevenDaysAgo)
        )
      )
      .groupBy(sql`DATE(${cardStageTransitions.transitionedAt})`)
      .orderBy(sql`DATE(${cardStageTransitions.transitionedAt})`);

    res.json({
      ...summary,
      recentActivity: recentActivity.map((r) => ({
        date: r.date,
        transitions: Number(r.count),
      })),
    });
  } catch (err) {
    next(err);
  }
});
