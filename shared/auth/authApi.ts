export interface AuthAccount { username: string; verified: boolean; status?: 'pending' | 'verified' | 'expired' | 'disabled' }
export interface AuthStatus { required: boolean; account: AuthAccount | null }

export class AuthApiError extends Error {
  constructor(message: string, readonly code?: string, readonly retryAfterSeconds?: number) { super(message); }
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/auth/${path}`, {
      method, credentials: 'same-origin', headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch { throw new AuthApiError('network', 'network'); }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new AuthApiError(data?.error ?? 'Something went wrong.', data?.code ?? (response.status >= 500 ? 'server' : undefined), data?.retryAfterSeconds);
  return data as T;
}

export const authApi = {
  status: () => call<AuthStatus>('GET', 'me'),
  register: (identifier: string, password: string) => call<{ sentTo: string; username: string }>('POST', 'register', { identifier, password }),
  verify: (identifier: string, code: string) => call<{ account: AuthAccount }>('POST', 'verify', { identifier, code }),
  resend: (identifier: string) => call<unknown>('POST', 'resend', { identifier }),
  login: (identifier: string, password: string) => call<{ account: AuthAccount }>('POST', 'login', { identifier, password }),
  logout: () => call<unknown>('POST', 'logout', {}),
  forgot: (identifier: string) => call<unknown>('POST', 'forgot', { identifier }),
  reset: (identifier: string, code: string, password: string) => call<unknown>('POST', 'reset', { identifier, code, password }),
};
