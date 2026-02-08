# Real-Time Events & Notifications Integration Guide

This guide explains how to integrate the Arda V2 Notification Service into your application.

## Quick Start

### 1. Install Dependencies

```bash
# Backend
npm install ioredis

# Frontend
npm install ws
```

### 2. Initialize EventBus (Backend)

In your main server file:

```typescript
import { getEventBus } from '@arda/events';
import { NotificationService } from '@arda/notification-service';

// Start the notification service
const eventBus = getEventBus(process.env.REDIS_URL || 'redis://localhost:6379');
const notificationService = new NotificationService(eventBus, 3001);
```

### 3. Publish Events (Backend)

When kanban cards transition, orders are created, etc.:

```typescript
import { getEventBus, CardTransitionEvent } from '@arda/events';

const eventBus = getEventBus();

// When handling a card transition
const event: CardTransitionEvent = {
  type: 'card.transition',
  tenantId: req.user.tenantId,
  cardId: card.id,
  loopId: card.loopId,
  fromStage: card.previousStage,
  toStage: card.currentStage,
  method: 'drag-drop',
  userId: req.user.id,
  timestamp: new Date().toISOString(),
};

await eventBus.publish(event);
```

### 4. Add Notifications to UI (Frontend)

In your React component:

```typescript
import { useNotifications } from '@arda/notification-service';

function KanbanBoard() {
  const { user } = useAuth();
  const { tenant } = useTenant();

  const { notifications, isConnected } = useNotifications({
    tenantId: tenant.id,
    userId: user.id,
    autoSubscribe: true,
  });

  return (
    <div className="kanban-board">
      {/* Your kanban implementation */}
      
      <div className="notification-bell">
        {!isConnected && <span className="status-offline">●</span>}
        {notifications.filter(n => !n.read).length > 0 && (
          <span className="unread-badge">
            {notifications.filter(n => !n.read).length}
          </span>
        )}
      </div>
    </div>
  );
}
```

## Integration Points

### Kanban Service

```typescript
// packages/kanban/src/services/cardService.ts
import { getEventBus, CardTransitionEvent } from '@arda/events';

export class CardService {
  async moveCard(
    cardId: string,
    toStage: string,
    userId: string,
    tenantId: string
  ) {
    const card = await this.getCard(cardId);
    const fromStage = card.stage;

    // Update database
    await db.cards.update({ id: cardId }, { stage: toStage });

    // Publish event
    const eventBus = getEventBus();
    await eventBus.publish({
      type: 'card.transition',
      tenantId,
      cardId,
      loopId: card.loopId,
      fromStage,
      toStage,
      method: 'api',
      userId,
      timestamp: new Date().toISOString(),
    } as CardTransitionEvent);

    return card;
  }
}
```

### Order Service

```typescript
// packages/orders/src/services/orderService.ts
import { getEventBus, OrderCreatedEvent, OrderStatusChangedEvent } from '@arda/events';

export class OrderService {
  async createOrder(orderData, tenantId: string) {
    const order = await db.orders.create(orderData);

    // Publish event
    const eventBus = getEventBus();
    await eventBus.publish({
      type: 'order.created',
      tenantId,
      orderType: orderData.type,
      orderId: order.id,
      orderNumber: order.number,
      linkedCardIds: orderData.cardIds,
      timestamp: new Date().toISOString(),
    } as OrderCreatedEvent);

    return order;
  }

  async updateOrderStatus(orderId: string, toStatus: string, tenantId: string) {
    const order = await db.orders.findById(orderId);
    const fromStatus = order.status;

    await db.orders.update({ id: orderId }, { status: toStatus });

    const eventBus = getEventBus();
    await eventBus.publish({
      type: 'order.status_changed',
      tenantId,
      orderType: order.type,
      orderId,
      orderNumber: order.number,
      fromStatus,
      toStatus,
      timestamp: new Date().toISOString(),
    } as OrderStatusChangedEvent);

    return order;
  }
}
```

### Loop Service

