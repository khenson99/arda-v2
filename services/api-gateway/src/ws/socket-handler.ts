import { Server as HttpServer } from 'http';
import { Server as SocketServer, type Socket } from 'socket.io';
import { verifyAccessToken, type JwtPayload } from '@arda/auth-utils';
import { config, createLogger } from '@arda/config';
import { getEventBus } from '@arda/events';
import { db, schema } from '@arda/db';
import { eq, and } from 'drizzle-orm';
import type { RealtimeProtocolVersion } from '@arda/shared-types';
import { BackpressureBridge, type LiveEmission } from './backpressure.js';
import { ReplayService } from './replay-service.js';

interface AuthenticatedSocket extends Socket {
  user: JwtPayload;
}

const log = createLogger('ws');

type ReplayMode = 'replaying' | 'flushing' | 'live';

interface ReplayHandshakeOptions {
  lastEventId?: string;
  protocolVersion?: RealtimeProtocolVersion;
}

function parseOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseProtocolVersion(value: unknown): RealtimeProtocolVersion | undefined {
  if (value === '1' || value === '2') return value;
  return undefined;
}

export function parseReplayHandshakeOptions(auth: unknown): ReplayHandshakeOptions {
  if (!auth || typeof auth !== 'object') return {};

  const candidate = auth as {
    lastEventId?: unknown;
    protocolVersion?: unknown;
  };

  return {
    lastEventId: parseOptionalString(candidate.lastEventId),
    protocolVersion: parseProtocolVersion(candidate.protocolVersion),
  };
}

export function setupWebSocket(httpServer: HttpServer, redisUrl: string): SocketServer {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: config.APP_URL,
      credentials: true,
    },
    path: '/socket.io',
    // Socket.IO built-in heartbeat (transport-level ping/pong)
    pingInterval: 25_000,
    pingTimeout: 10_000,
  });

  const eventBus = getEventBus(redisUrl);
  const backpressureBridge = new BackpressureBridge(eventBus);
  const replayService = new ReplayService(redisUrl);

  // Auth middleware — verify JWT from handshake
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) {
        return next(new Error('Authentication required'));
      }
      const payload = verifyAccessToken(token);
      (socket as AuthenticatedSocket).user = payload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const user = (socket as AuthenticatedSocket).user;
    const tenantId = user.tenantId;
    const replayHandshake = parseReplayHandshakeOptions(socket.handshake.auth);
    const bufferedLiveEmissions: LiveEmission[] = [];
    let replayMode: ReplayMode = replayHandshake.lastEventId ? 'replaying' : 'live';
    let disconnected = false;
    let detachSubscriber: (() => Promise<void>) | null = null;

    log.info({ userId: user.sub, tenantId }, 'Client connected');

    // Join tenant room
    const tenantRoom = `tenant:${tenantId}`;
    socket.join(tenantRoom);

    const emitLive = (emission: LiveEmission): void => {
      if (disconnected) return;
      socket.emit(emission.eventName, emission.payload);
    };

    const flushBufferedLiveEmissions = (): void => {
      replayMode = 'flushing';
      while (bufferedLiveEmissions.length > 0) {
        const pending = bufferedLiveEmissions.splice(0, bufferedLiveEmissions.length);
        for (const emission of pending) {
          emitLive(emission);
        }
      }
      replayMode = 'live';
    };

    void backpressureBridge
      .attachSubscriber(tenantId, {
        id: socket.id,
        emit: (emission) => {
          if (replayMode === 'live') {
            emitLive(emission);
            return;
          }
          bufferedLiveEmissions.push(emission);
        },
      })
      .then((detach) => {
        if (disconnected) {
          void detach();
          return;
        }
        detachSubscriber = detach;
      })
      .catch((err) => {
        log.error({ err, tenantId, userId: user.sub }, 'Failed to subscribe tenant event stream');
        socket.emit('error', {
          message: 'Failed to subscribe to realtime stream',
          code: 'REALTIME_SUBSCRIBE_FAILED',
          retryable: true,
        });
      });

    // Send welcome message
    socket.emit('connected', {
      tenantId,
      userId: user.sub,
      timestamp: new Date().toISOString(),
      protocolVersion: replayHandshake.protocolVersion,
      lastEventId: replayHandshake.lastEventId,
    });

    if (replayHandshake.lastEventId) {
      void replayService
        .replayMissedEvents(
          {
            tenantId,
            lastEventId: replayHandshake.lastEventId,
            protocolVersion: replayHandshake.protocolVersion,
          },
          {
            emitEvent: (event) => {
              if (disconnected) return;
              socket.emit(event.type, event);
            },
            emitControl: (type, payload) => {
              if (disconnected) return;
              socket.emit(type, payload);
            },
          },
        )
        .catch((err) => {
          log.error(
            { err, tenantId, userId: user.sub, lastEventId: replayHandshake.lastEventId },
            'Failed to replay missed events',
          );
          if (!disconnected) {
            socket.emit('resync_required', {
              reason: 'replay_failed',
              lastEventId: replayHandshake.lastEventId,
              protocolVersion: replayHandshake.protocolVersion,
            });
          }
        })
        .finally(() => {
          flushBufferedLiveEmissions();
        });
    }

    // Handle client-side ping (application-level keepalive)
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date().toISOString() });
    });

    // Client can request specific event subscriptions (verify tenant ownership)
    socket.on('subscribe:loop', async (loopId: string) => {
      try {
        const loop = await db.query.kanbanLoops.findFirst({
          where: and(
            eq(schema.kanbanLoops.id, loopId),
            eq(schema.kanbanLoops.tenantId, tenantId)
          ),
          columns: { id: true },
        });
        if (!loop) {
          socket.emit('error', { message: 'Loop not found or access denied' });
          return;
        }
        socket.join(`loop:${loopId}`);
      } catch {
        socket.emit('error', { message: 'Failed to subscribe to loop' });
      }
    });

    socket.on('unsubscribe:loop', (loopId: string) => {
      socket.leave(`loop:${loopId}`);
    });

    socket.on('disconnect', () => {
      disconnected = true;
      log.info({ userId: user.sub }, 'Client disconnected');
      if (detachSubscriber) {
        void detachSubscriber();
      }
    });
  });

  log.info('Socket.IO WebSocket handler ready on /socket.io');
  return io;
}
