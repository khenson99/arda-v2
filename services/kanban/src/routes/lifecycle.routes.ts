import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '@arda/auth-utils';
import type { UserRole } from '@arda/shared-types';
import { guards } from '../middleware/auth-guards.js';
import { AppError } from '../middleware/error-handler.js';
import {
  transitionCard,
  getCardHistory,
  getCardLifecycleEvents,
  getLoopLifecycleEvents,
  getLoopVelocity,
} from '../services/card-lifecycle.service.js';
import {
  calculateLoopInferredQuantity,
  recalculateLoopQuantity,
  getLoopCardSummary,
  getTriggeredCardsForConsolidation,
  switchCardMode,
  updateLoopOrderQuantity,
} from '../services/quantity-accounting.service.js';

export const lifecycleRouter = Router();

// ═══════════════════════════════════════════════════════════════════════
// CARD LIFECYCLE ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════

const cardStageValues = ['created', 'triggered', 'ordered', 'in_transit', 'received', 'restocked'] as const;

const transitionSchema = z.object({
  toStage: z.enum(cardStageValues),
  method: z.enum(['qr_scan', 'manual', 'system']).default('manual'),
  notes: z.string().max(1000).optional(),
  metadata: z.record(z.unknown()).optional(),
  idempotencyKey: z.string().max(100).optional(),
  linkedOrderId: z.string().uuid().optional(),
  linkedOrderType: z.enum(['purchase_order', 'work_order', 'transfer_order']).optional(),
  quantity: z.number().int().positive().optional(),
});

