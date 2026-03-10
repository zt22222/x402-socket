import { ethers } from 'ethers';
import { config } from '../config';
import { logger } from '../utils/logger';

const ERC20_TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');

// 防重放：已使用的 txHash 集合
const usedTxHashes = new Set<string>();

const provider = new ethers.JsonRpcProvider(config.rpcUrl);

export interface VerifyResult {
  success: boolean;
  error?: string;
}

export async function verifyPayment(txHash: string): Promise<VerifyResult> {
  // 1. 防重放检查
  const normalizedHash = txHash.toLowerCase();
  if (usedTxHashes.has(normalizedHash)) {
    return { success: false, error: 'Transaction already used' };
  }

  try {
    // 2. 获取交易回执
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
      return { success: false, error: 'Transaction not found or not yet confirmed' };
    }

    // 3. 检查交易状态
    if (receipt.status !== 1) {
      return { success: false, error: 'Transaction failed on-chain' };
    }

    // 4. 解析 ERC-20 Transfer 事件，验证收款地址和金额
    const usdcAddress = config.usdcContract.toLowerCase();
    const receiverAddress = config.receiverAddress.toLowerCase();
    // 0.01 USDC = 10000 (6 decimals)
    const requiredAmount = ethers.parseUnits(config.paymentAmount, 6);

    let validTransfer = false;

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== usdcAddress) continue;
      if (log.topics[0] !== ERC20_TRANSFER_TOPIC) continue;
      if (log.topics.length < 3) continue;

      // topics[2] = to address (padded to 32 bytes)
      const toAddress = '0x' + log.topics[2].slice(26).toLowerCase();
      if (toAddress !== receiverAddress) continue;

      // data = transfer amount
      const amount = BigInt(log.data);
      if (amount >= requiredAmount) {
        validTransfer = true;
        break;
      }
    }

    if (!validTransfer) {
      return { success: false, error: 'No valid USDC transfer found to receiver address with sufficient amount' };
    }

    // 5. 标记 txHash 为已使用
    usedTxHashes.add(normalizedHash);
    logger.info('Payment verified', { txHash, receiver: receiverAddress });

    return { success: true };
  } catch (err: any) {
    logger.error('Blockchain verification error', { txHash, error: err.message });
    return { success: false, error: 'Verification failed: ' + err.message };
  }
}

export function isTxHashUsed(txHash: string): boolean {
  return usedTxHashes.has(txHash.toLowerCase());
}

export interface PollResult {
  found: boolean;
  txHash?: string;
}

/**
 * 获取当前最新区块号，供前端记录轮询起点
 */
export async function getLatestBlock(): Promise<number> {
  return provider.getBlockNumber();
}

/**
 * 查询 sinceBlock 之后是否有符合条件的 USDC Transfer 到收款地址
 * 返回第一个未使用的有效 txHash
 */
export async function pollPayment(sinceBlock: number): Promise<PollResult> {
  const requiredAmount = ethers.parseUnits(config.paymentAmount, 6);
  const receiverAddress = config.receiverAddress.toLowerCase();
  const receiverPadded = '0x' + receiverAddress.slice(2).padStart(64, '0');

  try {
    const latestBlock = await provider.getBlockNumber();

    const logs = await provider.getLogs({
      address: config.usdcContract,
      topics: [ERC20_TRANSFER_TOPIC, null, receiverPadded],
      fromBlock: sinceBlock,
      toBlock: latestBlock,
    });

    for (const log of logs) {
      const txHash = log.transactionHash.toLowerCase();
      if (usedTxHashes.has(txHash)) continue;

      const amount = BigInt(log.data);
      if (amount < requiredAmount) continue;

      return { found: true, txHash: log.transactionHash };
    }

    return { found: false };
  } catch (err: any) {
    logger.error('pollPayment error', { error: err.message });
    return { found: false };
  }
}
