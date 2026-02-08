import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from '@arda/config';
import { authMiddleware } from '@arda/auth-utils';
import { partsRouter } from './routes/parts.routes.js';
import { suppliersRouter } from './routes/suppliers.routes.js';
import { bomRouter } from './routes/bom.routes.js';
import { categoriesRouter } from './routes/categories.routes.js';
import { errorHandler } from './middleware/error-handler.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.APP_URL, credentials: true }));
app.use(express.json({ limit: '5mb' }));

// Health
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'catalog', timestamp: new Date().toISOString() });
});

// Routes — all are behind auth via the API gateway
app.use(authMiddleware);
app.use('/parts', partsRouter);
app.use('/suppliers', suppliersRouter);
app.use('/bom', bomRouter);
app.use('/categories', categoriesRouter);

app.use(errorHandler);

const PORT = config.CATALOG_SERVICE_PORT;
app.listen(PORT, () => {
  console.log(`[catalog-service] Running on port ${PORT}`);
});

export default app;
