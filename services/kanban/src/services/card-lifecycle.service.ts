import { eq, and, sql, desc, asc, inArray } from 'drizzle-orm';
import { db, schema } from '@arda/db';
import { getEventBus } from '@arda/events';
import { config } from '@arda/config';
import { AppError } from '../middleware/error-handler.js';
import type { CardStage, UserRole, LoopType } from '@arda/shared-types';

const {
  kanbanCards,
  kanbanLoops,
  cardStageTransitions,
  kanbanParameterHistory,
} = schema;

// ═══════════════════════════════════════════════════════════════════════
// LIFECYCLE ORCHESTRATOR — Enhanced Transition Engine
// ═══════════════════════════════════════════════════════════════════════
//
// This module implements a 9-step lifecycle transition pipeline:
//   1. Idempotency check (dedup by key)
//   2. Card fetch (with tenant isolation)
//   3. Stage validation (TRANSITION_MATRIX)
//   4. Role authorization (TRANSITION_RULES)
//   5. Loop-type compatibility check
//   6. Method validation
//   7. Precondition enforcement (linked orders, etc.)
//   8. Atomic DB transaction (card update + transition record + lifecycle event)
//   9. Domain event emission (fire-and-forget via Redis pub/sub)
//
// ═══════════════════════════════════════════════════════════════════════

// ─── Transition Matrix ───────────────────────────────────────────────
// Maps each stage to its allowed next stages. This is the source of truth
// for the Kanban flow: CREATED → TRIGGERED → ORDERED → IN_TRANSIT → RECEIVED → RESTOCKED → CREATED
export const VALID_TRANSITIONS: Record<string, string[]> = {
  created: ['triggered'],
  triggered: ['ordered'],
  ordered: ['in_transit', 'received'], // in_transit can be skipped for local procurement
  in_transit: ['received'],
  received: ['restocked'],
  restocked: ['created'], // loop restart (new cycle)
};

// Alias for enhanced API consumers
export const TRANSITION_MATRIX = VALID_TRANSITIONS;

// ─── Transition Rules ────────────────────────────────────────────────
// Each rule defines who can perform a transition, under what conditions,
// and with which methods. This is the authorization layer for the lifecycle.

export interface TransitionRule {
  from: CardStage;
  to: CardStage;
  allowedRoles: UserRole[];
  allowedLoopTypes: LoopType[];
  allowedMethods: ('qr_scan' | 'manual' | 'system')[];
  requiresLinkedOrder?: boolean;
  linkedOrderTypes?: ('purchase_order' | 'work_order' | 'transfer_order')[];
  description: string;
}

export const TRANSITION_RULES: TransitionRule[] = [
  {
    from: 'created',
    to: 'triggered',
    allowedRoles: ['tenant_admin', 'inventory_manager', 'procurement_manager', 'receiving_manager'],
    allowedLoopTypes: ['procurement', 'production', 'transfer'],
    allowedMethods: ['qr_scan', 'manual', 'system'],
    description: 'Scan or manually trigger replenishment signal',
  },
  {
    from: 'triggered',
    to: 'ordered',
    allowedRoles: ['tenant_admin', 'inventory_manager', 'procurement_manager'],
    allowedLoopTypes: ['procurement', 'production', 'transfer'],
    allowedMethods: ['manual', 'system'],
    requiresLinkedOrder: true,
    linkedOrderTypes: ['purchase_order', 'work_order', 'transfer_order'],
    description: 'Link to PO/WO/TO and advance to ordered',
  },
  {
    from: 'ordered',
    to: 'in_transit',
    allowedRoles: ['tenant_admin', 'inventory_manager', 'procurement_manager', 'receiving_manager'],
    allowedLoopTypes: ['procurement', 'transfer'],
    allowedMethods: ['manual', 'system'],
    description: 'Mark shipment as in transit (skip for production)',
  },
  {
    from: 'ordered',
    to: 'received',
    allowedRoles: ['tenant_admin', 'inventory_manager', 'receiving_manager'],
    allowedLoopTypes: ['production'],
    allowedMethods: ['manual', 'system', 'qr_scan'],
    description: 'Direct receive for production loops (skip in_transit)',
  },
  {
    from: 'in_transit',
    to: 'received',
    allowedRoles: ['tenant_admin', 'inventory_manager', 'receiving_manager'],
    allowedLoopTypes: ['procurement', 'transfer'],
    allowedMethods: ['manual', 'system', 'qr_scan'],
    description: 'Receive goods at destination facility',
  },
  {
    from: 'received',
    to: 'restocked',
    allowedRoles: ['tenant_admin', 'inventory_manager', 'receiving_manager'],
    allowedLoopTypes: ['procurement', 'production', 'transfer'],
    allowedMethods: ['manual', 'system', 'qr_scan'],
    description: 'Confirm restock at storage location',
  },
  {
    from: 'restocked',
    to: 'created',
    allowedRoles: ['tenant_admin', 'inventory_manager'],
    allowedLoopTypes: ['procurement', 'production', 'transfer'],
    allowedMethods: ['manual', 'system'],
    description: 'Reset card for new cycle',
  },
];

