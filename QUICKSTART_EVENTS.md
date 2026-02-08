# Quick Start: Real-Time Events & Notifications

Get the Arda V2 real-time event system up and running in 5 minutes.

## Prerequisites

- Docker & Docker Compose
- Node.js 18+
- Basic knowledge of async/await in TypeScript

## Step 1: Start Redis & Notification Service (1 min)

```bash
cd /path/to/arda-v2

# Start Redis and NotificationService
docker-compose -f docker-compose.events.yml up
```

Wait for output showing:
```
arda-notification-service  | [NotificationService] WebSocket server listening on port 3001
```

## Step 2: Publish an Event from Backend (1 min)

In your backend service (e.g., kanban service):

```typescript
// packages/kanban/src/api/cards.ts
import { getEventBus, CardTransitionEvent } from '@arda/events';

app.post('/cards/:id/move', async (req, res) => {
  const { toStage } = req.body;
  const { id: cardId } = req.params;
  const { user, tenant } = req;

  // Move card in database
  const card = await db.cards.update(
    { id: cardId },
    { stage: toStage }
  );

  // Publish event (new!)
  const eventBus = getEventBus();
  await eventBus.publish({
    type: 'card.transition',
    tenantId: tenant.id,
    cardId,
    loopId: card.loopId,
    fromStage: card.previousStage,
    toStage,
    method: 'api',
    userId: user.id,
    timestamp: new Date().toISOString(),
  } as CardTransitionEvent);

  res.json(card);
});
```

## Step 3: Add Notifications to Frontend (1 min)

In your React component:

```typescript
import { useNotifications } from '@arda/notification-service';

function KanbanBoard() {
  const { user } = useAuth();
  const { tenant } = useTenant();

  // Get notifications!
  const { notifications, isConnected } = useNotifications({
    tenantId: tenant.id,
    userId: user.id,
    autoSubscribe: true,
  });

  return (
    <div>
      <div className="status">
        {isConnected ? '🟢 Live' : '🔴 Offline'}
      </div>

      <div className="board">
        {/* Your kanban board */}
      </div>

      <div className="notifications">
        <h3>Recent Activity ({notifications.length})</h3>
        {notifications.slice(0, 5).map(notif => (
          <div key={notif.id} className={`notif notif-${notif.severity}`}>
            <strong>{notif.title}</strong>
            <p>{notif.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Step 4: Test It Out (2 min)

1. **Open two browser windows**
   - Window 1: Your Arda app
   - Window 2: Same app (different user or same)

2. **In Window 1, drag a kanban card**
   - Open DevTools → Network → WS
   - You should see a `notification` message

3. **In Window 2, watch notifications appear**
   - New notification should appear instantly!
   - Shows card transition details

## Common Event Examples

### Card Transition

```typescript
const eventBus = getEventBus();
await eventBus.publish({
  type: 'card.transition',
  tenantId: 'tenant-001',
  cardId: 'card-123',
  loopId: 'loop-456',
  fromStage: 'todo',
  toStage: 'in-progress',
  method: 'drag-drop',
  userId: 'user-789',
  timestamp: new Date().toISOString(),
});
```

### Order Created

```typescript
await eventBus.publish({
  type: 'order.created',
  tenantId: 'tenant-001',
  orderType: 'purchase_order',
  orderId: 'order-001',
  orderNumber: 'PO-2025-001',
  linkedCardIds: ['card-123'],
  timestamp: new Date().toISOString(),
});
```

### Order Status Changed

```typescript
await eventBus.publish({
  type: 'order.status_changed',
  tenantId: 'tenant-001',
  orderType: 'purchase_order',
  orderId: 'order-001',
  orderNumber: 'PO-2025-001',
  fromStatus: 'pending',
  toStatus: 'confirmed',
  timestamp: new Date().toISOString(),
});
```

### Loop Parameters Changed

```typescript
await eventBus.publish({
  type: 'loop.parameters_changed',
  tenantId: 'tenant-001',
  loopId: 'loop-456',
  changeType: 'lead_time, capacity',
  reason: 'auto_adjustment',
  timestamp: new Date().toISOString(),
});
```

### Recommendation Generated

```typescript
await eventBus.publish({
  type: 'relowisa.recommendation',
  tenantId: 'tenant-001',
  loopId: 'loop-456',
  recommendationId: 'rec-789',
  confidenceScore: 0.92,
  timestamp: new Date().toISOString(),
});
```

## Using the Notification Center Component

Pre-built React component for instant notification UI:

```typescript
import { NotificationCenter } from '@arda/notification-service/examples';

