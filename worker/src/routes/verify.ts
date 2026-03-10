import type { Hono } from 'hono';
import type { Env } from '../config';
import { verifyPayment } from '../services/blockchain';
import { controlDevice } from '../services/socket-platform';
import { logger } from '../utils/logger';

export function verifyRoute(app: Hono<{ Bindings: Env }>) {
  app.post('/verify', async (c) => {
    const { txHash, pn } = await c.req.json();
    const devicePn = pn || c.env.DEFAULT_DEVICE_PN;
    const duration = parseInt(c.env.POWER_ON_DURATION, 10);

    if (!txHash || typeof txHash !== 'string') {
      return c.json({ error: 'txHash is required' }, 400);
    }

    if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      return c.json({ error: 'Invalid txHash format' }, 400);
    }

    // 1. 链上验证
    const verifyResult = await verifyPayment(txHash, c.env);
    if (!verifyResult.success) {
      return c.json({ error: verifyResult.error, txHash }, 400);
    }

    // 2. 开启插座
    const controlResult = await controlDevice(devicePn, 'ON', c.env);
    if (!controlResult.success) {
      logger.error('Failed to turn on device after successful payment', { txHash, pn: devicePn });
      return c.json(
        {
          error: 'Payment verified but failed to activate device. Please contact support.',
          txHash,
        },
        500,
      );
    }

    // 3. 生成一次性 shutdown token，存入 KV
    const shutdownToken = crypto.randomUUID();
    const kvKey = `shutdown:${devicePn}:${shutdownToken}`;
    await c.env.SHUTDOWN_TOKENS.put(
      kvKey,
      JSON.stringify({ devicePn, createdAt: Date.now(), duration }),
      { expirationTtl: duration + 60 },
    );

    return c.json({
      success: true,
      message: 'Device activated',
      device: {
        pn: devicePn,
        status: 'ON',
        duration,
        shutdownAt: new Date(Date.now() + duration * 1000).toISOString(),
      },
      shutdownToken,
      txHash,
    });
  });
}
