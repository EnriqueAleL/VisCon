export type AdminErrorCode = 'forbidden' | 'not_found' | 'invalid_input' | 'conflict' | 'rate_limited';

export class AdminError extends Error {
  constructor(readonly code: AdminErrorCode, message: string, readonly retryAfterSeconds?: number) {
    super(message);
    this.name = 'AdminError';
  }
}
