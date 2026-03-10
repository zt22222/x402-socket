import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './config';
import { errorHandler } from './middleware/error-handler';
import { startWorker, shutdown } from './services/task-scheduler';
import { logger } from './utils/logger';
import activateRouter from './routes/activate';
import verifyRouter from './routes/verify';
import statusRouter from './routes/status';
import pollPaymentRouter from './routes/poll-payment';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Static files (frontend landing page)
app.use(express.static(path.join(__dirname, '..', 'public')));

// API Routes
app.use(activateRouter);
app.use(verifyRouter);
app.use(statusRouter);
app.use(pollPaymentRouter);

// Error handler
app.use(errorHandler);

// Start server
app.listen(config.port, () => {
  logger.info(`x402 Socket Server running on port ${config.port}`);
  logger.info(`Landing page: http://localhost:${config.port}`);
});

// Start BullMQ worker
startWorker();

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down...');
  await shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down...');
  await shutdown();
  process.exit(0);
});
