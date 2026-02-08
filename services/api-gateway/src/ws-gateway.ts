import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { verifyAccessToken } from '@arda/auth-utils';
import { getEventBus, type ArdaEvent } from '@arda/events';
import { config } from '@arda/config';
import { parse as parseUrl } from 'url';

interface AuthenticatedSocket extends WebSocket {
  tenantId: string;
  userId: string;
  isAlive: boolean;
}

export function setupWebSocketGateway(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  const eventBus = getEventBus(config.REDIS_URL);

  // Track connections per tenant for broadcasting
  const tenantConnections = new Map<string, Set<AuthenticatedSocket>>();
  const tenantHandlers = new Map<string, (event: ArdaEvent) => void>();

  // Setup event listener: when events arrive via Redis, broadcast to connected clients
  // We subscribe per-tenant as clients connect

  wss.on('connection', async (ws: WebSocket, req) => {
    const socket = ws as AuthenticatedSocket;
    socket.isAlive = true;

    // ─── Authenticate ─────────────────────────────────────────────
    try {
      const url = parseUrl(req.url || '', true);
      const token = url.query.token as string || req.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        socket.close(4001, 'Authentication required');
        return;
      }

      const payload = verifyAccessToken(token);
      socket.tenantId = payload.tenantId;
      socket.userId = payload.sub;
    } catch (err) {
      socket.close(4001, 'Invalid token');
      return;
    }

    // ─── Register connection ──────────────────────────────────────
    if (!tenantConnections.has(socket.tenantId)) {
      tenantConnections.set(socket.tenantId, new Set());

      const tenantId = socket.tenantId;
      const handler = (event: ArdaEvent) => {
        const connections = tenantConnections.get(tenantId);
        if (connections) {
          const message = JSON.stringify(event);
          for (const conn of connections) {
            if (conn.readyState === WebSocket.OPEN) {
              conn.send(message);
            }
          }
        }
      };

      tenantHandlers.set(tenantId, handler);

      try {
        await eventBus.subscribeTenant(tenantId, handler);
      } catch (err) {
        tenantHandlers.delete(tenantId);
        tenantConnections.delete(tenantId);
        console.error(`[ws] Failed to subscribe tenant ${tenantId}:`, err);
        socket.close(1011, 'Subscription failed');
        return;
      }
    }
    tenantConnections.get(socket.tenantId)!.add(socket);

    // Send welcome message
    socket.send(JSON.stringify({
      type: 'connected',
      tenantId: socket.tenantId,
      userId: socket.userId,
      timestamp: new Date().toISOString(),
    }));

    console.log(`[ws] Client connected: tenant=${socket.tenantId} user=${socket.userId}`);

    // ─── Heartbeat ────────────────────────────────────────────────
    socket.on('pong', () => {
      socket.isAlive = true;
    });

    // ─── Handle messages from client ──────────────────────────────
    socket.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());

        // Handle ping from client
        if (msg.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
          return;
        }

        // Clients can subscribe to specific event types
        if (msg.type === 'subscribe') {
          // For now, all tenant events are forwarded.
          // Future: filter by msg.eventTypes
          socket.send(JSON.stringify({ type: 'subscribed', eventTypes: msg.eventTypes }));
          return;
        }
      } catch {
        // Ignore malformed messages
      }
    });

    // ─── Cleanup on disconnect ────────────────────────────────────
    socket.on('close', () => {
      const connections = tenantConnections.get(socket.tenantId);
      if (connections) {
        connections.delete(socket);
        if (connections.size === 0) {
          tenantConnections.delete(socket.tenantId);
          const handler = tenantHandlers.get(socket.tenantId);
          if (handler) {
            tenantHandlers.delete(socket.tenantId);
            void eventBus.unsubscribeTenant(socket.tenantId, handler).catch((err) => {
              console.error(`[ws] Failed to unsubscribe tenant ${socket.tenantId}:`, err);
            });
          }
        }
      }
      console.log(`[ws] Client disconnected: tenant=${socket.tenantId} user=${socket.userId}`);
    });

    socket.on('error', (err) => {
      console.error(`[ws] Socket error for user=${socket.userId}:`, err.message);
    });
  });

  // ─── Heartbeat interval ─────────────────────────────────────────
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const socket = ws as AuthenticatedSocket;
      if (!socket.isAlive) {
        socket.terminate();
        return;
      }
      socket.isAlive = false;
      socket.ping();
    });
  }, 30_000); // Every 30 seconds

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  console.log('[ws] WebSocket gateway ready on /ws');
  return wss;
}
