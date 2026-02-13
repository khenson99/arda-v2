/**
 * Tests for the Automation Rule Evaluator
 *
 * Covers: resolveField, evaluateCondition (all 10 operators),
 * evaluateRules (deny-first, priority, no-match), buildIdempotencyKey,
 * and loadActiveRules.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock the logger so tests don't emit noisy output
vi.mock('@arda/config', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import {
  resolveField,
  evaluateCondition,
  evaluateRules,
  buildIdempotencyKey,
  loadActiveRules,
} from './rule-evaluator.js';
import type { AutomationCondition, AutomationRule } from './types.js';

// ─── resolveField ────────────────────────────────────────────────────

describe('resolveField', () => {
  it('resolves top-level fields', () => {
    expect(resolveField({ name: 'test' }, 'name')).toBe('test');
  });

  it('resolves nested dot-path fields', () => {
    const ctx = { order: { totalAmount: 500 } };
    expect(resolveField(ctx, 'order.totalAmount')).toBe(500);
  });

  it('resolves deeply nested fields', () => {
    const ctx = { a: { b: { c: { d: 42 } } } };
    expect(resolveField(ctx, 'a.b.c.d')).toBe(42);
  });

  it('returns undefined for missing paths', () => {
    expect(resolveField({ name: 'test' }, 'missing.path')).toBeUndefined();
  });

  it('returns undefined when traversing a null value', () => {
    const ctx = { order: null };
    expect(resolveField(ctx as any, 'order.amount')).toBeUndefined();
  });

  it('returns undefined when traversing a primitive', () => {
    const ctx = { count: 5 };
    expect(resolveField(ctx, 'count.nested')).toBeUndefined();
  });
});

// ─── evaluateCondition — all 10 operators ────────────────────────────

describe('evaluateCondition', () => {
  const ctx = {
    card: { currentStage: 'triggered', isActive: true },
    loop: { loopType: 'procurement', isActive: true },
    order: { totalAmount: 5000 },
    supplier: { isBlacklisted: false, country: 'US' },
    po: { sentToEmail: 'vendor@example.com' },
    tags: ['urgent', 'priority'],
  };

  // eq
  it('eq: matches equal values', () => {
    const cond: AutomationCondition = { field: 'card.currentStage', operator: 'eq', value: 'triggered' };
    expect(evaluateCondition(cond, ctx)).toBe(true);
  });

  it('eq: rejects unequal values', () => {
    const cond: AutomationCondition = { field: 'card.currentStage', operator: 'eq', value: 'ordered' };
    expect(evaluateCondition(cond, ctx)).toBe(false);
  });

  // neq
  it('neq: matches unequal values', () => {
    const cond: AutomationCondition = { field: 'card.currentStage', operator: 'neq', value: 'ordered' };
    expect(evaluateCondition(cond, ctx)).toBe(true);
  });

  it('neq: rejects equal values', () => {
    const cond: AutomationCondition = { field: 'card.currentStage', operator: 'neq', value: 'triggered' };
    expect(evaluateCondition(cond, ctx)).toBe(false);
  });

  // gt
  it('gt: matches when field > value', () => {
    const cond: AutomationCondition = { field: 'order.totalAmount', operator: 'gt', value: 4999 };
    expect(evaluateCondition(cond, ctx)).toBe(true);
  });

  it('gt: rejects when field <= value', () => {
    const cond: AutomationCondition = { field: 'order.totalAmount', operator: 'gt', value: 5000 };
    expect(evaluateCondition(cond, ctx)).toBe(false);
  });

  // gte
  it('gte: matches when field >= value', () => {
    const cond: AutomationCondition = { field: 'order.totalAmount', operator: 'gte', value: 5000 };
    expect(evaluateCondition(cond, ctx)).toBe(true);
  });

  it('gte: rejects when field < value', () => {
    const cond: AutomationCondition = { field: 'order.totalAmount', operator: 'gte', value: 5001 };
    expect(evaluateCondition(cond, ctx)).toBe(false);
  });

  // lt
  it('lt: matches when field < value', () => {
    const cond: AutomationCondition = { field: 'order.totalAmount', operator: 'lt', value: 5001 };
    expect(evaluateCondition(cond, ctx)).toBe(true);
  });

  it('lt: rejects when field >= value', () => {
    const cond: AutomationCondition = { field: 'order.totalAmount', operator: 'lt', value: 5000 };
    expect(evaluateCondition(cond, ctx)).toBe(false);
  });

  // lte
  it('lte: matches when field <= value', () => {
    const cond: AutomationCondition = { field: 'order.totalAmount', operator: 'lte', value: 5000 };
    expect(evaluateCondition(cond, ctx)).toBe(true);
  });

  it('lte: rejects when field > value', () => {
    const cond: AutomationCondition = { field: 'order.totalAmount', operator: 'lte', value: 4999 };
    expect(evaluateCondition(cond, ctx)).toBe(false);
  });

  // in
  it('in: matches when field value is in the array', () => {
    const cond: AutomationCondition = {
      field: 'loop.loopType',
      operator: 'in',
      value: ['procurement', 'production', 'transfer'],
    };
    expect(evaluateCondition(cond, ctx)).toBe(true);
  });

  it('in: rejects when field value is not in the array', () => {
    const cond: AutomationCondition = {
      field: 'loop.loopType',
      operator: 'in',
      value: ['production', 'transfer'],
    };
    expect(evaluateCondition(cond, ctx)).toBe(false);
  });

  // not_in
  it('not_in: matches when field value is not in the array', () => {
    const cond: AutomationCondition = {
      field: 'loop.loopType',
      operator: 'not_in',
      value: ['production', 'transfer'],
    };
    expect(evaluateCondition(cond, ctx)).toBe(true);
  });

  it('not_in: rejects when field value is in the array', () => {
    const cond: AutomationCondition = {
      field: 'loop.loopType',
      operator: 'not_in',
      value: ['procurement', 'production'],
    };
    expect(evaluateCondition(cond, ctx)).toBe(false);
  });

  // exists
  it('exists(true): matches when field is present', () => {
    const cond: AutomationCondition = { field: 'po.sentToEmail', operator: 'exists', value: true };
    expect(evaluateCondition(cond, ctx)).toBe(true);
  });

  it('exists(true): rejects when field is missing', () => {
    const cond: AutomationCondition = { field: 'missing.field', operator: 'exists', value: true };
    expect(evaluateCondition(cond, ctx)).toBe(false);
  });

  it('exists(false): matches when field is missing', () => {
    const cond: AutomationCondition = { field: 'missing.field', operator: 'exists', value: false };
    expect(evaluateCondition(cond, ctx)).toBe(true);
  });

  it('exists(false): rejects when field is present', () => {
    const cond: AutomationCondition = { field: 'po.sentToEmail', operator: 'exists', value: false };
    expect(evaluateCondition(cond, ctx)).toBe(false);
  });

  // regex
  it('regex: matches when field matches pattern', () => {
    const cond: AutomationCondition = { field: 'supplier.country', operator: 'regex', value: '^U[SK]$' };
    expect(evaluateCondition(cond, ctx)).toBe(true);
  });

  it('regex: rejects when field does not match pattern', () => {
    const cond: AutomationCondition = { field: 'supplier.country', operator: 'regex', value: '^CA$' };
    expect(evaluateCondition(cond, ctx)).toBe(false);
  });

  it('regex: returns false for non-string field', () => {
    const cond: AutomationCondition = { field: 'order.totalAmount', operator: 'regex', value: '\\d+' };
    expect(evaluateCondition(cond, ctx)).toBe(false);
  });

  // gt with non-numeric types
  it('gt: returns false for non-numeric comparisons', () => {
    const cond: AutomationCondition = { field: 'card.currentStage', operator: 'gt', value: 'abc' };
    expect(evaluateCondition(cond, ctx)).toBe(false);
  });
});

// ─── evaluateRules ────────────────────────────────────────────────────

describe('evaluateRules', () => {
  const triggerEvent = 'card.stage.triggered';

  const makeRule = (overrides: Partial<AutomationRule>): AutomationRule => ({
    id: 'TEST-01',
    name: 'Test Rule',
    description: 'test',
    ruleType: 'allow',
    category: 'po_creation',
    trigger: { event: triggerEvent, sourceEntity: 'kanban_card' },
    conditions: [{ field: 'card.currentStage', operator: 'eq', value: 'triggered' }],
    action: { type: 'create_purchase_order', params: {}, idempotencyKeyTemplate: '', timeoutMs: 0 },
    approval: { required: false, strategy: 'auto_approve' },
    fallback: { onConditionFail: 'skip', onActionFail: 'retry', maxRetries: 3, retryDelayMs: 1000, retryBackoffMultiplier: 2 },
    isActive: true,
    priority: 10,
    tenantConfigurable: true,
    ...overrides,
  });

  const baseContext = {
    card: { currentStage: 'triggered', isActive: true },
    loop: { loopType: 'procurement', isActive: true },
  };

  it('allows when an allow rule matches and no deny rules match', () => {
    const rules = [makeRule({ id: 'A-01', ruleType: 'allow' })];
    const result = evaluateRules(rules, triggerEvent, baseContext);
    expect(result.allowed).toBe(true);
    expect(result.matchedAllowRule?.id).toBe('A-01');
  });

  it('denies when a deny rule matches', () => {
    const rules = [
      makeRule({ id: 'A-01', ruleType: 'allow' }),
      makeRule({
        id: 'D-01',
        ruleType: 'deny',
        priority: 1,
        conditions: [{ field: 'loop.isActive', operator: 'eq', value: true }],
      }),
    ];
    const result = evaluateRules(rules, triggerEvent, baseContext);
    expect(result.allowed).toBe(false);
    expect(result.deniedByRule?.id).toBe('D-01');
  });

  it('denies when no allow rules match (default deny)', () => {
    const rules = [
      makeRule({
        id: 'A-01',
        ruleType: 'allow',
        conditions: [{ field: 'card.currentStage', operator: 'eq', value: 'ordered' }], // won't match
      }),
    ];
    const result = evaluateRules(rules, triggerEvent, baseContext);
    expect(result.allowed).toBe(false);
    expect(result.deniedByRule).toBeUndefined();
    expect(result.evaluation.allowMatches).toBe(0);
  });

  it('ignores rules for a different trigger event', () => {
    const rules = [
      makeRule({ id: 'A-01', trigger: { event: 'po.status.approved', sourceEntity: 'purchase_order' } }),
    ];
    const result = evaluateRules(rules, triggerEvent, baseContext);
    expect(result.allowed).toBe(false);
    expect(result.evaluation.totalRulesEvaluated).toBe(0);
  });

  it('selects the lowest priority allow rule when multiple match', () => {
    const rules = [
      makeRule({ id: 'A-HI', ruleType: 'allow', priority: 20 }),
      makeRule({ id: 'A-LO', ruleType: 'allow', priority: 5 }),
    ];
    const result = evaluateRules(rules, triggerEvent, baseContext);
    expect(result.allowed).toBe(true);
    expect(result.matchedAllowRule?.id).toBe('A-LO');
  });

  it('prefers the rule with more conditions at same priority', () => {
    const rules = [
      makeRule({
        id: 'A-SPECIFIC',
        ruleType: 'allow',
        priority: 10,
        conditions: [
          { field: 'card.currentStage', operator: 'eq', value: 'triggered' },
          { field: 'loop.loopType', operator: 'eq', value: 'procurement' },
        ],
      }),
      makeRule({
        id: 'A-GENERIC',
        ruleType: 'allow',
        priority: 10,
        conditions: [{ field: 'card.currentStage', operator: 'eq', value: 'triggered' }],
      }),
    ];
    const result = evaluateRules(rules, triggerEvent, baseContext);
    expect(result.allowed).toBe(true);
    expect(result.matchedAllowRule?.id).toBe('A-SPECIFIC');
  });

  it('skips rules whose conditions do not all pass', () => {
    const rules = [
      makeRule({
        id: 'A-01',
        ruleType: 'allow',
        conditions: [
          { field: 'card.currentStage', operator: 'eq', value: 'triggered' },
          { field: 'card.currentStage', operator: 'eq', value: 'ordered' }, // fails
        ],
      }),
    ];
    const result = evaluateRules(rules, triggerEvent, baseContext);
    expect(result.allowed).toBe(false);
  });
});

// ─── buildIdempotencyKey ──────────────────────────────────────────────

describe('buildIdempotencyKey', () => {
  it('substitutes template placeholders from context', () => {
    const key = buildIdempotencyKey('create_purchase_order', {
      tenantId: 'T1',
      supplierId: 'S1',
      facilityId: 'F1',
    }, 'po_create:{{tenantId}}:{{supplierId}}:{{facilityId}}:{{date}}');

    expect(key).toContain('po_create:T1:S1:F1:');
    // The date portion should be YYYY-MM-DD
    const datePart = key.split(':').pop()!;
    expect(datePart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('uses "unknown" for missing context fields', () => {
    const key = buildIdempotencyKey('create_purchase_order', {
      tenantId: 'T1',
    }, 'po_create:{{tenantId}}:{{missingField}}');

    expect(key).toBe('po_create:T1:unknown');
  });

  it('generates a fallback key when no template is given', () => {
    const key = buildIdempotencyKey('dispatch_email', { tenantId: 'T1' });
    expect(key).toMatch(/^dispatch_email:T1:\d{4}-\d{2}-\d{2}T\d{2}$/);
  });

  it('generates fallback key with "unknown" tenant when tenantId is missing', () => {
    const key = buildIdempotencyKey('escalate', {});
    expect(key).toMatch(/^escalate:unknown:/);
  });
});

// ─── loadActiveRules ──────────────────────────────────────────────────

describe('loadActiveRules', () => {
  it('returns all active seed rules when no category filter', () => {
    const rules = loadActiveRules('any-tenant');
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.every((r) => r.isActive)).toBe(true);
  });

  it('filters by category', () => {
    const poRules = loadActiveRules('any-tenant', 'po_creation');
    expect(poRules.every((r) => r.category === 'po_creation')).toBe(true);
    expect(poRules.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty array for a category with no rules', () => {
    const rules = loadActiveRules('any-tenant', 'shopping_list');
    expect(rules).toEqual([]);
  });
});