function App() {
  const { user } = useAuth();
  const { tenant } = useTenant();

  return (
    <div className="app-layout">
      <main className="content">
        {/* Your app */}
      </main>

      <aside className="sidebar">
        <NotificationCenter
          tenantId={tenant.id}
          userId={user.id}
          maxDisplayed={10}
        />
      </aside>
    </div>
  );
}
```

## Environment Variables

```bash
# Backend
REDIS_URL=redis://localhost:6379

# Frontend (React)
REACT_APP_WS_URL=ws://localhost:3001
```

## Debugging

### Check Redis is Running

```bash
# In another terminal
docker-compose -f docker-compose.events.yml ps

# Should show:
# arda-redis              Up
# arda-notification-service  Up
# arda-redis-commander    Up
```

### View Events in Redis Commander

1. Open http://localhost:8081
2. Select 'local' redis database
3. Look for `arda:events:*` keys
4. View pub/sub messages in real-time

### Check WebSocket Connection

In browser DevTools:

```javascript
// Open console and run:
ws = new WebSocket('ws://localhost:3001');
ws.onopen = () => console.log('Connected!');
ws.onmessage = (e) => console.log('Message:', JSON.parse(e.data));

// Subscribe to a tenant
ws.send(JSON.stringify({
  type: 'subscribe',
  payload: { tenantId: 'tenant-001' }
}));
```

## Integration with Existing Services

### In Kanban Service

```typescript
// packages/kanban/src/services/cardService.ts
import { getEventBus, CardTransitionEvent } from '@arda/events';

export class CardService {
  async moveCard(cardId: string, toStage: string, userId: string, tenantId: string) {
    const card = await db.cards.findById(cardId);
    const fromStage = card.stage;

    // Update database
    await db.cards.update({ id: cardId }, { stage: toStage });

    // Publish event
    await getEventBus().publish({
      type: 'card.transition',
      tenantId,
      cardId,
      loopId: card.loopId,
      fromStage,
      toStage,
      method: 'api',
      userId,
      timestamp: new Date().toISOString(),
    });

    return card;
  }
}
```

### In Order Service

```typescript
// packages/orders/src/services/orderService.ts
import { getEventBus, OrderCreatedEvent } from '@arda/events';

export class OrderService {
  async createOrder(orderData, tenantId: string) {
    const order = await db.orders.create(orderData);

    await getEventBus().publish({
      type: 'order.created',
      tenantId,
      orderType: order.type,
      orderId: order.id,
      orderNumber: order.number,
      linkedCardIds: orderData.cardIds,
      timestamp: new Date().toISOString(),
    });

    return order;
  }
}
```

## Next Steps

1. **Read Full Documentation**: See `EVENTS_ARCHITECTURE.md` for complete details
2. **Integration Guide**: See `INTEGRATION_GUIDE.md` for all services
3. **Production Setup**: See `packages/notification-service/README.md` for deployment

## Troubleshooting

**Problem**: WebSocket connection refused
```
Solution: Make sure docker-compose is running and port 3001 is accessible
docker-compose -f docker-compose.events.yml logs
```

**Problem**: Events not appearing
```
Solution: Check Redis is running and event is being published
docker-compose -f docker-compose.events.yml logs notification-service
```

**Problem**: Wrong tenant seeing events
```
Solution: Ensure tenantId in event matches tenantId in subscription
Check browser console for subscription details
```

## Getting Help

Check the logs:

```bash
# All services
docker-compose -f docker-compose.events.yml logs -f

# Just notification service
docker-compose -f docker-compose.events.yml logs -f notification-service

# Just Redis
docker-compose -f docker-compose.events.yml logs -f redis
```

View Redis data:

```bash
# Connect to Redis
docker-compose -f docker-compose.events.yml exec redis redis-cli

# View all keys
> KEYS arda:events:*

# View specific tenant events
> PUBSUB CHANNELS arda:events:tenant-001
```

## Summary

You now have:
- ✅ Event Bus (Redis-based pub/sub)
- ✅ WebSocket Server (real-time notifications)
- ✅ React Integration (useNotifications hook)
- ✅ Type-safe Events (TypeScript)
- ✅ Production-ready Architecture

Start publishing events and watch notifications appear in real-time!
