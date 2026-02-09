/**
 * PO Generation Pipeline
 *
 * Transforms scored/consolidated queue items into draft Purchase Order
 * data structures ready for persistence. This is a pure transformation
 * layer with no side effects.
 *
 * Business rules:
 *  1. One PO per supplier (items already grouped by consolidation engine).
 *  2. Each line maps to one triggered Kanban card.
 *  3. Expected delivery = order date + max(lead time across all lines).
 *  4. Line numbers are auto-assigned sequentially.
 *  5. Line totals = quantityOrdered * unitCost.
 */

import type { ConsolidationGroup, ScoredQueueItem } from './queue-prioritization.service.js';

// ─── Types ───────────────────────────────────────────────────────────
export interface POLineDraft {
  partId: string;
  kanbanCardId: string;
  lineNumber: number;
  quantityOrdered: number;
  unitCost: number;
  lineTotal: number;
  partNumber: string;
  partName: string;
}

export interface PODraft {
  supplierId: string;
  supplierName: string | null;
  facilityId: string;
  orderDate: Date;
  expectedDeliveryDate: Date;
  currency: string;
  lines: POLineDraft[];
  subtotal: number;
  totalAmount: number;
  /** Source card IDs for audit trail. */
  sourceCardIds: string[];
  /** Metadata for internal notes. */
  generatedFrom: 'queue_consolidation';
}

export interface GenerationResult {
  drafts: PODraft[];
  skipped: SkippedItem[];
  totalLineValue: number;
}

export interface SkippedItem {
  cardId: string;
  reason: string;
}

// ─── Validation ──────────────────────────────────────────────────────

function validateItem(item: ScoredQueueItem): string | null {
  if (!item.supplierId) return 'No supplier assigned';
  if (item.orderQuantity <= 0) return 'Order quantity must be positive';
  if (item.unitCost < 0) return 'Unit cost cannot be negative';
  return null;
}

// ─── Pipeline ────────────────────────────────────────────────────────

/**
 * Generate PO drafts from consolidation groups.
 *
 * @param groups - Supplier-grouped scored queue items (from consolidateBySupplier)
 * @param orderDate - The date to use as the PO order date (defaults to now)
 * @param currency - Currency code (defaults to USD)
 */
export function generatePODrafts(
  groups: ConsolidationGroup[],
  orderDate: Date = new Date(),
  currency: string = 'USD'
): GenerationResult {
  const drafts: PODraft[] = [];
  const skipped: SkippedItem[] = [];
  let totalLineValue = 0;

  for (const group of groups) {
    const validItems: ScoredQueueItem[] = [];

    // Validate each item in the group
    for (const item of group.items) {
      const validationError = validateItem(item);
      if (validationError) {
        skipped.push({ cardId: item.cardId, reason: validationError });
      } else {
        validItems.push(item);
      }
    }

    if (validItems.length === 0) continue;

    const facilityItems = validItems.filter((item) => item.facilityId === group.facilityId);
    const crossFacilityItems = validItems.filter((item) => item.facilityId !== group.facilityId);

    for (const item of crossFacilityItems) {
      skipped.push({
        cardId: item.cardId,
        reason: `Facility mismatch in consolidation group (${item.facilityId} != ${group.facilityId})`,
      });
    }

    if (facilityItems.length === 0) continue;

    // Build PO lines
    const lines: POLineDraft[] = facilityItems.map((item, idx) => {
      const lineTotal = Math.round(item.orderQuantity * item.unitCost * 100) / 100;
      return {
        partId: item.partId,
        kanbanCardId: item.cardId,
        lineNumber: idx + 1,
        quantityOrdered: item.orderQuantity,
        unitCost: item.unitCost,
        lineTotal,
        partNumber: item.partNumber,
        partName: item.partName,
      };
    });

    // Calculate totals
    const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
    const roundedSubtotal = Math.round(subtotal * 100) / 100;

    // Expected delivery = order date + max lead time from all items
    const maxLeadTime = Math.max(
      ...facilityItems.map((item) => item.statedLeadTimeDays ?? 14) // default 14 days
    );
    const expectedDeliveryDate = new Date(orderDate);
    expectedDeliveryDate.setDate(expectedDeliveryDate.getDate() + maxLeadTime);

    const facilityId = group.facilityId;

    drafts.push({
      supplierId: group.supplierId,
      supplierName: group.supplierName,
      facilityId,
      orderDate,
      expectedDeliveryDate,
      currency,
      lines,
      subtotal: roundedSubtotal,
      totalAmount: roundedSubtotal, // tax/shipping added downstream
      sourceCardIds: facilityItems.map((i) => i.cardId),
      generatedFrom: 'queue_consolidation',
    });

    totalLineValue += roundedSubtotal;
  }

  return { drafts, skipped, totalLineValue: Math.round(totalLineValue * 100) / 100 };
}

/**
 * Generate a single PO draft from a list of queue items for one supplier.
 * Convenience wrapper around generatePODrafts for single-supplier use.
 */
export function generateSinglePODraft(
  items: ScoredQueueItem[],
  orderDate: Date = new Date(),
  currency: string = 'USD'
): PODraft | null {
  if (items.length === 0) return null;

  const supplierId = items[0].supplierId;
  const facilityId = items[0].facilityId;
  if (!supplierId) return null;

  if (!items.every((item) => item.supplierId === supplierId && item.facilityId === facilityId)) {
    return null;
  }

  const group: ConsolidationGroup = {
    supplierId,
    supplierName: items[0].supplierName,
    facilityId,
    items,
    totalLineValue: items.reduce((s, i) => s + i.estimatedLineValue, 0),
    highestCriticality: items[0].criticality,
    maxPriorityScore: Math.max(...items.map((i) => i.priorityScore)),
  };

  const result = generatePODrafts([group], orderDate, currency);
  return result.drafts[0] ?? null;
}
