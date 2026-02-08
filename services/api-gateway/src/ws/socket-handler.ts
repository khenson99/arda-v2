import { Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { verifyAccessToken } from '@arda/auth-utils';
import { getEventBus, type ArdaEvent } from '@arda/events';

export function setupWebSocket(httpServer: HttpServer, redisUrl: string): SocketServer {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.APP_URL || 'http://localhost:5173',
      credentials: true,
    },
    // Keep Socket.IO isolated from the native ws gateway path.
    path: '/socket.io',
  });

  const eventBus = getEventBus(redisUrl);

  // Auth middleware — verify JWT from handshake
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) {
        return next(new Error('Authentication required'));
      }
      const payload = verifyAccessToken(token);
      (socket as any).user = payload;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const user = (socket as any).user;
    const tenantId = user.tenantId;

    console.log(`[ws] Client connected: ${user.sub} (tenant: ${tenantId})`);

    // Join tenant room
    socket.join(`tenant:${tenantId}`);

    // Subscribe to tenant events via Redis and forward to Socket.io room
    const handler = (event: ArdaEvent) => {
      io.to(`tenant:${tenantId}`).emit(event.type, event);
    };

    eventBus.subscribeTenant(tenantId, handler);

    // Client can request specific event subscriptions
    socket.on('subscribe:loop', (loopId: string) => {
      socket.join(`loop:${loopId}`);
    });

    socket.on('unsubscribe:loop', (loopId: string) => {
      socket.leave(`loop:${loopId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[ws] Client disconnected: ${user.sub}`);
      eventBus.unsubscribeTenant(tenantId, handler);
    });
  });

  return io;
}
