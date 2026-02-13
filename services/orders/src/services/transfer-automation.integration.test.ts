/**
 * Transfer Automation Integration Tests
 *
 * Validates end-to-end transfer order automation from Kanban trigger events.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db, schema } from '@arda/db';
import { eq, and } from 'drizzle-orm';
import { processTransferQueueEntry } from './transfer-automation.service.js';
import type { LifecycleQueueEntryEvent } from '@arda/events';

const {
  kanbanCards,
  kanbanLoops,
  transferOrders,
  transferOrderLines,
  cardStageTransitions,
} = schema;

describe('Transfer Automation Service', () => {
  const testTenantId = '00000000-0000-0000-0000-000000000001';
  const testPartId = '00000000-0000-0000-0000-000000000010';
  const testSourceFacilityId = '00000000-0000-0000-0000-000000000020';
  const testDestFacilityId = '00000000-0000-0000-0000-000000000021';

  let testLoopId: string;
  let testCardId: string;

  beforeEach(async () => {
    // Clean up any existing test data
    await db
      .delete(cardStageTransitions)
      .where(eq(cardStageTransitions.tenantId, testTenantId))
      .execute();
    await db
      .delete(kanbanCards)
      .where(eq(kanbanCards.tenantId, testTenantId))
      .execute();
    await db
      .delete(kanbanLoops)
      .where(eq(kanbanLoops.tenantId, testTenantId))
      .execute();
    await db
      .delete(transferOrderLines)
      .where(eq(transferOrderLines.tenantId, testTenantId))
      .execute();
    await db
      .delete(transferOrders)
      .where(eq(transferOrders.tenantId, testTenantId))
      .execute();

    // Create a transfer loop
    const [loop] = await db
      .insert(kanbanLoops)
      .values({
        tenantId: testTenantId,
        partId: testPartId,
        facilityId: testDestFacilityId,
        loopType: 'transfer',
        cardMode: 'single',
        minQuantity: 10,
        orderQuantity: 50,
        numberOfCards: 1,
        sourceFacilityId: testSourceFacilityId,
        isActive: true,
      })
      .returning({ id: kanbanLoops.id })
      .execute();

    testLoopId = loop.id;

    // Create a card in triggered stage
    const [card] = await db
      .insert(kanbanCards)
      .values({
        tenantId: testTenantId,
        loopId: testLoopId,
        cardNumber: 1,
        currentStage: 'triggered',
        isActive: true,
      })
      .returning({ id: kanbanCards.id })
      .execute();

    testCardId = card.id;
  });

  afterEach(async () => {
    // Clean up test data
    await db
      .delete(cardStageTransitions)
      .where(eq(cardStageTransitions.tenantId, testTenantId))
      .execute();
    await db
      .delete(kanbanCards)
      .where(eq(kanbanCards.tenantId, testTenantId))
      .execute();
    await db
      .delete(kanbanLoops)
      .where(eq(kanbanLoops.tenantId, testTenantId))
      .execute();
    await db
      .delete(transferOrderLines)
      .where(eq(transferOrderLines.tenantId, testTenantId))
      .execute();
    await db
      .delete(transferOrders)
      .where(eq(transferOrders.tenantId, testTenantId))
      .execute();
  });

  it('should create draft TO from transfer loop trigger event', async () => {
    const event: LifecycleQueueEntryEvent = {
      type: 'lifecycle.queue_entry',
      tenantId: testTenantId,
      cardId: testCardId,
      loopId: testLoopId,
      loopType: 'transfer',
      partId: testPartId,
      facilityId: testDestFacilityId,
      quantity: 50,
      timestamp: new Date().toISOString(),
    };

    const result = await processTransferQueueEntry(event);

    expect(result.success).toBe(true);
    expect(result.alreadyExisted).toBe(false);
    expect(result.transferOrderId).toBeDefined();
    expect(result.toNumber).toBeDefined();

    // Verify TO was created
    const to = await db.query.transferOrders.findFirst({
      where: eq(transferOrders.id, result.transferOrderId!),
    });

    expect(to).toBeDefined();
    expect(to!.tenantId).toBe(testTenantId);
    expect(to!.status).toBe('draft');
    expect(to!.sourceFacilityId).toBe(testSourceFacilityId);
    expect(to!.destinationFacilityId).toBe(testDestFacilityId);
    expect(to!.kanbanCardId).toBe(testCardId);

    // Verify TO line was created
    const lines = await db.query.transferOrderLines.findMany({
      where: eq(transferOrderLines.transferOrderId, result.transferOrderId!),
    });

    expect(lines).toHaveLength(1);
    expect(lines[0].partId).toBe(testPartId);
    expect(lines[0].quantityRequested).toBe(50);

    // Verify card was transitioned to ordered
    const card = await db.query.kanbanCards.findFirst({
      where: eq(kanbanCards.id, testCardId),
    });

    expect(card!.currentStage).toBe('ordered');
    expect(card!.linkedTransferOrderId).toBe(result.transferOrderId);

    // Verify stage transition was recorded
    const transitions = await db.query.cardStageTransitions.findMany({
      where: and(
        eq(cardStageTransitions.cardId, testCardId),
        eq(cardStageTransitions.toStage, 'ordered')
      ),
    });

    expect(transitions).toHaveLength(1);
    expect(transitions[0].fromStage).toBe('triggered');
    expect(transitions[0].toStage).toBe('ordered');
    expect(transitions[0].method).toBe('system');
  });

  it('should prevent duplicate TO creation when card already linked', async () => {
    // First call - creates TO
    const event: LifecycleQueueEntryEvent = {
      type: 'lifecycle.queue_entry',
      tenantId: testTenantId,
      cardId: testCardId,
      loopId: testLoopId,
      loopType: 'transfer',
      partId: testPartId,
      facilityId: testDestFacilityId,
      quantity: 50,
      timestamp: new Date().toISOString(),
    };

    const firstResult = await processTransferQueueEntry(event);
    expect(firstResult.success).toBe(true);
    expect(firstResult.alreadyExisted).toBe(false);

    const firstToId = firstResult.transferOrderId;

    // Second call - should detect existing TO and skip
    const secondResult = await processTransferQueueEntry(event);
    expect(secondResult.success).toBe(true);
    expect(secondResult.alreadyExisted).toBe(true);
    expect(secondResult.transferOrderId).toBe(firstToId);

    // Verify only one TO exists
    const allTOs = await db.query.transferOrders.findMany({
      where: and(
        eq(transferOrders.tenantId, testTenantId),
        eq(transferOrders.kanbanCardId, testCardId)
      ),
    });

    expect(allTOs).toHaveLength(1);
  });

  it('should skip non-transfer loop events', async () => {
    const event: LifecycleQueueEntryEvent = {
      type: 'lifecycle.queue_entry',
      tenantId: testTenantId,
      cardId: testCardId,
      loopId: testLoopId,
      loopType: 'procurement', // not a transfer loop
      partId: testPartId,
      facilityId: testDestFacilityId,
      quantity: 50,
      timestamp: new Date().toISOString(),
    };

    const result = await processTransferQueueEntry(event);

    expect(result.success).toBe(true);
    expect(result.alreadyExisted).toBe(true);

    // Verify no TO was created
    const allTOs = await db.query.transferOrders.findMany({
      where: eq(transferOrders.tenantId, testTenantId),
    });

    expect(allTOs).toHaveLength(0);
  });

  it('should fail gracefully when loop missing sourceFacilityId', async () => {
    // Create a loop without sourceFacilityId
    const [badLoop] = await db
      .insert(kanbanLoops)
      .values({
        tenantId: testTenantId,
        partId: testPartId,
        facilityId: testDestFacilityId,
        loopType: 'transfer',
        cardMode: 'single',
        minQuantity: 10,
        orderQuantity: 50,
        numberOfCards: 1,
        sourceFacilityId: null, // missing!
        isActive: true,
      })
      .returning({ id: kanbanLoops.id })
      .execute();

    const [badCard] = await db
      .insert(kanbanCards)
      .values({
        tenantId: testTenantId,
        loopId: badLoop.id,
        cardNumber: 1,
        currentStage: 'triggered',
        isActive: true,
      })
      .returning({ id: kanbanCards.id })
      .execute();

    const event: LifecycleQueueEntryEvent = {
      type: 'lifecycle.queue_entry',
      tenantId: testTenantId,
      cardId: badCard.id,
      loopId: badLoop.id,
      loopType: 'transfer',
      partId: testPartId,
      facilityId: testDestFacilityId,
      quantity: 50,
      timestamp: new Date().toISOString(),
    };

    const result = await processTransferQueueEntry(event);

    expect(result.success).toBe(false);
    expect(result.error).toContain('sourceFacilityId');

    // Verify no TO was created
    const allTOs = await db.query.transferOrders.findMany({
      where: eq(transferOrders.tenantId, testTenantId),
    });

    expect(allTOs).toHaveLength(0);
  });

  it('should handle card not found gracefully', async () => {
    const nonExistentCardId = '00000000-0000-0000-0000-999999999999';

    const event: LifecycleQueueEntryEvent = {
      type: 'lifecycle.queue_entry',
      tenantId: testTenantId,
      cardId: nonExistentCardId,
      loopId: testLoopId,
      loopType: 'transfer',
      partId: testPartId,
      facilityId: testDestFacilityId,
      quantity: 50,
      timestamp: new Date().toISOString(),
    };

    const result = await processTransferQueueEntry(event);

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should use loop orderQuantity as TO line quantity', async () => {
    const event: LifecycleQueueEntryEvent = {
      type: 'lifecycle.queue_entry',
      tenantId: testTenantId,
      cardId: testCardId,
      loopId: testLoopId,
      loopType: 'transfer',
      partId: testPartId,
      facilityId: testDestFacilityId,
      quantity: 75, // event quantity
      timestamp: new Date().toISOString(),
    };

    const result = await processTransferQueueEntry(event);
    expect(result.success).toBe(true);

    // Verify TO line uses the event quantity
    const lines = await db.query.transferOrderLines.findMany({
      where: eq(transferOrderLines.transferOrderId, result.transferOrderId!),
    });

    expect(lines).toHaveLength(1);
    expect(lines[0].quantityRequested).toBe(75);
  });

  it('should set kanbanCardId on transfer order', async () => {
    const event: LifecycleQueueEntryEvent = {
      type: 'lifecycle.queue_entry',
      tenantId: testTenantId,
      cardId: testCardId,
      loopId: testLoopId,
      loopType: 'transfer',
      partId: testPartId,
      facilityId: testDestFacilityId,
      quantity: 50,
      timestamp: new Date().toISOString(),
    };

    const result = await processTransferQueueEntry(event);
    expect(result.success).toBe(true);

    const to = await db.query.transferOrders.findFirst({
      where: eq(transferOrders.id, result.transferOrderId!),
    });

    expect(to!.kanbanCardId).toBe(testCardId);
  });

  it('should create stage transition with method=system', async () => {
    const event: LifecycleQueueEntryEvent = {
      type: 'lifecycle.queue_entry',
      tenantId: testTenantId,
      cardId: testCardId,
      loopId: testLoopId,
      loopType: 'transfer',
      partId: testPartId,
      facilityId: testDestFacilityId,
      quantity: 50,
      timestamp: new Date().toISOString(),
    };

    const result = await processTransferQueueEntry(event);
    expect(result.success).toBe(true);

    const transitions = await db.query.cardStageTransitions.findMany({
      where: and(
        eq(cardStageTransitions.cardId, testCardId),
        eq(cardStageTransitions.toStage, 'ordered')
      ),
    });

    expect(transitions).toHaveLength(1);
    expect(transitions[0].method).toBe('system');
    expect(transitions[0].transitionedByUserId).toBeNull();
  });

  it('should advance card workflow: triggered -> ordered', async () => {
    // Verify initial state
    let card = await db.query.kanbanCards.findFirst({
      where: eq(kanbanCards.id, testCardId),
    });
    expect(card!.currentStage).toBe('triggered');
    expect(card!.linkedTransferOrderId).toBeNull();

    const event: LifecycleQueueEntryEvent = {
      type: 'lifecycle.queue_entry',
      tenantId: testTenantId,
      cardId: testCardId,
      loopId: testLoopId,
      loopType: 'transfer',
      partId: testPartId,
      facilityId: testDestFacilityId,
      quantity: 50,
      timestamp: new Date().toISOString(),
    };

    const result = await processTransferQueueEntry(event);
    expect(result.success).toBe(true);

    // Verify final state
    card = await db.query.kanbanCards.findFirst({
      where: eq(kanbanCards.id, testCardId),
    });
    expect(card!.currentStage).toBe('ordered');
    expect(card!.linkedTransferOrderId).toBe(result.transferOrderId);
  });

  it('should use source facility from loop as TO source', async () => {
    const event: LifecycleQueueEntryEvent = {
      type: 'lifecycle.queue_entry',
      tenantId: testTenantId,
      cardId: testCardId,
      loopId: testLoopId,
      loopType: 'transfer',
      partId: testPartId,
      facilityId: testDestFacilityId,
      quantity: 50,
      timestamp: new Date().toISOString(),
    };

    const result = await processTransferQueueEntry(event);
    expect(result.success).toBe(true);

    const to = await db.query.transferOrders.findFirst({
      where: eq(transferOrders.id, result.transferOrderId!),
    });

    expect(to!.sourceFacilityId).toBe(testSourceFacilityId);
    expect(to!.destinationFacilityId).toBe(testDestFacilityId);
  });

  it('should use loop facilityId as TO destination', async () => {
    const event: LifecycleQueueEntryEvent = {
      type: 'lifecycle.queue_entry',
      tenantId: testTenantId,
      cardId: testCardId,
      loopId: testLoopId,
      loopType: 'transfer',
      partId: testPartId,
      facilityId: testDestFacilityId,
      quantity: 50,
      timestamp: new Date().toISOString(),
    };

    const result = await processTransferQueueEntry(event);
    expect(result.success).toBe(true);

    const to = await db.query.transferOrders.findFirst({
      where: eq(transferOrders.id, result.transferOrderId!),
    });

    expect(to!.destinationFacilityId).toBe(testDestFacilityId);
  });

  it('should create TO with draft status', async () => {
    const event: LifecycleQueueEntryEvent = {
      type: 'lifecycle.queue_entry',
      tenantId: testTenantId,
      cardId: testCardId,
      loopId: testLoopId,
      loopType: 'transfer',
      partId: testPartId,
      facilityId: testDestFacilityId,
      quantity: 50,
      timestamp: new Date().toISOString(),
    };

    const result = await processTransferQueueEntry(event);
    expect(result.success).toBe(true);

    const to = await db.query.transferOrders.findFirst({
      where: eq(transferOrders.id, result.transferOrderId!),
    });

    expect(to!.status).toBe('draft');
  });
});
