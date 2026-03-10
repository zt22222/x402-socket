import type { Hono } from 'hono';
import type { Env } from '../config';
import { controlDevice } from '../services/socket-platform';
import { logger } from '../utils/logger';

export function turnOffRoute(app: Hono<{ Bindings: Env }>) {
  app.post('/turn-off', async (c) => {
    const { token, pn } = await c.req.json();

    if (!token || !pn) {
      return c.json({ error: 'token and pn are required' }, 400);
    }

    const kvKey = `shutdown:${pn}:${token}`;
    const record = await c.env.SHUTDOWN_TOKENS.get(kvKey, 'json') as {
      devicePn: string;
      createdAt: number;
      duration: number;
    } | null;

    if (!record) {
      return c.json({ error: 'Invalid or expired shutdown token' }, 400);
    }

    // 一次性消费，立即删除
    await c.env.SHUTDOWN_TOKENS.delete(kvKey);

    if (record.devicePn !== pn) {
      return c.json({ error: 'Device mismatch' }, 400);
    }

    const result = await controlDevice(pn, 'OFF', c.env);
    if (!result.success) {
      logger.error('turn-off failed', { pn, error: result.error });
      return c.json({ error: 'Failed to turn off device' }, 500);
    }

    logger.info('Device turned OFF via shutdown token', { pn });
    return c.json({ success: true, message: 'Device turned off' });
  });
}
