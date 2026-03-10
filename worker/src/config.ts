export interface Env {
  // KV namespaces
  USED_TX_HASHES: KVNamespace;
  AUTH_TOKEN_CACHE: KVNamespace;
  SHUTDOWN_TOKENS: KVNamespace;

  // Secrets
  RPC_URL: string;
  RECEIVER_ADDRESS: string;
  SOCKET_API_USER: string;
  SOCKET_API_PASSWORD: string;
  DEFAULT_DEVICE_PN: string;
  DEFAULT_DEVICE_SN: string;
  DEFAULT_DEVICE_DEVADDR: string;
  DEFAULT_DEVICE_DEVCODE: string;

  // Vars
  CHAIN_ID: string;
  USDC_CONTRACT: string;
  PAYMENT_AMOUNT: string;
  SOCKET_API_BASE_URL: string;
  POWER_ON_DURATION: string;
}
