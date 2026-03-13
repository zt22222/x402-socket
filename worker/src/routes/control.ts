import type { Hono } from 'hono';
import type { Env } from '../config';
import { controlDevice } from '../services/socket-platform';

export function controlRoute(app: Hono<{ Bindings: Env }>) {
  app.post('/control', async (c) => {
    const { pn, action } = await c.req.json();

    if (!pn || typeof pn !== 'string') {
      return c.json({ error: 'Missing or invalid "pn" parameter' }, 400);
    }

    if (action !== 'ON' && action !== 'OFF') {
      return c.json({ error: '"action" must be "ON" or "OFF"' }, 400);
    }

    const result = await controlDevice(pn, action, c.env);
    if (result.success) {
      return c.json({ success: true });
    } else {
      return c.json({ success: false, error: result.error }, 500);
    }
  });
}
