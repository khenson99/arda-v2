import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config, serviceUrls } from '@arda/config';
import { setupProxies } from './routes/proxy.js';
import { requestLogger } from './middleware/request-logger.js';
import { setupWebSocketGateway } from './ws-gateway.js';
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
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'api-gateway',
    timestamp: new Date().toISOString(),
  });
});

// ─── Service Proxies ──────────────────────────────────────────────────
setupProxies(app);

// ─── 404 Handler ──────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Start Server ─────────────────────────────────────────────────────
const PORT = config.API_GATEWAY_PORT;
const server = createServer(app);

// Setup WebSocket handlers
setupWebSocketGateway(server);
setupWebSocket(server, config.REDIS_URL);

server.listen(PORT, () => {
  console.log(`[api-gateway] Running on port ${PORT}`);
  console.log(`[api-gateway] Proxying to services:`);
  console.log(`  auth     → ${serviceUrls.auth}`);
  console.log(`  catalog  → ${serviceUrls.catalog}`);
  console.log(`  kanban   → ${serviceUrls.kanban}`);
  console.log(`  orders   → ${serviceUrls.orders}`);
  console.log(`  notify   → ${serviceUrls.notifications}`);
});

export default app;
