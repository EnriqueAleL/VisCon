export type AuthErrorCode =
  | 'invalid_identifier'
  | 'rate_limited'
  | 'mail_unavailable'
  | 'invalid_or_expired'
  | 'too_many_attempts';

export class AuthError extends Error {
  constructor(readonly code: AuthErrorCode, message: string, readonly retryAfterSeconds?: number) {
    super(message);
    this.name = 'AuthError';
  }
}
