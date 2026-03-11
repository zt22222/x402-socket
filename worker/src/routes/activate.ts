import type { Hono } from 'hono';
import type { Env } from '../config';

export function activateRoute(app: Hono<{ Bindings: Env }>) {
  app.get('/activate', (c) => {
    const pn = c.req.query('pn') || c.env.DEFAULT_DEVICE_PN;
    const chainId = parseInt(c.env.CHAIN_ID, 10);
    const duration = parseInt(c.env.POWER_ON_DURATION, 10);
    const amountWei = '10000'; // 0.01 USDC, 6 decimals

    const eip681Uri = `ethereum:${c.env.USDC_CONTRACT}/transfer?address=${c.env.RECEIVER_ADDRESS}&uint256=${amountWei}&chainId=${chainId}`;

    return c.json(
      {
        status: 402,
        message: 'Payment Required',
        payment: {
          receiver: c.env.RECEIVER_ADDRESS,
          amount: c.env.PAYMENT_AMOUNT,
          token: 'USDC',
          tokenContract: c.env.USDC_CONTRACT,
          chainId,
          chainName: 'Polygon',
          amountWei,
          decimals: 6,
          eip681Uri,
          walletConnectProjectId: c.env.WALLETCONNECT_PROJECT_ID,
          expiry: Math.floor(Date.now() / 1000) + 600,
        },
        device: {
          id: pn,
          duration,
          unit: 'seconds',
        },
      },
      402,
    );
  });
}
