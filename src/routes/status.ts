import { Router, Request, Response } from 'express';
import { config } from '../config';
import { getDeviceStatus } from '../services/socket-platform';

const router = Router();

router.get('/status', async (req: Request, res: Response) => {
  const pn = (req.query.pn as string) || config.defaultDevicePn;

  const status = await getDeviceStatus(pn);
  if (!status) {
    res.status(502).json({ error: 'Failed to query device status' });
    return;
  }

  res.json({
    device: {
      pn: status.deviceId,
      online: status.online,
      power: status.power,
    },
  });
});

export default router;
