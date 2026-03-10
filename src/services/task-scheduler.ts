import { config } from '../config';
import { controlDevice } from './socket-platform';
import { logger } from '../utils/logger';

// In-memory task scheduler (production should use BullMQ + Redis)
const activeTasks = new Map<string, NodeJS.Timeout>();
const MAX_RETRIES = 3;

export async function scheduleOff(deviceId: string, delaySeconds: number): Promise<void> {
  const taskId = `${deviceId}-${Date.now()}`;

  const timer = setTimeout(async () => {
    await executeOff(deviceId, taskId, 0);
    activeTasks.delete(taskId);
  }, delaySeconds * 1000);

  activeTasks.set(taskId, timer);
  logger.info('Scheduled OFF task', { deviceId, delaySeconds, taskId });
}

async function executeOff(deviceId: string, taskId: string, attempt: number): Promise<void> {
  logger.info('Executing OFF task', { deviceId, taskId, attempt: attempt + 1 });

  const result = await controlDevice(deviceId, 'OFF');

  if (result.success) {
    logger.info('Device turned OFF successfully', { deviceId, taskId });
    return;
  }

  if (attempt < MAX_RETRIES - 1) {
    logger.warn('OFF failed, retrying...', { deviceId, taskId, attempt: attempt + 1, error: result.error });
    await new Promise((r) => setTimeout(r, 2000));
    return executeOff(deviceId, taskId, attempt + 1);
  }

  logger.error('OFF task failed after max retries', { deviceId, taskId, error: result.error });
}

export function startWorker(): void {
  logger.info('Task scheduler started (in-memory mode)');
}

export async function shutdown(): Promise<void> {
  for (const [taskId, timer] of activeTasks) {
    clearTimeout(timer);
    logger.info('Cancelled pending OFF task', { taskId });
  }
  activeTasks.clear();
}