```typescript
// packages/loops/src/services/loopService.ts
import { getEventBus, LoopParameterChangedEvent } from '@arda/events';

export class LoopService {
  async updateParameters(loopId: string, params: object, tenantId: string) {
    await db.loops.update({ id: loopId }, params);

    const eventBus = getEventBus();
    await eventBus.publish({
      type: 'loop.parameters_changed',
      tenantId,
      loopId,
      changeType: Object.keys(params).join(', '),
      reason: 'manual_update',
      timestamp: new Date().toISOString(),
    } as LoopParameterChangedEvent);
  }
}
```

### ReloWisa Service

```typescript
// packages/relowisa/src/services/recommendationService.ts
import { getEventBus, ReloWisaRecommendationEvent } from '@arda/events';

export class RecommendationService {
  async generateRecommendation(loopId: string, tenantId: string) {
    const recommendation = await this.runModel(loopId);

    const eventBus = getEventBus();
    await eventBus.publish({
      type: 'relowisa.recommendation',
      tenantId,
      loopId,
      recommendationId: recommendation.id,
      confidenceScore: recommendation.score,
      timestamp: new Date().toISOString(),
    } as ReloWisaRecommendationEvent);

    return recommendation;
  }
}
```

## Component Examples

### Notification Toast

```typescript
import { useNotifications } from '@arda/notification-service';

function NotificationToast() {
  const { notifications, markAsRead } = useNotifications({
    tenantId: useTenant().id,
  });

  const [visible, setVisible] = useState<Notification | null>(null);

  useEffect(() => {
    if (notifications.length > 0) {
      const latest = notifications[0];
      setVisible(latest);
      const timeout = setTimeout(() => setVisible(null), 5000);
      return () => clearTimeout(timeout);
    }
  }, [notifications]);

  if (!visible) return null;

  return (
    <div className={`toast toast-${visible.severity}`}>
      <div className="toast-content">
        <h4>{visible.title}</h4>
        <p>{visible.message}</p>
      </div>
      <button onClick={() => markAsRead(visible.id)}>×</button>
    </div>
  );
}
```

### Activity Feed

```typescript
import { useNotifications } from '@arda/notification-service';

function ActivityFeed() {
  const { notifications, markAsRead, clearNotifications } = useNotifications({
    tenantId: useTenant().id,
  });

  return (
    <div className="activity-feed">
      <h3>Recent Activity</h3>
      {notifications.slice(0, 20).map((notif) => (
        <div
          key={notif.id}
          className={`activity-item ${notif.read ? 'read' : 'unread'}`}
          onClick={() => markAsRead(notif.id)}
        >
          <span className={`icon-${notif.severity}`}>
            {getIcon(notif.severity)}
          </span>
          <div className="activity-content">
            <p className="title">{notif.title}</p>
            <p className="message">{notif.message}</p>
            <span className="time">
              {formatDistanceToNow(new Date(notif.timestamp))} ago
            </span>
          </div>
        </div>
      ))}
      <button onClick={clearNotifications}>Clear All</button>
    </div>
  );
}
```

### Status Indicator

```typescript
import { useNotifications } from '@arda/notification-service';

function ConnectionStatus() {
  const { isConnected } = useNotifications({
    tenantId: useTenant().id,
  });

  return (
    <div className="status-indicator">
      <span className={`dot ${isConnected ? 'connected' : 'disconnected'}`} />
      <span className="text">
        {isConnected ? 'Live' : 'Reconnecting...'}
      </span>
    </div>
  );
}
```

## Error Handling

### Backend Event Publishing

```typescript
async function publishEvent(event: ArdaEvent) {
  try {
    await getEventBus().publish(event);
  } catch (error) {
    // Event publishing failure should not break the operation
    console.error('Failed to publish event:', error);
    
    // Optionally: Queue for retry or log to monitoring service
    await logEventPublishingError(event, error);
  }
}
```

### Frontend WebSocket Reconnection

The `useNotifications` hook automatically handles reconnection with exponential backoff. You can add custom reconnection logic:

```typescript
const { notifications, isConnected } = useNotifications({
  tenantId: tenant.id,
});

useEffect(() => {
  if (!isConnected) {
    // Show connection status to user
    toast.info('Reconnecting to live updates...');
  }
}, [isConnected]);
```

