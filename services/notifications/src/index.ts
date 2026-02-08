import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from '@arda/config';
import { authMiddleware } from '@arda/auth-utils';
import { notificationsRouter } from './routes/notifications.routes.js';
import { preferencesRouter } from './routes/preferences.routes.js';
import { errorHandler } from './middleware/error-handler.js';
import { startEventListener } from './services/event-listener.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.APP_URL, credentials: true }));
app.use(express.json({ limit: '5mb' }));

// Health
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'notifications', timestamp: new Date().toISOString() });
});

// Routes — all are behind auth via the API gateway
app.use(authMiddleware);
app.use('/notifications', notificationsRouter);
app.use('/preferences', preferencesRouter);

app.use(errorHandler);

const PORT = config.NOTIFICATIONS_SERVICE_PORT;
app.listen(PORT, () => {
  console.log(`[notifications-service] Running on port ${PORT}`);
});

// Start event listener
startEventListener(config.REDIS_URL).catch((err) => {
  console.error('[notifications-service] Failed to start event listener:', err);
  process.exit(1);
});

export default app;