// ─── POST /lifecycle/cards/:cardId/transition ────────────────────────
// Enhanced transition with full RBAC validation, idempotency, and
// lifecycle event emission. Accepts method, linked orders, and quantity.
lifecycleRouter.post(
  '/cards/:cardId/transition',
  guards.transitionCard,
  async (req: AuthRequest, res, next) => {
    try {
      const input = transitionSchema.parse(req.body);

      const result = await transitionCard({
        cardId: req.params.cardId as string,
        tenantId: req.user!.tenantId,
        toStage: input.toStage,
        userId: req.user!.sub,
        userRole: req.user!.role as UserRole,
        method: input.method,
        notes: input.notes,
        metadata: input.metadata,
        idempotencyKey: input.idempotencyKey,
        linkedOrderId: input.linkedOrderId,
        linkedOrderType: input.linkedOrderType,
        quantity: input.quantity,
      });

      res.json({
        success: true,
        card: result.card,
        transition: result.transition,
        eventId: result.eventId,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', details: err.errors });
        return;
      }
      next(err);
    }
  }
);

// ─── GET /lifecycle/cards/:cardId/history ────────────────────────────
// Full transition history for a card (immutable audit trail).
lifecycleRouter.get(
  '/cards/:cardId/history',
  guards.readCards,
  async (req: AuthRequest, res, next) => {
    try {
      const history = await getCardHistory(
        req.params.cardId as string,
        req.user!.tenantId,
      );
      res.json({ cardId: req.params.cardId, transitions: history });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /lifecycle/cards/:cardId/events ─────────────────────────────
// Enriched lifecycle events with stage durations and current-stage marker.
lifecycleRouter.get(
  '/cards/:cardId/events',
  guards.readCards,
  async (req: AuthRequest, res, next) => {
    try {
      const events = await getCardLifecycleEvents(
        req.params.cardId as string,
        req.user!.tenantId,
      );
      res.json({ cardId: req.params.cardId, events });
    } catch (err) {
      next(err);
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════
// LOOP LIFECYCLE ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════

// ─── GET /lifecycle/loops/:loopId/events ─────────────────────────────
// All lifecycle events across all cards in a loop (paginated).
lifecycleRouter.get(
  '/loops/:loopId/events',
  guards.readLoops,
  async (req: AuthRequest, res, next) => {
    try {
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
      const offset = Math.max(0, Number(req.query.offset) || 0);

      const result = await getLoopLifecycleEvents(
        req.params.loopId as string,
        req.user!.tenantId,
        { limit, offset },
      );

      res.json({ loopId: req.params.loopId, ...result });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /lifecycle/loops/:loopId/velocity ───────────────────────────
// Velocity data: average cycle times between stage pairs, full-cycle stats.
lifecycleRouter.get(
  '/loops/:loopId/velocity',
  guards.readVelocity,
  async (req: AuthRequest, res, next) => {
    try {
      const velocity = await getLoopVelocity(
        req.params.loopId as string,
        req.user!.tenantId,
      );
      res.json(velocity);
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /lifecycle/loops/:loopId/quantity ────────────────────────────
// Inferred in-flight quantity across all active cards.
lifecycleRouter.get(
  '/loops/:loopId/quantity',
  guards.readLoops,
  async (req: AuthRequest, res, next) => {
    try {
      const quantity = await calculateLoopInferredQuantity(
        req.params.loopId as string,
        req.user!.tenantId,
      );
      res.json(quantity);
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /lifecycle/loops/:loopId/quantity/recalculate ──────────────
// Force a full recalculation of in-flight quantities.
lifecycleRouter.post(
  '/loops/:loopId/quantity/recalculate',
  guards.updateLoopParameters,
  async (req: AuthRequest, res, next) => {
    try {
      const result = await recalculateLoopQuantity(
        req.params.loopId as string,
        req.user!.tenantId,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /lifecycle/loops/:loopId/card-summary ───────────────────────
// Multi-card overview for queue UIs: stage distribution, triggered count,
// in-flight quantity, and per-card details.
lifecycleRouter.get(
  '/loops/:loopId/card-summary',
  guards.readCards,
  async (req: AuthRequest, res, next) => {
    try {
      const summary = await getLoopCardSummary(
        req.params.loopId as string,
        req.user!.tenantId,
      );
      res.json(summary);
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /lifecycle/loops/:loopId/triggered-cards ────────────────────
// Cards grouped for PO/TO consolidation. Used by the order queue to
// create consolidated purchase or transfer orders.
lifecycleRouter.get(
  '/loops/:loopId/triggered-cards',
  guards.readCards,
  async (req: AuthRequest, res, next) => {
    try {
      const result = await getTriggeredCardsForConsolidation(
        req.params.loopId as string,
        req.user!.tenantId,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /lifecycle/loops/:loopId/card-mode ─────────────────────────
// Switch between single and multi card modes. Creates or deactivates
// cards as needed.
const switchModeSchema = z.object({
  newMode: z.enum(['single', 'multi']),
  newNumberOfCards: z.number().int().positive().optional(),
  reason: z.string().min(1, 'Reason is required for mode changes'),
});

lifecycleRouter.post(
  '/loops/:loopId/card-mode',
  guards.updateLoopParameters,
  async (req: AuthRequest, res, next) => {
    try {
      const input = switchModeSchema.parse(req.body);

      const result = await switchCardMode(
        req.params.loopId as string,
        req.user!.tenantId,
        {
          newMode: input.newMode,
          newNumberOfCards: input.newNumberOfCards,
          reason: input.reason,
          userId: req.user!.sub,
        },
      );

      res.json({ success: true, ...result });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', details: err.errors });
        return;
      }
      next(err);
    }
  }
);

// ─── PATCH /lifecycle/loops/:loopId/order-quantity ───────────────────
// Update order quantity with propagation to all cards and audit trail.
const updateQuantitySchema = z.object({
  newOrderQuantity: z.number().int().positive(),
  reason: z.string().min(1, 'Reason is required for quantity changes'),
});

lifecycleRouter.patch(
  '/loops/:loopId/order-quantity',
  guards.updateLoopParameters,
  async (req: AuthRequest, res, next) => {
    try {
      const input = updateQuantitySchema.parse(req.body);

      const result = await updateLoopOrderQuantity(
        req.params.loopId as string,
        req.user!.tenantId,
        {
          newOrderQuantity: input.newOrderQuantity,
          reason: input.reason,
          userId: req.user!.sub,
        },
      );

      res.json({ success: true, ...result });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', details: err.errors });
        return;
      }
      next(err);
    }
  }
);
