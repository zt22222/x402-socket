import { Router, Request, Response } from 'express';
import { pollPayment, getLatestBlock } from '../services/blockchain';

const router = Router();

router.get('/latest-block', async (req: Request, res: Response) => {
  try {
    const blockNumber = await getLatestBlock();
    res.json({ blockNumber });
  } catch (err: any) {
    res.status(502).json({ error: 'Failed to get latest block' });
  }
});

router.get('/poll-payment', async (req: Request, res: Response) => {
  const sinceBlock = parseInt(req.query.sinceBlock as string, 10);

  if (!sinceBlock || isNaN(sinceBlock)) {
    res.status(400).json({ error: 'sinceBlock (block number) is required' });
    return;
  }

  const result = await pollPayment(sinceBlock);
  res.json(result);
});

export default router;