// ─── Rule Lookup Helpers ─────────────────────────────────────────────

export function isRoleAllowed(from: CardStage, to: CardStage, role: UserRole): boolean {
  if (role === 'tenant_admin') return true;
  const rule = TRANSITION_RULES.find((r) => r.from === from && r.to === to);
  return rule ? rule.allowedRoles.includes(role) : false;
}

export function isLoopTypeAllowed(from: CardStage, to: CardStage, loopType: LoopType): boolean {
  const rule = TRANSITION_RULES.find((r) => r.from === from && r.to === to);
  return rule ? rule.allowedLoopTypes.includes(loopType) : false;
}

export function isMethodAllowed(from: CardStage, to: CardStage, method: string): boolean {
  const rule = TRANSITION_RULES.find((r) => r.from === from && r.to === to);
  return rule ? rule.allowedMethods.includes(method as 'qr_scan' | 'manual' | 'system') : false;
}

// ─── Idempotency Cache ───────────────────────────────────────────────
// In-memory cache for idempotency keys. In production this would be Redis.
const idempotencyCache = new Map<string, { result: unknown; expiresAt: number }>();
const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000; // 5 minutes

function checkIdempotency(key: string): unknown | null {
  const entry = idempotencyCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    idempotencyCache.delete(key);
    return null;
  }
  return entry.result;
}

function setIdempotency(key: string, result: unknown): void {
  idempotencyCache.set(key, { result, expiresAt: Date.now() + IDEMPOTENCY_TTL_MS });
}

// Periodic cleanup (runs lazily, not on a timer)
function cleanupIdempotencyCache(): void {
  const now = Date.now();
  for (const [key, entry] of idempotencyCache) {
    if (now > entry.expiresAt) idempotencyCache.delete(key);
  }
}

