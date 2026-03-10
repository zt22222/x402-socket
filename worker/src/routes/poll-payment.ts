import type { Hono } from 'hono';
import type { Env } from '../config';
import { pollPayment, getLatestBlock } from '../services/blockchain';

export function pollPaymentRoute(app: Hono<{ Bindings: Env }>) {
  app.get('/latest-block', async (c) => {
    try {
      const blockNumber = await getLatestBlock(c.env);
      return c.json({ blockNumber });
    } catch (err: any) {
      return c.json({ error: 'Failed to get latest block' }, 502);
    }
  });

  app.get('/poll-payment', async (c) => {
    const sinceBlockStr = c.req.query('sinceBlock');
    const sinceBlock = parseInt(sinceBlockStr || '', 10);

    if (!sinceBlock || isNaN(sinceBlock)) {
      return c.json({ error: 'sinceBlock (block number) is required' }, 400);
    }

    const result = await pollPayment(sinceBlock, c.env);
    return c.json(result);
  });
}
