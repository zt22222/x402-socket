import { createPublicClient, http, parseUnits, keccak256, toBytes } from 'viem';
import { polygon } from 'viem/chains';
import type { Env } from '../config';
import { logger } from '../utils/logger';

const ERC20_TRANSFER_TOPIC = keccak256(toBytes('Transfer(address,address,uint256)'));

function getClient(env: Env) {
  return createPublicClient({
    chain: polygon,
    transport: http(env.RPC_URL),
  });
}

export interface VerifyResult {
  success: boolean;
  error?: string;
}

export async function verifyPayment(txHash: string, env: Env): Promise<VerifyResult> {
  const normalizedHash = txHash.toLowerCase();

  // 1. KV 防重放检查
  const existing = await env.USED_TX_HASHES.get(normalizedHash);
  if (existing) {
    return { success: false, error: 'Transaction already used' };
  }

  try {
    const client = getClient(env);

    // 2. 获取交易回执
    const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
    if (!receipt) {
      return { success: false, error: 'Transaction not found or not yet confirmed' };
    }

    // 3. 检查交易状态 (viem: 'success' | 'reverted')
    if (receipt.status !== 'success') {
      return { success: false, error: 'Transaction failed on-chain' };
    }

    // 4. 解析 ERC-20 Transfer 事件
    const usdcAddress = env.USDC_CONTRACT.toLowerCase();
    const receiverAddress = env.RECEIVER_ADDRESS.toLowerCase();
    const requiredAmount = parseUnits(env.PAYMENT_AMOUNT, 6);

    let validTransfer = false;

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== usdcAddress) continue;
      if (log.topics[0] !== ERC20_TRANSFER_TOPIC) continue;
      if (log.topics.length < 3) continue;

      // topics[2] = to address (padded to 32 bytes)
      const toAddress = '0x' + log.topics[2]!.slice(26).toLowerCase();
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

    // 5. 验证通过
    logger.info('Payment verified', { txHash, receiver: receiverAddress });

    return { success: true };
  } catch (err: any) {
    logger.error('Blockchain verification error', { txHash, error: err.message });
    return { success: false, error: 'Verification failed: ' + err.message };
  }
}

export async function isTxHashUsed(txHash: string, env: Env): Promise<boolean> {
  const result = await env.USED_TX_HASHES.get(txHash.toLowerCase());
  return result !== null;
}

export interface PollResult {
  found: boolean;
  txHash?: string;
}

export async function getLatestBlock(env: Env): Promise<number> {
  const client = getClient(env);
  const blockNumber = await client.getBlockNumber();
  return Number(blockNumber);
}

export async function pollPayment(sinceBlock: number, env: Env): Promise<PollResult> {
  const requiredAmount = parseUnits(env.PAYMENT_AMOUNT, 6);
  const receiverAddress = env.RECEIVER_ADDRESS.toLowerCase();
  const receiverPadded = ('0x' + receiverAddress.slice(2).padStart(64, '0')) as `0x${string}`;

  try {
    const client = getClient(env);
    const latestBlock = await client.getBlockNumber();

    if (BigInt(sinceBlock) > latestBlock) {
      return { found: false };
    }

    const logs = await client.getLogs({
      address: env.USDC_CONTRACT as `0x${string}`,
      topics: [ERC20_TRANSFER_TOPIC, null, receiverPadded],
      fromBlock: BigInt(sinceBlock),
      toBlock: latestBlock,
    });

    for (const log of logs) {
      const txHash = log.transactionHash.toLowerCase();

      // KV 检查是否已使用
      const used = await env.USED_TX_HASHES.get(txHash);
      if (used) continue;

      const amount = BigInt(log.data);
      if (amount < requiredAmount) continue;

      // 预验证：确保这笔交易能通过完整校验
      const preCheck = await verifyPayment(log.transactionHash, env);
      if (!preCheck.success) {
        logger.warn('pollPayment: skipping tx that failed pre-verify', {
          txHash: log.transactionHash,
          error: preCheck.error,
        });
        continue;
      }

      return { found: true, txHash: log.transactionHash };
    }

    return { found: false };
  } catch (err: any) {
    logger.error('pollPayment error', { error: err.message });
    return { found: false };
  }
}
