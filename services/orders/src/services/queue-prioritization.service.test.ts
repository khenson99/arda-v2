import { describe, expect, it } from 'vitest';
import {
  calculateCriticality,
  calculateAgeHours,
  calculatePriorityScore,
  scoreQueueItems,
  consolidateBySupplier,
  type QueueItemInput,
} from './queue-prioritization.service.js';

// ─── calculateCriticality ────────────────────────────────────────────
describe('calculateCriticality', () => {
  it('returns medium when daysOfSupply is null', () => {
    expect(calculateCriticality(null, 5)).toBe('medium');
  });

  it('returns medium when safetyStockDays is 0', () => {
    expect(calculateCriticality(3, 0)).toBe('medium');
  });

  it('returns critical when daysOfSupply is 0', () => {
    expect(calculateCriticality(0, 5)).toBe('critical');
  });

  it('returns critical when ratio <= 0.5', () => {
    expect(calculateCriticality(2, 5)).toBe('critical');
    expect(calculateCriticality(2.5, 5)).toBe('critical');
  });

  it('returns high when ratio is between 0.5 and 1.0', () => {
    expect(calculateCriticality(3, 5)).toBe('high');
    expect(calculateCriticality(5, 5)).toBe('high');
  });

  it('returns medium when ratio is between 1.0 and 2.0', () => {
    expect(calculateCriticality(6, 5)).toBe('medium');
    expect(calculateCriticality(10, 5)).toBe('medium');
  });

  it('returns low when ratio > 2.0', () => {
    expect(calculateCriticality(11, 5)).toBe('low');
  });
});

// ─── calculateAgeHours ──────────────────────────────────────────────
describe('calculateAgeHours', () => {
  it('calculates hours between two dates', () => {
    const triggered = new Date('2025-01-01T00:00:00Z');
    const now = new Date('2025-01-01T06:00:00Z');
    expect(calculateAgeHours(triggered, now)).toBe(6);
  });

  it('returns 0 when triggered is in the future', () => {
    const triggered = new Date('2025-01-02T00:00:00Z');
    const now = new Date('2025-01-01T00:00:00Z');
    expect(calculateAgeHours(triggered, now)).toBe(0);
  });

  it('handles fractional hours', () => {
    const triggered = new Date('2025-01-01T00:00:00Z');
    const now = new Date('2025-01-01T01:30:00Z');
    expect(calculateAgeHours(triggered, now)).toBe(1.5);
  });
});

// ─── calculatePriorityScore ─────────────────────────────────────────
describe('calculatePriorityScore', () => {
  it('gives highest score to critical + old + high-value + long lead time', () => {
    const score = calculatePriorityScore('critical', 72, 50_000, 90);
    expect(score).toBe(100);
  });

  it('gives lowest score to low criticality with no age/value/lead time', () => {
    const score = calculatePriorityScore('low', 0, 0, 0);
    expect(score).toBe(12.5);
  });

  it('caps age at 72 hours', () => {
    const at72 = calculatePriorityScore('medium', 72, 0, 0);
    const at200 = calculatePriorityScore('medium', 200, 0, 0);
    expect(at72).toBe(at200);
  });

  it('caps value at $50,000', () => {
    const at50k = calculatePriorityScore('medium', 0, 50_000, 0);
    const at1M = calculatePriorityScore('medium', 0, 1_000_000, 0);
    expect(at50k).toBe(at1M);
  });

  it('treats null lead time as 0', () => {
    const noLT = calculatePriorityScore('medium', 0, 0, null);
    const zeroLT = calculatePriorityScore('medium', 0, 0, 0);
    expect(noLT).toBe(zeroLT);
  });
});

// ─── scoreQueueItems ────────────────────────────────────────────────
describe('scoreQueueItems', () => {
  const now = new Date('2025-06-01T12:00:00Z');

  function makeItem(overrides: Partial<QueueItemInput> = {}): QueueItemInput {
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
      triggeredAt: new Date('2025-05-31T12:00:00Z'), // 24h ago
      daysOfSupply: 2,
      safetyStockDays: 5,
      statedLeadTimeDays: 14,
      ...overrides,
    };
  }

  it('returns items sorted by priority score descending', () => {
    const items = [
      makeItem({ cardId: 'low', daysOfSupply: 15, safetyStockDays: 5 }),
      makeItem({ cardId: 'critical', daysOfSupply: 0, safetyStockDays: 5 }),
      makeItem({ cardId: 'medium', daysOfSupply: 7, safetyStockDays: 5 }),
    ];

    const scored = scoreQueueItems(items, now);
    expect(scored[0].cardId).toBe('critical');
    expect(scored[scored.length - 1].cardId).toBe('low');
  });

  it('populates all derived fields', () => {
    const scored = scoreQueueItems([makeItem()], now);
    expect(scored[0]).toHaveProperty('criticality');
    expect(scored[0]).toHaveProperty('priorityScore');
    expect(scored[0]).toHaveProperty('ageHours');
    expect(scored[0]).toHaveProperty('estimatedLineValue');
    expect(scored[0].estimatedLineValue).toBe(500);
  });
});

// ─── consolidateBySupplier ──────────────────────────────────────────
describe('consolidateBySupplier', () => {
  const now = new Date('2025-06-01T12:00:00Z');

  function makeScoredItem(overrides: Partial<QueueItemInput> = {}) {
    const items = scoreQueueItems([{
      cardId: 'card-1',
      loopId: 'loop-1',
      partId: 'part-1',
      facilityId: 'fac-1',
      supplierId: 'sup-1',
      supplierName: 'Acme Corp',
      partNumber: 'PN-001',
      partName: 'Widget A',
      orderQuantity: 100,
      unitCost: 10,
      triggeredAt: new Date('2025-05-31T12:00:00Z'),
      daysOfSupply: 2,
      safetyStockDays: 5,
      statedLeadTimeDays: 14,
      ...overrides,
    }], now);
    return items[0];
  }

  it('groups items by supplierId', () => {
    const items = [
      makeScoredItem({ cardId: 'a', supplierId: 'sup-1' }),
      makeScoredItem({ cardId: 'b', supplierId: 'sup-2' }),
      makeScoredItem({ cardId: 'c', supplierId: 'sup-1' }),
    ];

    const groups = consolidateBySupplier(items);
    const sup1 = groups.find((g) => g.supplierId === 'sup-1');
    expect(sup1).toBeDefined();
    expect(sup1!.items).toHaveLength(2);
  });

  it('isolates items with no supplierId', () => {
    const items = [
      makeScoredItem({ cardId: 'orphan-1', supplierId: null }),
      makeScoredItem({ cardId: 'orphan-2', supplierId: null }),
    ];

    const groups = consolidateBySupplier(items);
    expect(groups).toHaveLength(2); // each orphan in its own group
  });

  it('tracks highest criticality and max priority per group', () => {
    const items = [
      makeScoredItem({ cardId: 'a', supplierId: 'sup-1', daysOfSupply: 10 }), // low
      makeScoredItem({ cardId: 'b', supplierId: 'sup-1', daysOfSupply: 0 }),  // critical
    ];

    const groups = consolidateBySupplier(items);
    expect(groups[0].highestCriticality).toBe('critical');
  });
});
