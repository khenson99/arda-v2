/**
 * Production Queue Routes (Ticket #74)
 *
 * REST endpoints for the production queue: list, create WO from trigger,
 * triage (batch actions), expedite, hold, resume, split, status transitions,
 * and score refresh.
 */

import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '@arda/auth-utils';
import { AppError } from '../middleware/error-handler.js';
import {
  createWorkOrderFromTrigger,
  transitionWorkOrderStatus,
  expediteWorkOrder,
  splitWorkOrder,
  getProductionQueue,
  refreshProductionQueueScores,
} from '../services/work-order-orchestration.service.js';
import {
  applyRoutingTemplate,
  transitionRoutingStep,
  getRoutingSteps,
  canAutoCompleteWorkOrder,
} from '../services/routing-engine.service.js';
import {
  reportQuantity,
  completeWorkOrder,
} from '../services/completion-posting.service.js';
import {
  processCompletionExceptions,
  handleMaterialShortageHold,
  checkScrapThreshold,
} from '../services/production-exception.service.js';
import { recordMaterialConsumption } from '../services/material-consumption.service.js';
import { getProductionMetrics } from '../services/production-analytics.service.js';

export const productionQueueRouter = Router();

// ─── Validation Schemas ─────────────────────────────────────────────

const CreateWOSchema = z.object({
  cardId: z.string().uuid(),
  loopId: z.string().uuid(),
  partId: z.string().uuid(),
  facilityId: z.string().uuid(),
  quantity: z.number().int().min(1),
  templateId: z.string().uuid().optional(),
});

const StatusTransitionSchema = z.object({
  toStatus: z.enum(['draft', 'scheduled', 'in_progress', 'on_hold', 'completed', 'cancelled']),
  holdReason: z.enum(['material_shortage', 'equipment_failure', 'quality_hold', 'labor_unavailable', 'other']).optional(),
  holdNotes: z.string().optional(),
  cancelReason: z.string().optional(),
});

const SplitSchema = z.object({
  splitQuantity: z.number().int().min(1),
});

const TriageActionSchema = z.object({
  workOrderId: z.string().uuid(),
  action: z.enum(['expedite', 'hold', 'resume', 'cancel', 'schedule']),
  holdReason: z.enum(['material_shortage', 'equipment_failure', 'quality_hold', 'labor_unavailable', 'other']).optional(),
  holdNotes: z.string().optional(),
  cancelReason: z.string().optional(),
});

const TriageBatchSchema = z.object({
  actions: z.array(TriageActionSchema).min(1).max(50),
});

const ApplyTemplateSchema = z.object({
  templateId: z.string().uuid(),
});

const StepTransitionSchema = z.object({
  routingStepId: z.string().uuid(),
  toStatus: z.enum(['pending', 'in_progress', 'complete', 'on_hold', 'skipped']),
  actualMinutes: z.number().int().min(0).optional(),
  notes: z.string().optional(),
});

// ─── GET / — List Production Queue ──────────────────────────────────

