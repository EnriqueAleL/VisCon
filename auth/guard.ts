import type { NextFunction, Request, Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import type { AuthPlayer } from './routes';

export type AccessState = 'ok' | 'login_required' | 'verification_required';

export interface GuardOptions {
  db: DatabaseSync;
  /** Resolves the player behind a Cookie header (login session or legacy guest token). */
  playerFromCookie(cookie?: string): AuthPlayer | null;
  /** Default true. `AUTH_REQUIRE_VERIFIED=false` turns the guard off for local development and legacy tests. */
  enabled?: boolean;
}

const MESSAGES = {
  login_required: 'Log in with your ETH account to continue.',
  verification_required: 'Confirm your ETH student email to continue.',
} as const;

/** Paths that must stay reachable without a verified account (the log-in flow itself and the health probe). */
const OPEN = (url: string) => url === '/api/health' || url.startsWith('/api/auth/');

export function createVerifiedGuard(options: GuardOptions) {
  const enabled = options.enabled ?? process.env.AUTH_REQUIRE_VERIFIED !== 'false';
  const account = options.db.prepare('SELECT verifiedAt FROM accounts WHERE playerId=?');

  /** A request is trusted only if its session belongs to a player whose account has a confirmed ETH mailbox. */
  function accessFor(cookie?: string): AccessState {
    if (!enabled) return 'ok';
    const player = options.playerFromCookie(cookie);
    if (!player) return 'login_required';
    const row = account.get(player.id) as { verifiedAt: number | null } | undefined;
    if (!row) return 'login_required'; // an anonymous guest profile: needs to register or log in
    return row.verifiedAt === null ? 'verification_required' : 'ok';
  }

  /** Express middleware for `/api` and `/media`. */
  function http(req: Request, res: Response, next: NextFunction) {
    if (OPEN(req.originalUrl.split('?')[0])) return next();
    const state = accessFor(req.headers.cookie);
    if (state === 'ok') return next();
    res.setHeader('Cache-Control', 'no-store');
    res.status(state === 'login_required' ? 401 : 403).json({ error: MESSAGES[state], code: state });
  }

  /** Socket.IO middleware: refuses the connection before any event handler runs. */
  function socket(client: { handshake: { headers: { cookie?: string } } }, next: (error?: Error) => void) {
    const state = accessFor(client.handshake.headers.cookie);
    next(state === 'ok' ? undefined : Object.assign(new Error(MESSAGES[state]), { data: { code: state } }));
  }

  return { enabled, accessFor, http, socket };
}
export type VerifiedGuard = ReturnType<typeof createVerifiedGuard>;
