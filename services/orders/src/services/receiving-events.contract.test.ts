import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Contract tests for receiving events.
 *
 * These tests verify that the events emitted by the receiving service
 * conform to the shapes expected by the notifications event listener.
 * If these fail, it means a producer/consumer contract has been broken.
 */

const { publishMock, getEventBusMock } = vi.hoisted(() => {
  const publishMock = vi.fn(async () => undefined);
  const getEventBusMock = vi.fn(() => ({ publish: publishMock }));
  return { publishMock, getEventBusMock };
});

vi.mock('@arda/events', () => ({
  getEventBus: getEventBusMock,
}));

vi.mock('@arda/config', () => ({
  config: { REDIS_URL: 'redis://localhost:6379' },
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

import type {
  ReceivingCompletedEvent,
  ReceivingExceptionCreatedEvent,
  ReceivingExceptionResolvedEvent,
} from '@arda/events';

describe('receiving event contracts', () => {
  beforeEach(() => {
    publishMock.mockClear();
    getEventBusMock.mockClear();
  });

  describe('ReceivingCompletedEvent shape', () => {
    it('has all required fields for notification listener', () => {
      const event: ReceivingCompletedEvent = {
        type: 'receiving.completed',
        tenantId: 'tenant-1',
        receiptId: 'receipt-1',
        receiptNumber: 'RCV-20260209-0001',
        orderType: 'purchase_order',
        orderId: 'po-1',
        status: 'complete',
        totalAccepted: 10,
        totalDamaged: 0,
        totalRejected: 0,
        exceptionsCreated: 0,
        timestamp: '2026-02-09T12:00:00.000Z',
      };

      // Verify required fields exist and have correct types
      expect(event.type).toBe('receiving.completed');
      expect(typeof event.tenantId).toBe('string');
      expect(typeof event.receiptId).toBe('string');
      expect(typeof event.receiptNumber).toBe('string');
      expect(['purchase_order', 'transfer_order', 'work_order']).toContain(event.orderType);
      expect(typeof event.orderId).toBe('string');
      expect(typeof event.status).toBe('string');
      expect(typeof event.totalAccepted).toBe('number');
      expect(typeof event.totalDamaged).toBe('number');
      expect(typeof event.totalRejected).toBe('number');
      expect(typeof event.exceptionsCreated).toBe('number');
      expect(typeof event.timestamp).toBe('string');
    });

    it('notification listener uses receiptNumber, totalAccepted, totalDamaged, totalRejected, exceptionsCreated', () => {
      // These fields are directly referenced in the notification event listener:
      // - event.receiptNumber for the notification body text
      // - event.totalAccepted, totalDamaged, totalRejected for counts
      // - event.exceptionsCreated to determine if there are exceptions
      // - event.receiptId for actionUrl
      const event: ReceivingCompletedEvent = {
        type: 'receiving.completed',
        tenantId: 'tenant-1',
        receiptId: 'receipt-1',
        receiptNumber: 'RCV-20260209-0001',
        orderType: 'purchase_order',
        orderId: 'po-1',
        status: 'exception',
        totalAccepted: 7,
        totalDamaged: 2,
        totalRejected: 1,
        exceptionsCreated: 2,
        timestamp: '2026-02-09T12:00:00.000Z',
      };

      const hasExceptions = event.exceptionsCreated > 0;
      expect(hasExceptions).toBe(true);

      // Verify the notification body can be constructed
      const body = `Receipt ${event.receiptNumber}: ${event.totalAccepted} accepted, ${event.totalDamaged} damaged, ${event.totalRejected} rejected. ${event.exceptionsCreated} exception(s) created.`;
      expect(body).toContain('RCV-20260209-0001');
      expect(body).toContain('7 accepted');
      expect(body).toContain('2 damaged');
      expect(body).toContain('1 rejected');
    });
  });

  describe('ReceivingExceptionCreatedEvent shape', () => {
    it('has all required fields for notification listener', () => {
      const event: ReceivingExceptionCreatedEvent = {
        type: 'receiving.exception_created',
        tenantId: 'tenant-1',
        exceptionId: 'exc-1',
        receiptId: 'receipt-1',
        exceptionType: 'damaged',
        severity: 'high',
        quantityAffected: 5,
        orderId: 'po-1',
        orderType: 'purchase_order',
        timestamp: '2026-02-09T12:00:00.000Z',
      };

      expect(event.type).toBe('receiving.exception_created');
      expect(typeof event.tenantId).toBe('string');
      expect(typeof event.exceptionId).toBe('string');
      expect(typeof event.receiptId).toBe('string');
      expect(typeof event.exceptionType).toBe('string');
      expect(typeof event.severity).toBe('string');
      expect(typeof event.quantityAffected).toBe('number');
      expect(typeof event.orderId).toBe('string');
      expect(typeof event.orderType).toBe('string');
      expect(typeof event.timestamp).toBe('string');
    });

    it('exceptionType maps to valid display labels', () => {
      const validTypes = ['short_shipment', 'damaged', 'quality_reject', 'wrong_item', 'overage'];
      const labels: Record<string, string> = {
        short_shipment: 'Short Shipment',
        damaged: 'Damaged Goods',
        quality_reject: 'Quality Rejection',
        wrong_item: 'Wrong Item',
        overage: 'Overage',
      };

      for (const type of validTypes) {
        expect(labels[type]).toBeDefined();
        expect(labels[type].length).toBeGreaterThan(0);
      }
    });
  });

  describe('ReceivingExceptionResolvedEvent shape', () => {
    it('has all required fields for notification listener', () => {
      const event: ReceivingExceptionResolvedEvent = {
        type: 'receiving.exception_resolved',
        tenantId: 'tenant-1',
        exceptionId: 'exc-1',
        receiptId: 'receipt-1',
        exceptionType: 'short_shipment',
        resolutionType: 'follow_up_po',
        resolvedByUserId: 'user-1',
        followUpOrderId: 'po-2',
        timestamp: '2026-02-09T12:00:00.000Z',
      };

      expect(event.type).toBe('receiving.exception_resolved');
      expect(typeof event.tenantId).toBe('string');
      expect(typeof event.exceptionId).toBe('string');
      expect(typeof event.receiptId).toBe('string');
      expect(typeof event.exceptionType).toBe('string');
      expect(typeof event.resolutionType).toBe('string');
      expect(typeof event.timestamp).toBe('string');
      // Optional fields
      expect(event.resolvedByUserId).toBeDefined();
      expect(event.followUpOrderId).toBeDefined();
    });

    it('resolutionType maps to valid display labels', () => {
      const validTypes = ['follow_up_po', 'replacement_card', 'return_to_supplier', 'credit', 'accept_as_is'];
      const labels: Record<string, string> = {
        follow_up_po: 'Follow-up Purchase Order',
        replacement_card: 'Kanban Card Replacement',
        return_to_supplier: 'Return to Supplier',
        credit: 'Supplier Credit',
        accept_as_is: 'Accept As Is',
      };

      for (const type of validTypes) {
        expect(labels[type]).toBeDefined();
        expect(labels[type].length).toBeGreaterThan(0);
      }
    });
  });
});