productionQueueRouter.get('/', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = authReq.user?.tenantId;
    if (!tenantId) throw new AppError(401, 'Missing tenant context');

    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 50;
    const facilityId = req.query.facilityId as string | undefined;
    const status = req.query.status as string | undefined;

    const result = await getProductionQueue(tenantId, { facilityId, status, page, pageSize });

    res.json({
      data: result.items,
      pagination: {
        page,
        pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / pageSize),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /analytics — Production KPI Dashboard ─────────────────────

productionQueueRouter.get('/analytics', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = authReq.user?.tenantId;
    if (!tenantId) throw new AppError(401, 'Missing tenant context');

    const facilityId = req.query.facilityId as string | undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;

    const metrics = await getProductionMetrics({
      tenantId,
      facilityId,
      dateFrom,
      dateTo,
    });

    res.json(metrics);
  } catch (err) {
    next(err);
  }
});

// ─── POST /create-wo — Create WO from Triggered Card ───────────────

productionQueueRouter.post('/create-wo', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = authReq.user?.tenantId;
    if (!tenantId) throw new AppError(401, 'Missing tenant context');

    const parsed = CreateWOSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, `Validation error: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
    }

    const result = await createWorkOrderFromTrigger({
      tenantId,
      ...parsed.data,
      userId: authReq.user?.sub,
    });

    res.status(result.alreadyExisted ? 200 : 201).json(result);
  } catch (err) {
    next(err);
  }
});

// ─── POST /refresh-scores — Recalculate Priority Scores ─────────────

productionQueueRouter.post('/refresh-scores', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = authReq.user?.tenantId;
    if (!tenantId) throw new AppError(401, 'Missing tenant context');

    const facilityId = req.query.facilityId as string | undefined;
    const result = await refreshProductionQueueScores(tenantId, facilityId);

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── POST /triage — Batch Triage Actions ────────────────────────────

productionQueueRouter.post('/triage', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = authReq.user?.tenantId;
    if (!tenantId) throw new AppError(401, 'Missing tenant context');

    const parsed = TriageBatchSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, `Validation error: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
    }

    const results = [];
    for (const action of parsed.data.actions) {
      try {
        switch (action.action) {
          case 'expedite':
            await expediteWorkOrder({ tenantId, workOrderId: action.workOrderId, userId: authReq.user?.sub });
            results.push({ workOrderId: action.workOrderId, action: action.action, success: true });
            break;
          case 'hold':
            await transitionWorkOrderStatus({
              tenantId,
              workOrderId: action.workOrderId,
              toStatus: 'on_hold',
              holdReason: action.holdReason,
              holdNotes: action.holdNotes,
              userId: authReq.user?.sub,
            });
            results.push({ workOrderId: action.workOrderId, action: action.action, success: true });
            break;
          case 'resume':
            await transitionWorkOrderStatus({
              tenantId,
              workOrderId: action.workOrderId,
              toStatus: 'in_progress',
              userId: authReq.user?.sub,
            });
            results.push({ workOrderId: action.workOrderId, action: action.action, success: true });
            break;
          case 'cancel':
            await transitionWorkOrderStatus({
              tenantId,
              workOrderId: action.workOrderId,
              toStatus: 'cancelled',
              cancelReason: action.cancelReason || 'Batch triage cancellation',
              userId: authReq.user?.sub,
            });
            results.push({ workOrderId: action.workOrderId, action: action.action, success: true });
            break;
          case 'schedule':
            await transitionWorkOrderStatus({
              tenantId,
              workOrderId: action.workOrderId,
              toStatus: 'scheduled',
              userId: authReq.user?.sub,
            });
            results.push({ workOrderId: action.workOrderId, action: action.action, success: true });
            break;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        results.push({ workOrderId: action.workOrderId, action: action.action, success: false, error: message });
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    res.json({ results, total: results.length, succeeded, failed: results.length - succeeded });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /:id/status — Transition WO Status ──────────────────────

productionQueueRouter.patch('/:id/status', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = authReq.user?.tenantId;
    if (!tenantId) throw new AppError(401, 'Missing tenant context');

    const parsed = StatusTransitionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, `Validation error: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
    }

    const result = await transitionWorkOrderStatus({
      tenantId,
      workOrderId: req.params.id,
      ...parsed.data,
      userId: authReq.user?.sub,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── POST /:id/expedite — Expedite WO ──────────────────────────────

productionQueueRouter.post('/:id/expedite', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = authReq.user?.tenantId;
    if (!tenantId) throw new AppError(401, 'Missing tenant context');

    await expediteWorkOrder({ tenantId, workOrderId: req.params.id, userId: authReq.user?.sub });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─── POST /:id/hold — Place WO on Hold ─────────────────────────────

productionQueueRouter.post('/:id/hold', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = authReq.user?.tenantId;
    if (!tenantId) throw new AppError(401, 'Missing tenant context');

    const holdReason = req.body.holdReason;
    const holdNotes = req.body.holdNotes;

    const result = await transitionWorkOrderStatus({
      tenantId,
      workOrderId: req.params.id,
      toStatus: 'on_hold',
      holdReason,
      holdNotes,
      userId: authReq.user?.sub,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── POST /:id/resume — Resume WO from Hold ────────────────────────

productionQueueRouter.post('/:id/resume', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = authReq.user?.tenantId;
    if (!tenantId) throw new AppError(401, 'Missing tenant context');

    const result = await transitionWorkOrderStatus({
      tenantId,
      workOrderId: req.params.id,
      toStatus: 'in_progress',
      userId: authReq.user?.sub,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── POST /:id/split — Split WO ────────────────────────────────────

productionQueueRouter.post('/:id/split', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = authReq.user?.tenantId;
    if (!tenantId) throw new AppError(401, 'Missing tenant context');

    const parsed = SplitSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, `Validation error: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
    }

    const result = await splitWorkOrder({
      tenantId,
      workOrderId: req.params.id,
      splitQuantity: parsed.data.splitQuantity,
      userId: authReq.user?.sub,
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// ─── POST /:id/apply-template — Apply Routing Template ──────────────

productionQueueRouter.post('/:id/apply-template', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = authReq.user?.tenantId;
    if (!tenantId) throw new AppError(401, 'Missing tenant context');

    const parsed = ApplyTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, `Validation error: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
    }

    const result = await applyRoutingTemplate({
      tenantId,
      workOrderId: req.params.id,
      templateId: parsed.data.templateId,
      userId: authReq.user?.sub,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── GET /:id/routing-steps — Get Routing Steps ─────────────────────

productionQueueRouter.get('/:id/routing-steps', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = authReq.user?.tenantId;
    if (!tenantId) throw new AppError(401, 'Missing tenant context');

    const steps = await getRoutingSteps(tenantId, req.params.id);
    res.json({ data: steps });
  } catch (err) {
    next(err);
  }
});

// ─── POST /:id/routing-steps/transition — Transition Routing Step ────

productionQueueRouter.post('/:id/routing-steps/transition', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = authReq.user?.tenantId;
    if (!tenantId) throw new AppError(401, 'Missing tenant context');

    const parsed = StepTransitionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, `Validation error: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
    }

    const result = await transitionRoutingStep({
      tenantId,
      workOrderId: req.params.id,
      ...parsed.data,
      userId: authReq.user?.sub,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── GET /:id/can-complete — Check Auto-Completion Eligibility ──────

productionQueueRouter.get('/:id/can-complete', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = authReq.user?.tenantId;
    if (!tenantId) throw new AppError(401, 'Missing tenant context');

    const result = await canAutoCompleteWorkOrder(tenantId, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── POST /:id/report-quantity — Report Production Quantity ─────────

const ReportQuantitySchema = z.object({
  quantityGood: z.number().int().min(0),
  quantityScrapped: z.number().int().min(0).optional(),
  notes: z.string().optional(),
});

productionQueueRouter.post('/:id/report-quantity', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = authReq.user?.tenantId;
    if (!tenantId) throw new AppError(401, 'Missing tenant context');

    const parsed = ReportQuantitySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, `Validation error: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
    }

    const result = await reportQuantity({
      tenantId,
      workOrderId: req.params.id,
      ...parsed.data,
      userId: authReq.user?.sub,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── POST /:id/complete — Complete Work Order ──────────────────────

const CompleteWOSchema = z.object({
  finalQuantityGood: z.number().int().min(0).optional(),
  finalQuantityScrapped: z.number().int().min(0).optional(),
  completionNotes: z.string().optional(),
});

productionQueueRouter.post('/:id/complete', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = authReq.user?.tenantId;
    if (!tenantId) throw new AppError(401, 'Missing tenant context');

    const parsed = CompleteWOSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, `Validation error: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
    }

    const result = await completeWorkOrder({
      tenantId,
      workOrderId: req.params.id,
      ...parsed.data,
      userId: authReq.user?.sub,
    });

    // Run post-completion exception checks
    let exceptions = null;
    try {
      exceptions = await processCompletionExceptions(tenantId, req.params.id, authReq.user?.sub);
    } catch (excErr) {
      // Exception processing is best-effort; don't fail the completion
    }

    res.json({ ...result, exceptions });
  } catch (err) {
    next(err);
  }
});

// ─── POST /:id/record-consumption — Record Material Consumption ─────

const RecordConsumptionSchema = z.object({
  stepId: z.string().uuid(),
  quantityProduced: z.number().int().min(1),
});

productionQueueRouter.post('/:id/record-consumption', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = authReq.user?.tenantId;
    if (!tenantId) throw new AppError(401, 'Missing tenant context');

    const parsed = RecordConsumptionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, `Validation error: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
    }

    const result = await recordMaterialConsumption({
      tenantId,
      workOrderId: req.params.id,
      ...parsed.data,
      userId: authReq.user?.sub,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── POST /:id/check-exceptions — Run Exception Checks ─────────────

productionQueueRouter.post('/:id/check-exceptions', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = authReq.user?.tenantId;
    if (!tenantId) throw new AppError(401, 'Missing tenant context');

    const results = await processCompletionExceptions(tenantId, req.params.id, authReq.user?.sub);
    res.json(results);
  } catch (err) {
    next(err);
  }
});

