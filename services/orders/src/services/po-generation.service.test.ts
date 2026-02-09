import { describe, expect, it } from 'vitest';
import {
  generatePODrafts,
  generateSinglePODraft,
} from './po-generation.service.js';
import { scoreQueueItems, consolidateBySupplier, type QueueItemInput } from './queue-prioritization.service.js';

const NOW = new Date('2025-06-01T12:00:00Z');
const ORDER_DATE = new Date('2025-06-02T00:00:00Z');

function makeQueueInput(overrides: Partial<QueueItemInput> = {}): QueueItemInput {
  return {
    cardId: 'card-1',
    loopId: 'loop-1',
    partId: 'part-1',
    facilityId: 'fac-1',
    supplierId: 'sup-1',
    supplierName: 'Acme Corp',
    partNumber: 'PN-001',
    partName: 'Widget A',
    orderQuantity: 100,
    unitCost: 5.0,
    triggeredAt: new Date('2025-05-31T12:00:00Z'),
    daysOfSupply: 2,
    safetyStockDays: 5,
    statedLeadTimeDays: 14,
    ...overrides,
  };
}

describe('generatePODrafts', () => {
  it('creates one PO per supplier group', () => {
    const items = scoreQueueItems([
      makeQueueInput({ cardId: 'c1', supplierId: 'sup-1' }),
      makeQueueInput({ cardId: 'c2', supplierId: 'sup-2', supplierName: 'Beta Inc' }),
      makeQueueInput({ cardId: 'c3', supplierId: 'sup-1' }),
    ], NOW);

    const groups = consolidateBySupplier(items);
    const result = generatePODrafts(groups, ORDER_DATE);

    expect(result.drafts).toHaveLength(2);
    const sup1Draft = result.drafts.find((d) => d.supplierId === 'sup-1');
    expect(sup1Draft!.lines).toHaveLength(2);
  });

  it('assigns sequential line numbers starting at 1', () => {
    const items = scoreQueueItems([
      makeQueueInput({ cardId: 'c1', supplierId: 'sup-1', partId: 'p1' }),
      makeQueueInput({ cardId: 'c2', supplierId: 'sup-1', partId: 'p2' }),
      makeQueueInput({ cardId: 'c3', supplierId: 'sup-1', partId: 'p3' }),
    ], NOW);

    const groups = consolidateBySupplier(items);
    const result = generatePODrafts(groups, ORDER_DATE);
    const lines = result.drafts[0].lines;

    expect(lines.map((l) => l.lineNumber)).toEqual([1, 2, 3]);
  });

  it('calculates line totals correctly', () => {
    const items = scoreQueueItems([
      makeQueueInput({ cardId: 'c1', orderQuantity: 50, unitCost: 12.50 }),
    ], NOW);

    const groups = consolidateBySupplier(items);
    const result = generatePODrafts(groups, ORDER_DATE);

    expect(result.drafts[0].lines[0].lineTotal).toBe(625);
    expect(result.drafts[0].subtotal).toBe(625);
  });

  it('calculates expected delivery using max lead time', () => {
    const items = scoreQueueItems([
      makeQueueInput({ cardId: 'c1', supplierId: 'sup-1', statedLeadTimeDays: 7 }),
      makeQueueInput({ cardId: 'c2', supplierId: 'sup-1', statedLeadTimeDays: 21 }),
    ], NOW);

    const groups = consolidateBySupplier(items);
    const result = generatePODrafts(groups, ORDER_DATE);

    const expected = new Date(ORDER_DATE);
    expected.setDate(expected.getDate() + 21);
    expect(result.drafts[0].expectedDeliveryDate.toISOString()).toBe(expected.toISOString());
  });

  it('defaults lead time to 14 days when null', () => {
    const items = scoreQueueItems([
      makeQueueInput({ cardId: 'c1', statedLeadTimeDays: null }),
    ], NOW);

    const groups = consolidateBySupplier(items);
    const result = generatePODrafts(groups, ORDER_DATE);

    const expected = new Date(ORDER_DATE);
    expected.setDate(expected.getDate() + 14);
    expect(result.drafts[0].expectedDeliveryDate.toISOString()).toBe(expected.toISOString());
  });

  it('skips items with no supplier', () => {
    const items = scoreQueueItems([
      makeQueueInput({ cardId: 'orphan', supplierId: null }),
    ], NOW);

    const groups = consolidateBySupplier(items);
    const result = generatePODrafts(groups, ORDER_DATE);

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain('No supplier');
  });

  it('skips items with zero order quantity', () => {
    const items = scoreQueueItems([
      makeQueueInput({ cardId: 'zero', orderQuantity: 0 }),
    ], NOW);

    const groups = consolidateBySupplier(items);
    const result = generatePODrafts(groups, ORDER_DATE);

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain('quantity');
  });

  it('tracks source card IDs for audit', () => {
    const items = scoreQueueItems([
      makeQueueInput({ cardId: 'c1', supplierId: 'sup-1' }),
      makeQueueInput({ cardId: 'c2', supplierId: 'sup-1' }),
    ], NOW);

    const groups = consolidateBySupplier(items);
    const result = generatePODrafts(groups, ORDER_DATE);

    expect(result.drafts[0].sourceCardIds).toContain('c1');
    expect(result.drafts[0].sourceCardIds).toContain('c2');
  });

  it('reports total line value across all drafts', () => {
    const items = scoreQueueItems([
      makeQueueInput({ cardId: 'c1', supplierId: 'sup-1', orderQuantity: 10, unitCost: 100 }),
      makeQueueInput({ cardId: 'c2', supplierId: 'sup-2', orderQuantity: 5, unitCost: 200 }),
    ], NOW);

    const groups = consolidateBySupplier(items);
    const result = generatePODrafts(groups, ORDER_DATE);

    expect(result.totalLineValue).toBe(2000); // 1000 + 1000
  });
});

describe('generateSinglePODraft', () => {
  it('returns null for empty items', () => {
    expect(generateSinglePODraft([], ORDER_DATE)).toBeNull();
  });

  it('returns null when first item has no supplier', () => {
    const items = scoreQueueItems([
      makeQueueInput({ supplierId: null }),
    ], NOW);
    expect(generateSinglePODraft(items, ORDER_DATE)).toBeNull();
  });

  it('creates a single PO draft for one supplier', () => {
    const items = scoreQueueItems([
      makeQueueInput({ cardId: 'c1' }),
      makeQueueInput({ cardId: 'c2' }),
    ], NOW);

    const draft = generateSinglePODraft(items, ORDER_DATE);
    expect(draft).not.toBeNull();
    expect(draft!.lines).toHaveLength(2);
    expect(draft!.supplierId).toBe('sup-1');
  });
});
