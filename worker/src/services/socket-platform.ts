import { sha1, hmacSha256 } from '../utils/crypto';
import type { Env } from '../config';
import { logger } from '../utils/logger';

const URI_LOGIN = '/ppr/web/login/login';
const URI_CONTROL_DEVICE = '/dcc/api/auth/web/collector/lite/controlDevice';
const URI_SINGLE_DEVICE_INFO = '/dev/api/auth/valueCloud/dev/singleDeviceInfo';

interface TokenInfo {
  token: string;
  secret: string;
  auth: string;
}

interface ControlResponse {
  success: boolean;
  error?: string;
}

interface DeviceStatus {
  deviceId: string;
  online: boolean;
  power: 'ON' | 'OFF';
}

async function sign(uri: string, secret: string): Promise<string> {
  return hmacSha256(uri, secret);
}

async function buildAuthHeaders(token: TokenInfo, uri: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token.token}`,
    i18n: 'en_US',
    secret: token.secret,
    token: token.token,
    sign: await sign(uri, token.secret),
    auth: token.auth,
    project: 'LITE',
  };
}

async function login(env: Env): Promise<TokenInfo> {
  const password = await sha1(env.SOCKET_API_PASSWORD);
  const url = env.SOCKET_API_BASE_URL + URI_LOGIN;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      account: env.SOCKET_API_USER,
      password,
      project: 'LITE',
    }),
  });

  const data = (await res.json()) as any;
  if (data.code !== 0) {
    throw new Error(`Login failed: ${data.err || data.message || 'unknown error'}`);
  }

  const auth = res.headers.get('auth') || '';
  const tokenInfo: TokenInfo = {
    token: data.data.token,
    secret: data.data.secret,
    auth,
  };

  // Cache in KV with 1-hour TTL
  await env.AUTH_TOKEN_CACHE.put('shine_token', JSON.stringify(tokenInfo), { expirationTtl: 3600 });
  logger.info('ShineMonitor login success');
  return tokenInfo;
}

async function getToken(env: Env): Promise<TokenInfo> {
  const cached = await env.AUTH_TOKEN_CACHE.get('shine_token', 'json');
  if (cached) return cached as TokenInfo;
  return login(env);
}

async function callWithRetry<T>(env: Env, fn: (token: TokenInfo) => Promise<T>): Promise<T> {
  let token = await getToken(env);
  try {
    return await fn(token);
  } catch (err: any) {
    logger.warn('API call failed, re-logging in', { error: err.message });
    await env.AUTH_TOKEN_CACHE.delete('shine_token');
    token = await login(env);
    return fn(token);
  }
}

export async function controlDevice(pn: string, action: 'ON' | 'OFF', env: Env): Promise<ControlResponse> {
  const val = action === 'ON' ? '1' : '0';

  try {
    return await callWithRetry(env, async (token) => {
      const url = env.SOCKET_API_BASE_URL + URI_CONTROL_DEVICE;
      const headers = await buildAuthHeaders(token, URI_CONTROL_DEVICE);

      const res = await fetch(url, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ pn, val, id: 8 }),
      });

      const data = (await res.json()) as any;
      if (data.code !== 0) {
        logger.error('controlDevice failed', { pn, action, response: data });
        throw new Error(`controlDevice error: code=${data.code}`);
      }

      logger.info('Device control success', { pn, action });
      return { success: true };
    });
  } catch (err: any) {
    logger.error('controlDevice error', { pn, action, error: err.message });
    return { success: false, error: err.message };
  }
}

export async function getDeviceStatus(pn: string, env: Env): Promise<DeviceStatus | null> {
  const sn = env.DEFAULT_DEVICE_SN;
  const devaddr = env.DEFAULT_DEVICE_DEVADDR;
  const devcode = env.DEFAULT_DEVICE_DEVCODE;

  try {
    return await callWithRetry(env, async (token) => {
      const query = `?pn=${pn}&sn=${sn}&devaddr=${devaddr}&devcode=${devcode}`;
      const uri = URI_SINGLE_DEVICE_INFO + query;
      const url = env.SOCKET_API_BASE_URL + uri;
      const headers = await buildAuthHeaders(token, URI_SINGLE_DEVICE_INFO);

      const res = await fetch(url, {
        method: 'GET',
        headers,
      });

      const data = (await res.json()) as any;
      if (data.code !== 0) {
        logger.error('getDeviceStatus failed', { pn, response: data });
        throw new Error(`getDeviceStatus error: code=${data.code}`);
      }

      const device = data.data;
      if (!device) {
        return { deviceId: pn, online: false, power: 'OFF' as const };
      }

      return {
        deviceId: pn,
        online: device.deviceOnlineStatus === 0,
        power: 'OFF' as const,
      };
    });
  } catch (err: any) {
    logger.error('getDeviceStatus error', { pn, error: err.message });
    return null;
  }
}
