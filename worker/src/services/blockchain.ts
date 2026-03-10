import type { Env } from '../config';
import { logger } from '../utils/logger';

// Hardcoded keccak256('Transfer(address,address,uint256)')
const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

async function rpc(url: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

function parseUnits(amount: string, decimals: number): bigint {
  const [whole, frac = ''] = amount.split('.');
  const padded = frac.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole + padded);
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
    // 2. 获取交易回执
    const receipt = (await rpc(env.RPC_URL, 'eth_getTransactionReceipt', [txHash])) as {
      status: string;
      logs: Array<{ address: string; topics: string[]; data: string; transactionHash: string }>;
    } | null;

    if (!receipt) {
      return { success: false, error: 'Transaction not found or not yet confirmed' };
    }

    // 3. 检查交易状态 (0x1 = success)
    if (receipt.status !== '0x1') {
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
  const hex = (await rpc(env.RPC_URL, 'eth_blockNumber', [])) as string;
  return parseInt(hex, 16);
}

export async function pollPayment(sinceBlock: number, env: Env): Promise<PollResult> {
  const requiredAmount = parseUnits(env.PAYMENT_AMOUNT, 6);
  const receiverAddress = env.RECEIVER_ADDRESS.toLowerCase();
  const receiverPadded = '0x' + receiverAddress.slice(2).padStart(64, '0');

  try {
    const latestBlock = await getLatestBlock(env);

    if (sinceBlock > latestBlock) {
      return { found: false };
    }

    const logs = (await rpc(env.RPC_URL, 'eth_getLogs', [
      {
        address: env.USDC_CONTRACT,
        topics: [ERC20_TRANSFER_TOPIC, null, receiverPadded],
        fromBlock: '0x' + sinceBlock.toString(16),
        toBlock: '0x' + latestBlock.toString(16),
      },
    ])) as Array<{ transactionHash: string; data: string }>;

    for (const log of logs) {
      const txHash = log.transactionHash.toLowerCase();

      // KV 检查是否已使用
      const used = await env.USED_TX_HASHES.get(txHash);
      if (used) continue;

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
