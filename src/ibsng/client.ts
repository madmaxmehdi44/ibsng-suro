import { loadConfig, type AuthType } from '../config.js';

type JsonObject = Record<string, unknown>;

export class IBSngError extends Error {
  constructor(message: string, public readonly details?: unknown) {
    super(message);
    this.name = 'IBSngError';
  }
}

export interface IBSngCallOptions {
  method: string;
  params?: JsonObject;
}

interface JsonRpcResponse {
  result?: unknown;
  error?: unknown;
}

export class IBSngClient {
  private readonly config = loadConfig();

  async call({ method, params = {} }: IBSngCallOptions): Promise<unknown> {
    const enriched = { ...params };
    if (this.config.authSession) {
      enriched.auth_session = this.config.authSession;
    } else {
      enriched.auth_type = this.config.authType;
      enriched.auth_name = this.config.authName;
      enriched.auth_pass = this.config.authPass;
      enriched.auth_remoteaddr = this.config.authRemoteAddr;
      enriched.date_type = 'gregorian';
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);

    try {
      const response = await fetch(this.config.ibsngUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ method, params: enriched }),
        signal: controller.signal
      });

      const text = await response.text();
      let data: JsonRpcResponse;
      try {
        data = JSON.parse(text) as JsonRpcResponse;
      } catch {
        throw new IBSngError(`IBSng returned non-JSON response (HTTP ${response.status})`, text.slice(0, 1000));
      }

      if (!response.ok) {
        throw new IBSngError(`IBSng HTTP error ${response.status}`, data.error ?? data.result);
      }
      if (data.error) {
        throw new IBSngError('IBSng JSON-RPC error', data.error);
      }
      return data.result;
    } catch (error) {
      if (error instanceof IBSngError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new IBSngError(`IBSng request timed out after ${this.config.requestTimeoutMs} ms`);
      }
      throw new IBSngError(error instanceof Error ? error.message : String(error));
    } finally {
      clearTimeout(timer);
    }
  }

  async login(authType: AuthType, authName: string, authPass: string): Promise<string> {
    const result = await this.call({
      method: 'login.login',
      params: {
        login_auth_type: authType,
        login_auth_name: authName,
        login_auth_pass: authPass,
        create_session: true,
        auth_remoteaddr: this.config.authRemoteAddr
      }
    });
    if (typeof result !== 'string') {
      throw new IBSngError('IBSng login.login did not return a session id', result);
    }
    return result;
  }
}