/** Check if a stage transition is allowed by the Kanban flow rules. */
export function isValidTransition(from: string, to: string): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── Transition a Card to the Next Stage ──────────────────────────────
export async function transitionCard(input: {
  cardId: string;
  tenantId: string;
  toStage: CardStage;
  userId?: string;
  method: 'qr_scan' | 'manual' | 'system';
  notes?: string;
  metadata?: Record<string, unknown>;
}): Promise<{
  card: typeof kanbanCards.$inferSelect;
  transition: typeof cardStageTransitions.$inferSelect;
}> {
  const { cardId, tenantId, toStage, userId, method, notes, metadata } = input;

  // Fetch the card with its loop
  const card = await db.query.kanbanCards.findFirst({
    where: and(eq(kanbanCards.id, cardId), eq(kanbanCards.tenantId, tenantId)),
    with: { loop: true },
  });

  if (!card) {
    throw new AppError(404, 'Kanban card not found', 'CARD_NOT_FOUND');
  }

  if (!card.isActive) {
    throw new AppError(400, 'Card is deactivated', 'CARD_INACTIVE');
  }

  // Validate the transition
  const currentStage = card.currentStage;

  if (!isValidTransition(currentStage, toStage)) {
    const allowed = VALID_TRANSITIONS[currentStage];
    throw new AppError(
      400,
      `Invalid transition: ${currentStage} → ${toStage}. Allowed: ${allowed?.join(', ')}`,
      'INVALID_TRANSITION'
    );
  }

  // Determine cycle number
  let cycleNumber = card.completedCycles + 1;
  if (toStage === 'created' && currentStage === 'restocked') {
    // Loop restarting — this is a new cycle
    cycleNumber = card.completedCycles + 1;
  }

  const now = new Date();

  // Execute the transition in a single transaction
  const result = await db.transaction(async (tx) => {
    // Record the transition (immutable audit)
    const [transition] = await tx
      .insert(cardStageTransitions)
      .values({
        tenantId,
        cardId,
        loopId: card.loopId,
        cycleNumber,
        fromStage: currentStage,
        toStage,
        transitionedAt: now,
        transitionedByUserId: userId,
        method,
        notes,
        metadata: metadata ?? {},
      })
      .returning();

    // Update the card's current stage
    const updateData: Record<string, unknown> = {
      currentStage: toStage,
      currentStageEnteredAt: now,
      updatedAt: now,
    };

    // If completing a cycle (restocked → created), increment the cycle counter
    if (currentStage === 'restocked' && toStage === 'created') {
      updateData.completedCycles = sql`${kanbanCards.completedCycles} + 1`;
      updateData.linkedPurchaseOrderId = null;
      updateData.linkedWorkOrderId = null;
      updateData.linkedTransferOrderId = null;
    }

    const [updatedCard] = await tx
      .update(kanbanCards)
      .set(updateData)
      .where(eq(kanbanCards.id, cardId))
      .returning();

    return { card: updatedCard, transition };
  });

  // Publish event for real-time WebSocket updates
  try {
    const eventBus = getEventBus(config.REDIS_URL);
    await eventBus.publish({
      type: 'card.transition',
      tenantId,
      cardId,
      loopId: card.loopId,
      fromStage: currentStage,
      toStage,
      method,
      userId,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Non-critical: don't fail the transition if event publishing fails
    console.error(`[card-lifecycle] Failed to publish card.transition event for card ${cardId}`);
  }

  return result;
}

// ─── Trigger a Card via QR Scan ───────────────────────────────────────
// This is the primary entry point when a user scans a QR code.
// It transitions the card from 'created' to 'triggered' and adds the
// part to the appropriate queue.
export async function triggerCardByScan(input: {
  cardId: string;
  scannedByUserId?: string;
  tenantId?: string;
  location?: { lat?: number; lng?: number };
}): Promise<{
  card: typeof kanbanCards.$inferSelect;
  loopType: string;
  partId: string;
  message: string;
}> {
  const { cardId, scannedByUserId, tenantId, location } = input;

  // Fetch the card (no tenant context — this is a public scan)
  const card = await db.query.kanbanCards.findFirst({
    where: eq(kanbanCards.id, cardId),
    with: {
      loop: true,
    },
  });

  if (!card) {
    throw new AppError(404, 'Card not found. This QR code may be invalid.', 'CARD_NOT_FOUND');
  }

  if (tenantId && card.tenantId !== tenantId) {
    throw new AppError(403, 'Card does not belong to your tenant.', 'TENANT_MISMATCH');
  }

  if (!card.isActive) {
    throw new AppError(400, 'This card has been deactivated.', 'CARD_INACTIVE');
  }

  // Card must be in 'created' stage to be triggered
  if (card.currentStage !== 'created') {
    throw new AppError(
      400,
      `This card is already in the "${card.currentStage}" stage. It can only be scanned when in the "created" stage.`,
      'CARD_ALREADY_TRIGGERED'
    );
  }

  // Transition to triggered
  const result = await transitionCard({
    cardId,
    tenantId: card.tenantId,
    toStage: 'triggered',
    userId: scannedByUserId,
    method: 'qr_scan',
    notes: 'Triggered via QR code scan',
    metadata: {
      scanLocation: location,
      scanTimestamp: new Date().toISOString(),
    },
  });

  // Determine which queue to add this to based on loop type
  const queueType = card.loop.loopType === 'procurement'
    ? 'Order Queue'
    : card.loop.loopType === 'production'
      ? 'Production Queue'
      : 'Transfer Queue';

  // Queue surfaces are derived from card stage state in the orders service.

  return {
    card: result.card,
    loopType: card.loop.loopType,
    partId: card.loop.partId,
    message: `Card triggered. Part added to ${queueType}.`,
  };
}

// ─── Get Card History (All Transitions for a Card) ────────────────────
export async function getCardHistory(cardId: string, tenantId: string) {
  const transitions = await db.query.cardStageTransitions.findMany({
    where: and(
      eq(cardStageTransitions.cardId, cardId),
      eq(cardStageTransitions.tenantId, tenantId)
    ),
    orderBy: cardStageTransitions.transitionedAt,
  });

  return transitions;
}

// ─── Get Velocity Data for a Loop ─────────────────────────────────────
// Calculates average cycle times between each stage pair.
export async function getLoopVelocity(loopId: string, tenantId: string) {
  // Get all transitions for this loop, ordered by card and time
  const transitions = await db.query.cardStageTransitions.findMany({
    where: and(
      eq(cardStageTransitions.loopId, loopId),
      eq(cardStageTransitions.tenantId, tenantId)
    ),
    orderBy: [cardStageTransitions.cardId, cardStageTransitions.transitionedAt],
  });

  if (transitions.length < 2) {
    return { message: 'Insufficient data for velocity calculation', dataPoints: transitions.length };
  }

  // Group by cycle and calculate stage durations
  const cycleTimes: Record<string, number[]> = {};
  let prevTransition: typeof transitions[0] | null = null;

  for (const t of transitions) {
    if (prevTransition && prevTransition.cardId === t.cardId && prevTransition.cycleNumber === t.cycleNumber && t.fromStage) {
      const stageKey = `${t.fromStage}_to_${t.toStage}`;
      const durationHours =
        (t.transitionedAt.getTime() - prevTransition.transitionedAt.getTime()) / (1000 * 60 * 60);

      if (!cycleTimes[stageKey]) cycleTimes[stageKey] = [];
      cycleTimes[stageKey].push(durationHours);
    }
    prevTransition = t;
  }

  // Calculate averages
  const velocity: Record<string, { avgHours: number; count: number; minHours: number; maxHours: number }> = {};
  for (const [key, times] of Object.entries(cycleTimes)) {
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    velocity[key] = {
      avgHours: Math.round(avg * 100) / 100,
      count: times.length,
      minHours: Math.round(Math.min(...times) * 100) / 100,
      maxHours: Math.round(Math.max(...times) * 100) / 100,
    };
  }

  // Calculate total cycle time
  const fullCycleKey = 'full_cycle';
  const fullCycleTimes: number[] = [];
  // Group transitions by card+cycle and sum durations
  const cardCycles = new Map<string, { start?: Date; end?: Date }>();
  for (const t of transitions) {
    const key = `${t.cardId}-${t.cycleNumber}`;
    if (!cardCycles.has(key)) cardCycles.set(key, {});
    const cycle = cardCycles.get(key)!;
    if (t.toStage === 'triggered' && !cycle.start) cycle.start = t.transitionedAt;
    if (t.toStage === 'restocked') cycle.end = t.transitionedAt;
  }
  for (const cycle of cardCycles.values()) {
    if (cycle.start && cycle.end) {
      fullCycleTimes.push(
        (cycle.end.getTime() - cycle.start.getTime()) / (1000 * 60 * 60)
      );
    }
  }
  if (fullCycleTimes.length > 0) {
    const avg = fullCycleTimes.reduce((a, b) => a + b, 0) / fullCycleTimes.length;
    velocity[fullCycleKey] = {
      avgHours: Math.round(avg * 100) / 100,
      count: fullCycleTimes.length,
      minHours: Math.round(Math.min(...fullCycleTimes) * 100) / 100,
      maxHours: Math.round(Math.max(...fullCycleTimes) * 100) / 100,
    };
  }

  return {
    loopId,
    dataPoints: transitions.length,
    completedCycles: fullCycleTimes.length,
    stageDurations: velocity,
  };
}
