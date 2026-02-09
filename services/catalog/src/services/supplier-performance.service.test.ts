import { describe, expect, it } from 'vitest';
import {
  calculateLeadTimeDays,
  isOnTimeDelivery,
  calculateLeadTimeVariance,
  computeGrade,
  safeAverage,
} from './supplier-performance.service.js';

// ─── calculateLeadTimeDays ──────────────────────────────────────────
describe('calculateLeadTimeDays', () => {
  it('calculates days between sent and delivered', () => {
    const sent = new Date('2025-06-01T08:00:00Z');
    const delivered = new Date('2025-06-15T14:00:00Z');
    expect(calculateLeadTimeDays(sent, delivered)).toBe(14);
  });

  it('returns 0 for same-day delivery', () => {
    const sent = new Date('2025-06-01T08:00:00Z');
    const delivered = new Date('2025-06-01T16:00:00Z');
    expect(calculateLeadTimeDays(sent, delivered)).toBe(0);
  });

  it('returns null when sentAt is null', () => {
    expect(calculateLeadTimeDays(null, new Date())).toBeNull();
  });

  it('returns null when deliveredAt is null', () => {
    expect(calculateLeadTimeDays(new Date(), null)).toBeNull();
  });

  it('handles month boundaries correctly', () => {
    const sent = new Date('2025-01-29T12:00:00Z');
    const delivered = new Date('2025-02-28T12:00:00Z');
    expect(calculateLeadTimeDays(sent, delivered)).toBe(30);
  });

  it('normalizes to calendar days (ignores time)', () => {
    const sent = new Date('2025-06-01T23:59:00Z');
    const delivered = new Date('2025-06-02T00:01:00Z');
    expect(calculateLeadTimeDays(sent, delivered)).toBe(1);
  });

  it('returns negative for delivered before sent (edge case)', () => {
    const sent = new Date('2025-06-15T12:00:00Z');
    const delivered = new Date('2025-06-10T12:00:00Z');
    expect(calculateLeadTimeDays(sent, delivered)).toBe(-5);
  });
});

// ─── isOnTimeDelivery ───────────────────────────────────────────────
describe('isOnTimeDelivery', () => {
  it('returns true for early delivery', () => {
    const actual = new Date('2025-06-10');
    const expected = new Date('2025-06-15');
    expect(isOnTimeDelivery(actual, expected)).toBe(true);
  });

  it('returns true for on-time delivery (same day)', () => {
    const date = new Date('2025-06-15');
    expect(isOnTimeDelivery(date, date)).toBe(true);
  });

  it('returns false for late delivery', () => {
    const actual = new Date('2025-06-16');
    const expected = new Date('2025-06-15');
    expect(isOnTimeDelivery(actual, expected)).toBe(false);
  });

  it('returns null when actual is null', () => {
    expect(isOnTimeDelivery(null, new Date())).toBeNull();
  });

  it('returns null when expected is null', () => {
    expect(isOnTimeDelivery(new Date(), null)).toBeNull();
  });

  it('normalizes to calendar days (ignores time component)', () => {
    const actual = new Date('2025-06-15T23:59:00Z');
    const expected = new Date('2025-06-15T00:01:00Z');
    expect(isOnTimeDelivery(actual, expected)).toBe(true);
  });
});

// ─── calculateLeadTimeVariance ──────────────────────────────────────
describe('calculateLeadTimeVariance', () => {
  it('returns positive for late delivery', () => {
    const actual = new Date('2025-06-17');
    const expected = new Date('2025-06-15');
    expect(calculateLeadTimeVariance(actual, expected)).toBe(2);
  });

  it('returns negative for early delivery', () => {
    const actual = new Date('2025-06-13');
    const expected = new Date('2025-06-15');
    expect(calculateLeadTimeVariance(actual, expected)).toBe(-2);
  });

  it('returns 0 for on-time delivery', () => {
    const date = new Date('2025-06-15');
    expect(calculateLeadTimeVariance(date, date)).toBe(0);
  });

  it('returns null when either date is null', () => {
    expect(calculateLeadTimeVariance(null, new Date())).toBeNull();
    expect(calculateLeadTimeVariance(new Date(), null)).toBeNull();
  });
});

// ─── computeGrade ───────────────────────────────────────────────────
describe('computeGrade', () => {
  it('returns N/A with fewer than 3 completed POs', () => {
    expect(computeGrade(100, 100, 2)).toBe('N/A');
    expect(computeGrade(100, 100, 0)).toBe('N/A');
  });

  it('returns A for OTD >= 95 and quality >= 98', () => {
    expect(computeGrade(95, 98, 10)).toBe('A');
    expect(computeGrade(100, 100, 5)).toBe('A');
  });

  it('returns B for OTD >= 85 and quality >= 95 (but not A)', () => {
    expect(computeGrade(90, 96, 10)).toBe('B');
    expect(computeGrade(85, 95, 5)).toBe('B');
  });

  it('returns C for OTD >= 70 and quality >= 90 (but not B)', () => {
    expect(computeGrade(75, 92, 10)).toBe('C');
    expect(computeGrade(70, 90, 5)).toBe('C');
  });

  it('returns D when below C thresholds', () => {
    expect(computeGrade(60, 85, 10)).toBe('D');
    expect(computeGrade(50, 80, 5)).toBe('D');
  });

  it('demotes when quality is high but OTD is low', () => {
    expect(computeGrade(60, 100, 10)).toBe('D');
  });

  it('demotes when OTD is high but quality is low', () => {
    expect(computeGrade(100, 85, 10)).toBe('D');
  });

  it('treats null rates as 0', () => {
    expect(computeGrade(null, null, 10)).toBe('D');
    expect(computeGrade(null, 100, 5)).toBe('D');
    expect(computeGrade(100, null, 5)).toBe('D');
  });

  it('respects custom minCompletedPOs', () => {
    expect(computeGrade(100, 100, 1, 1)).toBe('A');
    expect(computeGrade(100, 100, 4, 5)).toBe('N/A');
  });

  // Boundary tests
  it('A boundary: OTD=94.9, quality=98 gives B', () => {
    expect(computeGrade(94.9, 98, 10)).toBe('B');
  });

  it('A boundary: OTD=95, quality=97.9 gives B', () => {
    expect(computeGrade(95, 97.9, 10)).toBe('B');
  });

  it('B boundary: OTD=84.9, quality=95 gives C', () => {
    expect(computeGrade(84.9, 95, 10)).toBe('C');
  });

  it('C boundary: OTD=69.9, quality=90 gives D', () => {
    expect(computeGrade(69.9, 90, 10)).toBe('D');
  });
});

// ─── safeAverage ────────────────────────────────────────────────────
describe('safeAverage', () => {
  it('calculates average of numbers', () => {
    expect(safeAverage([10, 20, 30])).toBe(20);
  });

  it('ignores null values', () => {
    expect(safeAverage([10, null, 30])).toBe(20);
  });

  it('returns null for empty array', () => {
    expect(safeAverage([])).toBeNull();
  });

  it('returns null for all-null array', () => {
    expect(safeAverage([null, null])).toBeNull();
  });

  it('rounds to 2 decimal places', () => {
    expect(safeAverage([1, 2, 3])).toBe(2);
    expect(safeAverage([1, 2])).toBe(1.5);
    expect(safeAverage([1, 1, 2])).toBe(1.33);
  });
});
