import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from '@arda/config';
import { authMiddleware } from '@arda/auth-utils';
import { loopsRouter } from './routes/loops.routes.js';
import { cardsRouter } from './routes/cards.routes.js';
import { scanRouter } from './routes/scan.routes.js';
import { velocityRouter } from './routes/velocity.routes.js';
import { errorHandler } from './middleware/error-handler.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.APP_URL, credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'kanban', timestamp: new Date().toISOString() });
});

// Public scan endpoint (gateway allows /scan/* without auth)
app.use('/scan', scanRouter);

// Authenticated routes
app.use(authMiddleware);
app.use('/loops', loopsRouter);
app.use('/cards', cardsRouter);
app.use('/velocity', velocityRouter);

app.use(errorHandler);

const PORT = config.KANBAN_SERVICE_PORT;
app.listen(PORT, () => {
  console.log(`[kanban-service] Running on port ${PORT}`);
});

export default app;
