import type { Request, Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { AuthError } from '../auth/errors';
import { statusOf } from '../auth/accounts';
import { reverifyDaysFromEnv } from '../auth/guard';
import { windowLimiter } from '../auth/limiter';
import type { AuthPlayer } from '../auth/routes';
import { AdminError } from './errors';

export const ERROR_STATUS = { forbidden: 403, not_found: 404, invalid_input: 400, conflict: 409, rate_limited: 429, too_large: 413, unsupported_type: 415, length_required: 411 } as const;
const AUTH_STATUS: Partial<Record<AuthError['code'], number>> = { invalid_identifier: 404, rate_limited: 429 };

/** The acting user: a logged-in player whose account is verified right now. Roles are re-read on every request. */
export function createActorResolver(deps: { db: DatabaseSync; playerFromCookie(cookie?: string): AuthPlayer | null; clock?: () => number; reverifyDays?: number; perMinute?: number }) {
  const clock = deps.clock ?? Date.now;
  const reverifyDays = deps.reverifyDays ?? reverifyDaysFromEnv();
  const perUser = windowLimiter(deps.perMinute ?? 120, 60_000, clock);
  const accountOf = deps.db.prepare('SELECT username, verifiedAt, disabledAt FROM accounts WHERE playerId=?');
  return (req: Request): string => {
    const player = deps.playerFromCookie(req.headers.cookie);
    const row = player && accountOf.get(player.id) as { username: string; verifiedAt: number | null; disabledAt: number | null } | undefined;
    if (!row || statusOf(row, Math.floor(clock() / 1000), reverifyDays) !== 'verified') throw new AdminError('forbidden', 'Log in with a verified ETH account.');
    perUser(row.username);
    return row.username;
  };
}

/** Turns a known error into a JSON response. Returns false for anything unexpected (which is logged and answered with 500). */
export function sendError(res: Response, error: unknown, scope: string): void {
  if (error instanceof AdminError) {
    if (error.retryAfterSeconds) res.setHeader('Retry-After', String(error.retryAfterSeconds));
    res.status(ERROR_STATUS[error.code]).json({ error: error.message, code: error.code });
  } else if (error instanceof AuthError) {
    if (error.retryAfterSeconds) res.setHeader('Retry-After', String(error.retryAfterSeconds));
    res.status(AUTH_STATUS[error.code] ?? 400).json({ error: error.message, code: error.code });
  } else {
    console.error(`${scope}: unexpected error`, error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Something went wrong. Try again.' });
  }
}
