import crypto from 'crypto';
import { config } from '../config';
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

// Cached token
let cachedToken: TokenInfo | null = null;

function sha1(data: string): string {
  return crypto.createHash('sha1').update(data).digest('hex').toLowerCase();
}

function hmacSha256(data: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

function sign(uri: string, secret: string): string {
  return hmacSha256(uri, secret);
}

function buildAuthHeaders(token: TokenInfo, uri: string) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token.token}`,
    'i18n': 'en_US',
    'secret': token.secret,
    'token': token.token,
    'sign': sign(uri, token.secret),
    'auth': token.auth,
    'project': 'LITE',
  };
}

async function login(): Promise<TokenInfo> {
  const password = sha1(config.socketApiPassword);
  const url = config.socketApiBaseUrl + URI_LOGIN;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      account: config.socketApiUser,
      password,
      project: 'LITE',
    }),
  });

  const data = await res.json() as any;
  if (data.code !== 0) {
    throw new Error(`Login failed: ${data.err || data.message || 'unknown error'}`);
  }

  const auth = res.headers.get('auth') || '';
  const tokenInfo: TokenInfo = {
    token: data.data.token,
    secret: data.data.secret,
    auth,
  };

  cachedToken = tokenInfo;
  logger.info('ShineMonitor login success');
  return tokenInfo;
}

async function getToken(): Promise<TokenInfo> {
  if (cachedToken) return cachedToken;
  return login();
}

async function callWithRetry<T>(fn: (token: TokenInfo) => Promise<T>): Promise<T> {
  let token = await getToken();
  try {
    return await fn(token);
  } catch (err: any) {
    // Token expired, re-login and retry once
    logger.warn('API call failed, re-logging in', { error: err.message });
    token = await login();
    return fn(token);
  }
}

export async function controlDevice(pn: string, action: 'ON' | 'OFF'): Promise<ControlResponse> {
  const val = action === 'ON' ? '1' : '0';

  try {
    return await callWithRetry(async (token) => {
      const url = config.socketApiBaseUrl + URI_CONTROL_DEVICE;
      const headers = buildAuthHeaders(token, URI_CONTROL_DEVICE);

      const res = await fetch(url, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ pn, val, id: 8 }),
      });

      const data = await res.json() as any;
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

export async function getDeviceStatus(pn: string): Promise<DeviceStatus | null> {
  const sn = config.defaultDeviceSn;
  const devaddr = config.defaultDeviceDevaddr;
  const devcode = config.defaultDeviceDevcode;

  try {
    return await callWithRetry(async (token) => {
      const query = `?pn=${pn}&sn=${sn}&devaddr=${devaddr}&devcode=${devcode}`;
      const uri = URI_SINGLE_DEVICE_INFO + query;
      const url = config.socketApiBaseUrl + uri;
      const headers = buildAuthHeaders(token, URI_SINGLE_DEVICE_INFO);

      const res = await fetch(url, {
        method: 'GET',
        headers,
      });

      const data = await res.json() as any;
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