## Testing

### Unit Test Example

```typescript
import { EventBus, CardTransitionEvent } from '@arda/events';

describe('CardService', () => {
  let eventBus: EventBus;
  let cardService: CardService;

  beforeEach(() => {
    eventBus = new EventBus('redis://localhost:6379');
    cardService = new CardService(eventBus);
  });

  it('should publish card.transition event', async () => {
    const publishSpy = jest.spyOn(eventBus, 'publish');

    await cardService.moveCard('card-1', 'in-progress', 'user-1', 'tenant-1');

    expect(publishSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'card.transition',
        cardId: 'card-1',
        toStage: 'in-progress',
      })
    );
  });
});
```

### Integration Test Example

```typescript
describe('NotificationService', () => {
  let eventBus: EventBus;
  let notificationService: NotificationService;
  let ws: WebSocket;

  beforeEach(async () => {
    eventBus = new EventBus('redis://localhost:6379');
    notificationService = new NotificationService(eventBus, 3001);
  });

  it('should deliver events to connected clients', async () => {
    ws = new WebSocket('ws://localhost:3001');

    const notificationPromise = new Promise((resolve) => {
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'notification') {
          resolve(message.payload);
        }
      };
    });

    // Subscribe
    ws.send(JSON.stringify({
      type: 'subscribe',
      payload: { tenantId: 'tenant-1' },
    }));

    // Publish event
    await eventBus.publish({
      type: 'card.transition',
      tenantId: 'tenant-1',
      cardId: 'card-1',
      loopId: 'loop-1',
      fromStage: 'todo',
      toStage: 'in-progress',
      method: 'api',
      timestamp: new Date().toISOString(),
    } as CardTransitionEvent);

    const notification = await notificationPromise;
    expect(notification.type).toBe('card.transition');
  });
});
```

## Monitoring

### Key Metrics to Track

1. **Event Throughput**: Events published per second
2. **WebSocket Connections**: Connected clients
3. **Message Latency**: Time from publish to delivery
4. **Error Rate**: Failed event publications
5. **Memory Usage**: Per-connection memory footprint

### Example Metrics Collection

```typescript
class MetricsCollector {
  private eventCount = 0;
  private errorCount = 0;

  recordEvent(event: ArdaEvent) {
    this.eventCount++;
  }

  recordError() {
    this.errorCount++;
  }

  getMetrics() {
    return {
      eventCount: this.eventCount,
      errorCount: this.errorCount,
      errorRate: this.errorCount / this.eventCount,
    };
  }
}
```

## Security Considerations

1. **Authentication**: Validate WebSocket connections with JWT
2. **Authorization**: Only deliver events for tenants user has access to
3. **Rate Limiting**: Limit events per tenant/user
4. **Input Validation**: Validate all event payloads
5. **Encryption**: Use WSS (WebSocket Secure) in production

### Example: Secure WebSocket Setup

```typescript
const wss = new WebSocket.Server({
  server: https.createServer({}),
  verifyClient: async (info) => {
    const token = info.req.headers['authorization'];
    const user = await verifyToken(token);
    return user !== null;
  },
});
```

## Performance Optimization

1. **Event Batching**: Group related events
2. **Selective Delivery**: Only send relevant events to clients
3. **Client-Side Filtering**: Filter events in React component
4. **Compression**: Enable WebSocket compression
5. **Redis Clustering**: For high-throughput scenarios

## Troubleshooting

### Events Not Delivered

1. Check Redis connection: `redis-cli ping`
2. Verify event is being published: Add console.log
3. Check WebSocket connection: Browser DevTools → Network
4. Ensure tenant ID matches subscriber

### High Memory Usage

1. Check for memory leaks in handlers
2. Implement notification cleanup/retention
3. Monitor WebSocket connection count
4. Profile with memory tools

### WebSocket Latency

1. Check Redis latency: `redis-cli --latency`
2. Monitor network conditions
3. Profile event serialization
4. Check server CPU/memory

