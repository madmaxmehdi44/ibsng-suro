import process from 'node:process';

export type AuthType = 'ADMIN' | 'NORMAL_USER' | 'VOIP_USER';

export interface Config {
  ibsngUrl: string;
  authType: AuthType;
  authName: string;
  authPass?: string;
  authRemoteAddr: string;
  authSession?: string;
  mcpHost: string;
  mcpPort: number;
  mcpAuthToken?: string;
  enableRawCall: boolean;
  requestTimeoutMs: number;
}

export function loadConfig(): Config {
  const authType = (process.env.IBS_AUTH_TYPE ?? 'ADMIN') as AuthType;
  if (!['ADMIN', 'NORMAL_USER', 'VOIP_USER'].includes(authType)) {
    throw new Error(`Invalid IBS_AUTH_TYPE=${authType}`);
  }

  const authSession = process.env.IBS_AUTH_SESSION || undefined;
  const authPass = process.env.IBS_AUTH_PASS || undefined;
  if (!authSession && !authPass) {
    throw new Error('Set IBS_AUTH_PASS or IBS_AUTH_SESSION');
  }

  return {
    ibsngUrl: process.env.IBSNG_URL ?? 'http://127.0.0.1:1237',
    authType,
    authName: process.env.IBS_AUTH_NAME ?? 'system',
    authPass,
    authRemoteAddr: process.env.IBS_ADDR ?? '127.0.0.1',
    authSession,
    mcpHost: process.env.MCP_HOST ?? '127.0.0.1',
    mcpPort: Number(process.env.MCP_PORT ?? '3000'),
    mcpAuthToken: process.env.MCP_AUTH_TOKEN || undefined,
    enableRawCall: process.env.IBSNG_ENABLE_RAW_CALL === 'true',
    requestTimeoutMs: Number(process.env.IBSNG_TIMEOUT_MS ?? '15000')
  };
}
