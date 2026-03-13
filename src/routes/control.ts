import { Router, Request, Response } from 'express';
import { controlDevice } from '../services/socket-platform';

const router = Router();

router.post('/control', async (req: Request, res: Response) => {
  const { pn, action } = req.body;

  if (!pn || typeof pn !== 'string') {
    res.status(400).json({ error: 'Missing or invalid "pn" parameter' });
    return;
  }

  if (action !== 'ON' && action !== 'OFF') {
    res.status(400).json({ error: '"action" must be "ON" or "OFF"' });
    return;
  }

  const result = await controlDevice(pn, action);
  if (result.success) {
    res.json({ success: true });
  } else {
    res.status(500).json({ success: false, error: result.error });
  }
});

export default router;
