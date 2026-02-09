/**
 * Queue Prioritization & Supplier Consolidation Engine
 *
 * Pure-function scoring of triggered Kanban cards waiting in the procurement queue.
 * Scoring is deterministic and side-effect-free so it can be unit-tested without
 * database mocks.
 *
 * Priorities:
 *  1. Criticality — how close is the part to stockout?
 *  2. Age — how long has the card been sitting in 'triggered' stage?
 *  3. Order value — higher-value orders may warrant faster processing.
 *  4. Supplier consolidation — grouping items for the same supplier reduces PO count.
 */

// ─── Types ───────────────────────────────────────────────────────────
export type CriticalityLevel = 'critical' | 'high' | 'medium' | 'low';

export interface QueueItemInput {
  cardId: string;
  loopId: string;
  partId: string;
  facilityId: string;
  supplierId: string | null;
  supplierName: string | null;
  partNumber: string;
  partName: string;
  orderQuantity: number;
  unitCost: number;
  triggeredAt: Date;
  daysOfSupply: number | null;
  safetyStockDays: number;
  statedLeadTimeDays: number | null;
}

export interface ScoredQueueItem extends QueueItemInput {
  criticality: CriticalityLevel;
  priorityScore: number;
  ageHours: number;
  estimatedLineValue: number;
}

export interface ConsolidationGroup {
  supplierId: string;
  supplierName: string | null;
  facilityId: string;
  items: ScoredQueueItem[];
  totalLineValue: number;
  highestCriticality: CriticalityLevel;
  maxPriorityScore: number;
}

// ─── Scoring Weights ─────────────────────────────────────────────────
const WEIGHTS = {
  criticality: 50,  // 0-50 points
  age: 30,           // 0-30 points
  value: 10,         // 0-10 points
  leadTime: 10,      // 0-10 points
} as const;

const CRITICALITY_RANK: Record<CriticalityLevel, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

// ─── Pure Scoring Functions ──────────────────────────────────────────

/**
 * Determine criticality based on days-of-supply vs safety stock buffer.
 *
 * If we don't know days of supply, assume medium — the card was triggered so
 * it's at least at the reorder point.
 */
export function calculateCriticality(
  daysOfSupply: number | null,
  safetyStockDays: number
): CriticalityLevel {
  if (daysOfSupply === null || safetyStockDays <= 0) return 'medium';

  const ratio = daysOfSupply / safetyStockDays;

  if (ratio <= 0.0) return 'critical';  // already at or past zero
  if (ratio <= 0.5) return 'critical';  // less than half safety stock left
  if (ratio <= 1.0) return 'high';      // within safety stock window
  if (ratio <= 2.0) return 'medium';    // still above safety but triggered
  return 'low';                          // comfortable buffer
}

/**
 * How many hours has this card been in the 'triggered' stage?
 */
export function calculateAgeHours(triggeredAt: Date, now: Date): number {
  const ms = now.getTime() - triggeredAt.getTime();
  return Math.max(0, ms / (1000 * 60 * 60));
}

/**
 * Calculate normalized priority score (0-100).
 *
 * Components:
 *  - criticality: maps level to 0-50 range
 *  - age: capped at 72h, mapped to 0-30 range
 *  - value: log-scaled, capped at $50k, mapped to 0-10 range
 *  - lead time: longer lead time = more urgency, capped at 90 days, mapped 0-10
 */
export function calculatePriorityScore(
  criticality: CriticalityLevel,
  ageHours: number,
  estimatedLineValue: number,
  statedLeadTimeDays: number | null
): number {
  // Criticality component: 0-50
  const critScore = (CRITICALITY_RANK[criticality] / 4) * WEIGHTS.criticality;

  // Age component: 0-30 (capped at 72 hours)
  const ageNormalized = Math.min(ageHours / 72, 1);
  const ageScore = ageNormalized * WEIGHTS.age;

  // Value component: 0-10 (log scale, capped at $50,000)
  const valueCapped = Math.min(estimatedLineValue, 50_000);
  const valueNormalized = valueCapped > 0 ? Math.log10(valueCapped + 1) / Math.log10(50_001) : 0;
  const valueScore = valueNormalized * WEIGHTS.value;

  // Lead time component: 0-10 (longer lead time = higher priority)
  const ltDays = statedLeadTimeDays ?? 0;
  const ltNormalized = Math.min(ltDays / 90, 1);
  const ltScore = ltNormalized * WEIGHTS.leadTime;

  return Math.round((critScore + ageScore + valueScore + ltScore) * 100) / 100;
}

/**
 * Score a batch of queue items. Pure function, no side effects.
 */
export function scoreQueueItems(
  items: QueueItemInput[],
  now: Date = new Date()
): ScoredQueueItem[] {
  return items
    .map((item) => {
      const criticality = calculateCriticality(item.daysOfSupply, item.safetyStockDays);
      const ageHours = calculateAgeHours(item.triggeredAt, now);
      const estimatedLineValue = item.orderQuantity * item.unitCost;
      const priorityScore = calculatePriorityScore(
        criticality,
        ageHours,
        estimatedLineValue,
        item.statedLeadTimeDays
      );

      return {
        ...item,
        criticality,
        priorityScore,
        ageHours: Math.round(ageHours * 100) / 100,
        estimatedLineValue: Math.round(estimatedLineValue * 100) / 100,
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore);
}

/**
 * Group scored items by supplier for PO consolidation.
 *
 * Items without a supplier are each placed in their own group (no consolidation
 * possible). Within each group, items are already priority-sorted.
 */
export function consolidateBySupplier(items: ScoredQueueItem[]): ConsolidationGroup[] {
  const groups = new Map<string, ConsolidationGroup>();
  const orphans: ConsolidationGroup[] = [];

  for (const item of items) {
    if (!item.supplierId) {
      orphans.push({
        supplierId: `unassigned-${item.cardId}`,
        supplierName: null,
        facilityId: item.facilityId,
        items: [item],
        totalLineValue: item.estimatedLineValue,
        highestCriticality: item.criticality,
        maxPriorityScore: item.priorityScore,
      });
      continue;
    }

    const groupKey = `${item.supplierId}:${item.facilityId}`;
    const existing = groups.get(groupKey);
    if (existing) {
      existing.items.push(item);
      existing.totalLineValue += item.estimatedLineValue;
      if (CRITICALITY_RANK[item.criticality] > CRITICALITY_RANK[existing.highestCriticality]) {
        existing.highestCriticality = item.criticality;
      }
      if (item.priorityScore > existing.maxPriorityScore) {
        existing.maxPriorityScore = item.priorityScore;
      }
    } else {
      groups.set(groupKey, {
        supplierId: item.supplierId,
        supplierName: item.supplierName,
        facilityId: item.facilityId,
        items: [item],
        totalLineValue: item.estimatedLineValue,
        highestCriticality: item.criticality,
        maxPriorityScore: item.priorityScore,
      });
    }
  }

  // Sort groups by max priority score descending
  const allGroups = [...groups.values(), ...orphans];
  allGroups.sort((a, b) => b.maxPriorityScore - a.maxPriorityScore);

  return allGroups;
}
