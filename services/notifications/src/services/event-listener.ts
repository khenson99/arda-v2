import { getEventBus, type ArdaEvent } from '@arda/events';
import { db, schema } from '@arda/db';
import { and, eq } from 'drizzle-orm';

export async function startEventListener(redisUrl: string): Promise<void> {
  const eventBus = getEventBus(redisUrl);

  await eventBus.subscribeGlobal(async (event: ArdaEvent) => {
    try {
      switch (event.type) {
        case 'card.transition':
          // Create notification for relevant users when cards move to key stages
          if (['triggered', 'received', 'restocked'].includes(event.toStage)) {
            await createNotification(eventBus, {
              tenantId: event.tenantId,
              type: 'card_triggered',
              title: `Kanban card moved to ${event.toStage}`,
              body: `Card ${event.cardId} transitioned from ${event.fromStage || 'initial'} to ${event.toStage}`,
              actionUrl: `/loops/${event.loopId}/cards/${event.cardId}`,
              metadata: { cardId: event.cardId, loopId: event.loopId, stage: event.toStage },
            });
          }
          break;

        case 'order.created':
          await createNotification(eventBus, {
            tenantId: event.tenantId,
            type: 'po_created',
            title: `New ${event.orderType.replace('_', ' ')} created`,
            body: `${event.orderNumber} has been created with ${event.linkedCardIds.length} linked card(s)`,
            actionUrl: `/orders/${event.orderId}`,
            metadata: {
              orderId: event.orderId,
              orderNumber: event.orderNumber,
              orderType: event.orderType,
            },
          });
          break;

        case 'relowisa.recommendation':
          await createNotification(eventBus, {
            tenantId: event.tenantId,
            type: 'relowisa_recommendation',
            title: 'New ReLoWiSa recommendation',
            body: `Parameter optimization suggested for loop ${event.loopId} (confidence: ${event.confidenceScore}%)`,
            actionUrl: `/loops/${event.loopId}/recommendations/${event.recommendationId}`,
            metadata: { loopId: event.loopId, recommendationId: event.recommendationId },
          });
          break;
      }
    } catch (err) {
      console.error('[notifications] Failed to process event:', err);
    }
  });

  console.log('[notifications] Event listener started');
}

async function createNotification(
  eventBus: ReturnType<typeof getEventBus>,
  params: {
    tenantId: string;
    userId?: string;
    type: string;
    title: string;
    body: string;
    actionUrl?: string;
    metadata?: Record<string, unknown>;
  }
) {
  const targetUserIds = params.userId
    ? [params.userId]
    : (
        await db
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(and(eq(schema.users.tenantId, params.tenantId), eq(schema.users.isActive, true)))
      ).map((row) => row.id);

  if (targetUserIds.length === 0) {
    return;
  }

  const insertedNotifications = await db
    .insert(schema.notifications)
    .values(
      targetUserIds.map((userId) => ({
        tenantId: params.tenantId,
        userId,
        type: params.type as (typeof schema.notificationTypeEnum.enumValues)[number],
        title: params.title,
        body: params.body,
        actionUrl: params.actionUrl,
        isRead: false,
        metadata: params.metadata || {},
        createdAt: new Date(),
      }))
    )
    .returning({
      id: schema.notifications.id,
      userId: schema.notifications.userId,
      type: schema.notifications.type,
      title: schema.notifications.title,
    });

  await Promise.all(
    insertedNotifications.map(async (notification) => {
      try {
        await eventBus.publish({
          type: 'notification.created',
          tenantId: params.tenantId,
          userId: notification.userId,
          notificationId: notification.id,
          notificationType: notification.type,
          title: notification.title,
          timestamp: new Date().toISOString(),
        });
      } catch {
        console.error(
          `[notifications] Failed to publish notification.created event for ${notification.id}`
        );
      }
    })
  );
}
