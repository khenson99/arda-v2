import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config, serviceUrls, createLogger } from '@arda/config';

const log = createLogger('api-gateway');
import { db } from '@arda/db';
import { sql } from 'drizzle-orm';
import { setupProxies } from './routes/proxy.js';
import { requestLogger } from './middleware/request-logger.js';
import { setupWebSocket } from './ws/socket-handler.js';

const app = express();

// ─── Global Middleware ────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: config.APP_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});
app.use(limiter);

// Stricter rate limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many authentication attempts, please try again later' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Logging
app.use(requestLogger);

// ─── Health Check ─────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  const checks: Record<string, string> = {};
  let healthy = true;

  try {
    await db.execute(sql`SELECT 1`);
    checks.database = 'ok';
  } catch {
    checks.database = 'down';
    healthy = false;
  }

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    service: 'api-gateway',
    timestamp: new Date().toISOString(),
    checks,
  });
});

// ─── Service Proxies ──────────────────────────────────────────────────
setupProxies(app);

// ─── 404 Handler ──────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Start Server ─────────────────────────────────────────────────────
const PORT = config.PORT || config.API_GATEWAY_PORT;
const server = createServer(app);

// Setup WebSocket handler (Socket.IO on /socket.io)
const io = setupWebSocket(server, config.REDIS_URL);

server.listen(PORT, () => {
  log.info({ port: PORT, services: serviceUrls }, 'API gateway started');
});

// ─── Graceful Shutdown ───────────────────────────────────────────────
function shutdown(signal: string) {
  log.info({ signal }, 'Shutting down gracefully');

  server.close(() => {
    log.info('HTTP server closed');
  });

  io.close(() => {
    log.info('WebSocket server closed');
  });

  setTimeout(() => {
    log.fatal('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
