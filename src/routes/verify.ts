import { Router, Request, Response } from 'express';
import { config } from '../config';
import { verifyPayment } from '../services/blockchain';
import { controlDevice } from '../services/socket-platform';
import { scheduleOff } from '../services/task-scheduler';
import { logger } from '../utils/logger';

const router = Router();

router.post('/verify', async (req: Request, res: Response) => {
  const { txHash, pn } = req.body;
  const devicePn = pn || config.defaultDevicePn;

  if (!txHash || typeof txHash !== 'string') {
    res.status(400).json({ error: 'txHash is required' });
    return;
  }

  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    res.status(400).json({ error: 'Invalid txHash format' });
    return;
  }

  // 1. 链上验证
  const verifyResult = await verifyPayment(txHash);
  if (!verifyResult.success) {
    res.status(400).json({ error: verifyResult.error, txHash });
    return;
  }

  // 2. 开启插座
  const controlResult = await controlDevice(devicePn, 'ON');
  if (!controlResult.success) {
    logger.error('Failed to turn on device after successful payment', { txHash, pn: devicePn });
    res.status(500).json({
      error: 'Payment verified but failed to activate device. Please contact support.',
      txHash,
    });
    return;
  }

  // 3. 调度定时关闭任务
  await scheduleOff(devicePn, config.powerOnDuration);

  res.json({
    success: true,
    message: 'Device activated',
    device: {
      pn: devicePn,
      status: 'ON',
      duration: config.powerOnDuration,
      shutdownAt: new Date(Date.now() + config.powerOnDuration * 1000).toISOString(),
    },
    txHash,
  });
});

export default router;
