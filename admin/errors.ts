export type AdminErrorCode = 'forbidden' | 'not_found' | 'invalid_input' | 'conflict' | 'rate_limited' | 'too_large' | 'unsupported_type' | 'length_required';

export class AdminError extends Error {
  constructor(readonly code: AdminErrorCode, message: string, readonly retryAfterSeconds?: number) {
    super(message);
    this.name = 'AdminError';
  }
}
