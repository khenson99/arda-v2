/**
 * Tests for Action Adapters
 *
 * Covers: EmailActionAdapter, URLHandoffAdapter, POCreationAdapter,
 * ShoppingListAdapter — all using injected test doubles.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@arda/config', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import {
  EmailActionAdapter,
  ConsoleEmailBackend,
  renderTemplate,
  URLHandoffAdapter,
  buildSignedUrl,
  verifySignedUrl,
  POCreationAdapter,
  ShoppingListAdapter,
  InMemoryShoppingListPersistence,
  buildGroupKey,
} from './index.js';
import type {
  EmailDeliveryBackend,
  POPersistence,
  POGuardrailChecker,
  POEventPublisher,
  ShoppingListEventPublisher,
} from './index.js';
import type {
  EmailDispatchContext,
  URLHandoffContext,
  PurchaseOrderContext,
  ShoppingListContext,
} from '../types.js';

// ═══════════════════════════════════════════════════════════════════════
// Email Adapter
// ═══════════════════════════════════════════════════════════════════════

describe('EmailActionAdapter', () => {
  let backend: ConsoleEmailBackend;
  let adapter: EmailActionAdapter;

  const ctx: EmailDispatchContext = {
    tenantId: 'T1',
    poId: 'po-123',
    supplierId: 'sup-456',
    supplierEmail: 'vendor@example.com',
    totalAmount: 5000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    backend = new ConsoleEmailBackend();
    adapter = new EmailActionAdapter(backend);
  });

  it('has the name "email_dispatch"', () => {
    expect(adapter.name).toBe('email_dispatch');
  });

  it('dispatches an email with rendered template and returns success', async () => {
    const result = await adapter.execute(ctx);

    expect(result.success).toBe(true);
    expect(result.retryable).toBe(false);
    expect(result.data).toBeDefined();
    expect(result.data!.deliveryStatus).toBe('sent');
    expect(result.data!.templateUsed).toBe('po_confirmation');
    expect(result.data!.messageId).toMatch(/^console-/);
  });

  it('sends to the correct email with interpolated subject', async () => {
    await adapter.execute(ctx);

    expect(backend.sentMessages).toHaveLength(1);
    expect(backend.sentMessages[0].to).toBe('vendor@example.com');
    expect(backend.sentMessages[0].subject).toContain('po-123');
  });

  it('returns retryable on backend failure', async () => {
    const failingBackend: EmailDeliveryBackend = {
      async send() {
        throw new Error('SMTP connection refused');
      },
    };
    const failAdapter = new EmailActionAdapter(failingBackend);
    const result = await failAdapter.execute(ctx);

    expect(result.success).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.error).toBe('SMTP connection refused');
  });

  it('supports the po_followup template key', async () => {
    const followupAdapter = new EmailActionAdapter(backend, 'po_followup');
    const result = await followupAdapter.execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data!.templateUsed).toBe('po_followup');
    expect(backend.sentMessages[0].subject).toContain('Follow-up');
  });
});

describe('renderTemplate', () => {
  it('interpolates variables in subject and body', () => {
    const rendered = renderTemplate('po_confirmation', {
      poNumber: 'PO-001',
      totalAmount: 1234,
    });

    expect(rendered.subject).toBe('Purchase Order PO-001 — Confirmation');
    expect(rendered.bodyText).toContain('PO-001');
    expect(rendered.bodyText).toContain('$1234');
  });

  it('throws on unknown template key', () => {
    expect(() => renderTemplate('nonexistent', {})).toThrow('Unknown email template');
  });

  it('leaves unmatched placeholders as-is', () => {
    const rendered = renderTemplate('po_confirmation', {});
    expect(rendered.subject).toContain('{{poNumber}}');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// URL Handoff Adapter
// ═══════════════════════════════════════════════════════════════════════

describe('URLHandoffAdapter', () => {
  const secret = 'test-secret-key-12345';

  const ctx: URLHandoffContext = {
    tenantId: 'T1',
    targetUrl: 'https://supplier-portal.example.com/approve',
    action: 'approve_po',
    entityType: 'purchase_order',
    entityId: 'po-789',
  };

  let adapter: URLHandoffAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new URLHandoffAdapter({ secret });
  });

  it('has the name "url_handoff"', () => {
    expect(adapter.name).toBe('url_handoff');
  });

  it('generates a signed URL with all required params', async () => {
    const result = await adapter.execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    const url = new URL(result.data!.signedUrl);
    expect(url.searchParams.get('tenant')).toBe('T1');
    expect(url.searchParams.get('entity_type')).toBe('purchase_order');
    expect(url.searchParams.get('entity_id')).toBe('po-789');
    expect(url.searchParams.get('action')).toBe('approve_po');
    expect(url.searchParams.get('sig')).toBeTruthy();
    expect(url.searchParams.get('token')).toBeTruthy();
    expect(url.searchParams.get('expires')).toBeTruthy();
  });

  it('generates a verifiable signed URL', async () => {
    const result = await adapter.execute(ctx);
    const verification = verifySignedUrl(result.data!.signedUrl, secret);

    expect(verification.valid).toBe(true);
    expect(verification.expired).toBe(false);
  });

  it('returns expiresAt and token in the result', async () => {
    const result = await adapter.execute(ctx);
    expect(result.data!.expiresAt).toBeTruthy();
    expect(result.data!.token).toMatch(/^[0-9a-f]{32}$/);
  });

  it('fails for missing targetUrl', async () => {
    const result = await adapter.execute({ ...ctx, targetUrl: '' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Target URL is required');
    expect(result.retryable).toBe(false);
  });

  it('fails for malformed targetUrl', async () => {
    const result = await adapter.execute({ ...ctx, targetUrl: 'not-a-url' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid target URL');
  });

  it('appends custom params to the URL', async () => {
    const result = await adapter.execute({
      ...ctx,
      params: { ref: 'cycle-5', priority: 'high' },
    });

    const url = new URL(result.data!.signedUrl);
    expect(url.searchParams.get('ref')).toBe('cycle-5');
    expect(url.searchParams.get('priority')).toBe('high');
  });
});

describe('buildSignedUrl / verifySignedUrl', () => {
  const secret = 'hmac-test-secret';
  const ctx: URLHandoffContext = {
    tenantId: 'T1',
    targetUrl: 'https://example.com/action',
    action: 'confirm',
    entityType: 'order',
    entityId: 'ord-1',
  };

  it('produces a valid signature that verifies correctly', () => {
    const result = buildSignedUrl(ctx, secret);
    const check = verifySignedUrl(result.signedUrl, secret);
    expect(check.valid).toBe(true);
    expect(check.expired).toBe(false);
  });

  it('detects tampering', () => {
    const result = buildSignedUrl(ctx, secret);
    const tampered = result.signedUrl.replace('T1', 'T2');
    const check = verifySignedUrl(tampered, secret);
    expect(check.valid).toBe(false);
    expect(check.reason).toBe('Invalid signature');
  });

  it('detects wrong secret', () => {
    const result = buildSignedUrl(ctx, secret);
    const check = verifySignedUrl(result.signedUrl, 'wrong-secret');
    expect(check.valid).toBe(false);
  });

  it('respects custom expiry', () => {
    const result = buildSignedUrl({ ...ctx, expiresInSeconds: 3600 }, secret);
    const expiresAt = new Date(result.expiresAt);
    const now = Date.now();
    // Should expire within ~1 hour (±2 seconds tolerance)
    expect(expiresAt.getTime() - now).toBeGreaterThan(3598 * 1000);
    expect(expiresAt.getTime() - now).toBeLessThan(3602 * 1000);
  });

  it('reports missing parameters', () => {
    const check = verifySignedUrl('https://example.com/', secret);
    expect(check.valid).toBe(false);
    expect(check.reason).toBe('Missing required parameters');
  });

  it('handles malformed URL gracefully', () => {
    const check = verifySignedUrl('not a url', secret);
    expect(check.valid).toBe(false);
    expect(check.reason).toBe('Malformed URL');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// PO Creation Adapter
// ═══════════════════════════════════════════════════════════════════════

describe('POCreationAdapter', () => {
  let persistence: POPersistence;
  let guardrails: POGuardrailChecker;
  let events: POEventPublisher;
  let adapter: POCreationAdapter;

  const ctx: PurchaseOrderContext = {
    tenantId: 'T1',
    cardId: 'card-1',
    loopId: 'loop-1',
    partId: 'part-100',
    supplierId: 'sup-200',
    facilityId: 'fac-300',
    orderQuantity: 10,
    totalAmount: 500,
    isExpedited: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    persistence = {
      createPurchaseOrder: vi.fn().mockResolvedValue({ id: 'po-new', poNumber: 'PO-001' }),
      writeAuditLog: vi.fn().mockResolvedValue(undefined),
    };

    guardrails = {
      checkFinancial: vi.fn().mockResolvedValue({ passed: true, violations: [] }),
      recordPOCreated: vi.fn().mockResolvedValue(undefined),
    };

    events = {
      publishPOCreated: vi.fn().mockResolvedValue(undefined),
    };

    adapter = new POCreationAdapter(persistence, guardrails, events);
  });

  it('has the name "po_creation"', () => {
    expect(adapter.name).toBe('po_creation');
  });

  it('creates a PO and returns success with ID and number', async () => {
    const result = await adapter.execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data!.purchaseOrderId).toBe('po-new');
    expect(result.data!.poNumber).toBe('PO-001');
    expect(result.retryable).toBe(false);
  });

  it('calls persistence, audit log, guardrail counters, and events in order', async () => {
    await adapter.execute(ctx);

    expect(guardrails.checkFinancial).toHaveBeenCalledWith(ctx);
    expect(persistence.createPurchaseOrder).toHaveBeenCalledWith(ctx);
    expect(persistence.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'T1',
        entityType: 'purchase_order',
        entityId: 'po-new',
        action: 'automation_created',
      }),
    );
    expect(guardrails.recordPOCreated).toHaveBeenCalledWith('T1', 'sup-200', 500);
    expect(events.publishPOCreated).toHaveBeenCalledWith({
      tenantId: 'T1',
      purchaseOrderId: 'po-new',
      poNumber: 'PO-001',
    });
  });

  it('blocks on financial guardrail violations (not G-08)', async () => {
    (guardrails.checkFinancial as ReturnType<typeof vi.fn>).mockResolvedValue({
      passed: false,
      violations: [
        { guardrailId: 'G-01', description: 'Exceeds single-PO limit' },
        { guardrailId: 'G-08', description: 'Dual approval needed' },
      ],
    });

    const result = await adapter.execute(ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain('G-01');
    expect(result.error).not.toContain('G-08');
    expect(result.retryable).toBe(false);
    // Should NOT have created a PO
    expect(persistence.createPurchaseOrder).not.toHaveBeenCalled();
  });

  it('allows G-08 violations (informational only)', async () => {
    (guardrails.checkFinancial as ReturnType<typeof vi.fn>).mockResolvedValue({
      passed: true,
      violations: [{ guardrailId: 'G-08', description: 'Dual approval needed' }],
    });

    const result = await adapter.execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data!.guardrailViolations).toHaveLength(1);
    expect(result.data!.guardrailViolations[0].guardrailId).toBe('G-08');
  });

  it('returns retryable on persistence failure', async () => {
    (persistence.createPurchaseOrder as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('DB connection lost'),
    );

    const result = await adapter.execute(ctx);

    expect(result.success).toBe(false);
    expect(result.error).toBe('DB connection lost');
    expect(result.retryable).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Shopping List Adapter
// ═══════════════════════════════════════════════════════════════════════

describe('ShoppingListAdapter', () => {
  let persistence: InMemoryShoppingListPersistence;
  let publisher: ShoppingListEventPublisher;
  let adapter: ShoppingListAdapter;

  const ctx: ShoppingListContext = {
    tenantId: 'T1',
    partId: 'part-50',
    quantity: 25,
    supplierId: 'sup-100',
    facilityId: 'fac-200',
    urgency: 'high',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    persistence = new InMemoryShoppingListPersistence();
    publisher = { publishItemAdded: vi.fn().mockResolvedValue(undefined) };
    adapter = new ShoppingListAdapter(persistence, publisher);
  });

  it('has the name "shopping_list"', () => {
    expect(adapter.name).toBe('shopping_list');
  });

  it('persists the item and returns success', async () => {
    const result = await adapter.execute(ctx);

    expect(result.success).toBe(true);
    expect(result.data!.partId).toBe('part-50');
    expect(result.data!.quantity).toBe(25);
    expect(result.data!.urgency).toBe('high');
    expect(result.retryable).toBe(false);
  });

  it('uses correct group key in the result', async () => {
    const result = await adapter.execute(ctx);

    expect(result.data!.groupKey).toBe('sup-100:fac-200:high');
  });

  it('publishes an event with matching fields', async () => {
    await adapter.execute(ctx);

    expect(publisher.publishItemAdded).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'T1',
        partId: 'part-50',
        quantity: 25,
        supplierId: 'sup-100',
        facilityId: 'fac-200',
        urgency: 'high',
        groupKey: 'sup-100:fac-200:high',
      }),
    );
  });

  it('stores the item in in-memory persistence', async () => {
    await adapter.execute(ctx);

    expect(persistence.items).toHaveLength(1);
    expect(persistence.items[0].partId).toBe('part-50');
  });

  it('defaults urgency to "normal" when not provided', async () => {
    const result = await adapter.execute({ ...ctx, urgency: undefined });
    expect(result.data!.urgency).toBe('normal');
  });

  it('returns retryable on failure', async () => {
    const failingPublisher: ShoppingListEventPublisher = {
      async publishItemAdded() {
        throw new Error('Event bus down');
      },
    };
    const failAdapter = new ShoppingListAdapter(persistence, failingPublisher);
    const result = await failAdapter.execute(ctx);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Event bus down');
    expect(result.retryable).toBe(true);
  });
});

describe('buildGroupKey', () => {
  it('joins supplier, facility, and urgency', () => {
    expect(buildGroupKey('sup-1', 'fac-2', 'critical')).toBe('sup-1:fac-2:critical');
  });

  it('defaults missing supplier to "any-supplier"', () => {
    expect(buildGroupKey(undefined, 'fac-2', 'high')).toBe('any-supplier:fac-2:high');
  });

  it('defaults missing facility to "any-facility"', () => {
    expect(buildGroupKey('sup-1', undefined, 'low')).toBe('sup-1:any-facility:low');
  });

  it('defaults urgency to "normal"', () => {
    expect(buildGroupKey('sup-1', 'fac-2')).toBe('sup-1:fac-2:normal');
  });

  it('handles all defaults', () => {
    expect(buildGroupKey()).toBe('any-supplier:any-facility:normal');
  });
});
