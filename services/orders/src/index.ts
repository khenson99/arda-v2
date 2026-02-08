import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from '@arda/config';
import { authMiddleware } from '@arda/auth-utils';
import { purchaseOrdersRouter } from './routes/purchase-orders.routes.js';
import { workOrdersRouter } from './routes/work-orders.routes.js';
import { workCentersRouter } from './routes/work-centers.routes.js';
import { transferOrdersRouter } from './routes/transfer-orders.routes.js';
import { orderQueueRouter } from './routes/order-queue.routes.js';
import { errorHandler } from './middleware/error-handler.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.APP_URL, credentials: true }));
app.use(express.json({ limit: '5mb' }));

// Health
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'orders', timestamp: new Date().toISOString() });
});

// Routes — all are behind auth via the API gateway
app.use(authMiddleware);
app.use('/purchase-orders', purchaseOrdersRouter);
app.use('/work-orders', workOrdersRouter);
app.use('/work-centers', workCentersRouter);
app.use('/transfer-orders', transferOrdersRouter);
app.use('/queue', orderQueueRouter);

app.use(errorHandler);

const PORT = config.ORDERS_SERVICE_PORT;
app.listen(PORT, () => {
  console.log(`[orders-service] Running on port ${PORT}`);
});

export default app;
