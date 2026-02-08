import { db, schema } from '@arda/db';
import { and, eq } from 'drizzle-orm';
import { getEventBus, type ArdaEvent, type CardTransitionEvent, type OrderCreatedEvent, type OrderStatusChangedEvent, type ReloWisaRecommendationEvent } from '@arda/events';
import { config } from '@arda/config';

const { notifications, users } = schema;

export async function startNotificationGenerator(): Promise<void> {
  const eventBus = getEventBus(config.REDIS_URL);

  await eventBus.subscribeGlobal(async (event: ArdaEvent) => {
    try {
      switch (event.type) {
        case 'card.transition':
          await handleCardTransition(event);
          break;
        case 'order.created':
          await handleOrderCreated(event);
          break;
        case 'order.status_changed':
          await handleOrderStatusChanged(event);
          break;
        case 'relowisa.recommendation':
          await handleReloWisaRecommendation(event);
          break;
      }
    } catch (err) {
      console.error('[notification-generator] Error processing event:', err);
    }
  });

  console.log('[notification-generator] Listening for events');
}

async function handleCardTransition(event: CardTransitionEvent): Promise<void> {
  if (event.toStage !== 'triggered') return; // Only notify on triggers

  await createTenantNotification(event.tenantId, {
    type: 'card_triggered',
    title: 'Kanban Card Triggered',
    body: `Card ${event.cardId} has been triggered and needs attention.`,
    metadata: {
      cardId: event.cardId,
      loopId: event.loopId,
      method: event.method,
    },
  });
}

async function handleOrderCreated(event: OrderCreatedEvent): Promise<void> {
  const orderTypeLabel = event.orderType.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  await createTenantNotification(event.tenantId, {
    type: 'po_created',
    title: `${orderTypeLabel} Created`,
    body: `${orderTypeLabel} ${event.orderNumber} has been created with ${event.linkedCardIds.length} linked card(s).`,
    metadata: {
      orderType: event.orderType,
      orderId: event.orderId,
      orderNumber: event.orderNumber,
      linkedCardIds: event.linkedCardIds,
    },
  });
}

async function handleOrderStatusChanged(event: OrderStatusChangedEvent): Promise<void> {
  const orderTypeLabel = event.orderType.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  await createTenantNotification(event.tenantId, {
    type: 'wo_status_change',
    title: `${orderTypeLabel} Status Updated`,
    body: `${orderTypeLabel} ${event.orderNumber} moved from ${event.fromStatus} to ${event.toStatus}.`,
    metadata: {
      orderType: event.orderType,
      orderId: event.orderId,
      orderNumber: event.orderNumber,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
    },
  });
}

async function handleReloWisaRecommendation(event: ReloWisaRecommendationEvent): Promise<void> {
  await createTenantNotification(event.tenantId, {
    type: 'relowisa_recommendation',
    title: 'New Parameter Recommendation',
    body: `ReLoWiSa has a new recommendation for loop ${event.loopId} with ${event.confidenceScore}% confidence.`,
    metadata: {
      loopId: event.loopId,
      recommendationId: event.recommendationId,
      confidenceScore: event.confidenceScore,
    },
  });
}

async function createTenantNotification(
  tenantId: string,
  payload: {
    type: (typeof notifications.$inferInsert)['type'];
    title: string;
    body: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const recipients = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.isActive, true)));

  if (recipients.length === 0) {
    return;
  }

  await db.insert(notifications).values(
    recipients.map((recipient) => ({
      tenantId,
      userId: recipient.id,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      metadata: payload.metadata ?? {},
    }))
  );
}
