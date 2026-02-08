import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from '@arda/config';
import { authRouter } from './routes/auth.routes.js';
import { tenantRouter } from './routes/tenant.routes.js';
import { errorHandler } from './middleware/error-handler.js';

const app = express();

// ─── Global Middleware ────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: config.APP_URL, credentials: true }));
app.use(express.json({ limit: '1mb' }));

// ─── Health Check ─────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'auth', timestamp: new Date().toISOString() });
});

// ─── Routes ───────────────────────────────────────────────────────────
app.use('/auth', authRouter);
app.use('/tenants', tenantRouter);

// ─── Error Handler ────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start Server ─────────────────────────────────────────────────────
const PORT = config.AUTH_SERVICE_PORT;
app.listen(PORT, () => {
  console.log(`[auth-service] Running on port ${PORT}`);
  console.log(`[auth-service] Environment: ${config.NODE_ENV}`);
});

export default app;
