import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),

  // Blockchain
  rpcUrl: process.env.RPC_URL || 'https://polygon-mainnet.infura.io/v3/YOUR_INFURA_API_KEY',
  chainId: parseInt(process.env.CHAIN_ID || '137', 10),
  usdcContract: process.env.USDC_CONTRACT || '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  receiverAddress: process.env.RECEIVER_ADDRESS || '',
  paymentAmount: process.env.PAYMENT_AMOUNT || '0.01',
  walletConnectProjectId: process.env.WALLETCONNECT_PROJECT_ID || '',

  // ShineMonitor Socket Platform
  socketApiBaseUrl: process.env.SOCKET_API_BASE_URL || 'https://api.litexmonitor.com',
  socketApiUser: process.env.SOCKET_API_USER || 'aitos',
  socketApiPassword: process.env.SOCKET_API_PASSWORD || 'a123456',
  defaultDevicePn: process.env.DEFAULT_DEVICE_PN || '',
  defaultDeviceSn: process.env.DEFAULT_DEVICE_SN || '',
  defaultDeviceDevaddr: process.env.DEFAULT_DEVICE_DEVADDR || '',
  defaultDeviceDevcode: process.env.DEFAULT_DEVICE_DEVCODE || '',

  // Redis
  redisHost: process.env.REDIS_HOST || '127.0.0.1',
  redisPort: parseInt(process.env.REDIS_PORT || '6379', 10),

  // Timer
  powerOnDuration: parseInt(process.env.POWER_ON_DURATION || '15', 10),
};
