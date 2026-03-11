import { Router, Request, Response } from 'express';
import { config } from '../config';

const router = Router();

router.get('/activate', async (req: Request, res: Response) => {
  const pn = (req.query.pn as string) || config.defaultDevicePn;

  // 构建 EIP-681 支付 URI
  // ethereum:<contract_address>/transfer?address=<to>&uint256=<amount>
  const amountWei = '10000'; // 0.01 USDC, 6 decimals
  const eip681Uri = `ethereum:${config.usdcContract}/transfer?address=${config.receiverAddress}&uint256=${amountWei}&chainId=${config.chainId}`;

  // 返回 402 Payment Required
  res.status(402).json({
    status: 402,
    message: 'Payment Required',
    payment: {
      receiver: config.receiverAddress,
      amount: config.paymentAmount,
      token: 'USDC',
      tokenContract: config.usdcContract,
      chainId: config.chainId,
      chainName: 'Polygon',
      amountWei: amountWei,
      decimals: 6,
      eip681Uri: eip681Uri,
      walletConnectProjectId: config.walletConnectProjectId,
      expiry: Math.floor(Date.now() / 1000) + 600, // 10 minutes
    },
    device: {
      id: pn,
      duration: config.powerOnDuration,
      unit: 'seconds',
    },
  });
});

export default router;
