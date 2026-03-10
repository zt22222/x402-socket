import type { Hono } from 'hono';
import type { Env } from '../config';
import { getDeviceStatus } from '../services/socket-platform';

export function statusRoute(app: Hono<{ Bindings: Env }>) {
  app.get('/status', async (c) => {
    const pn = c.req.query('pn') || c.env.DEFAULT_DEVICE_PN;

    const status = await getDeviceStatus(pn, c.env);
    if (!status) {
      return c.json({ error: 'Failed to query device status' }, 502);
    }

    return c.json({
      device: {
        pn: status.deviceId,
        online: status.online,
        power: status.power,
      },
    });
  });
}
