import type { Express, Request, Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { AuthError } from './errors';
import { createAccountService, type Account, type AccountOptions } from './accounts';
import { optionalMailerFromEnv, type Mailer } from './mailer';
import { createVerificationService, type VerificationOptions } from './service';
import { reverifyDaysFromEnv } from './guard';
import { windowLimiter } from './limiter';

export interface AuthPlayer { id: string; name: string; rating: number; createdAt: string }
export interface MountAuthDeps {
  db: DatabaseSync;
  /** Resolves the player behind a Cookie header (guest or logged-in). */
  playerFromCookie(cookie?: string): AuthPlayer | null;
  createPlayer(): { profile: AuthPlayer; token: string };
  mailer?: Mailer;
  secureCookies?: boolean;
  /** Header carrying the real client IP behind a trusted proxy, e.g. "x-forwarded-for". Unset: use the socket address. */
  clientIpHeader?: string;
  accountOptions?: Partial<AccountOptions>;
  verificationOptions?: Partial<VerificationOptions>;
  clock?: () => number;
  /** Reported by /api/auth/me so the front end knows whether it must show the log-in screens. Default true. */
  required?: boolean;
}

const STATUS: Record<AuthError['code'], number> = {
  invalid_identifier: 400, weak_password: 400, invalid_or_expired: 400, invalid_credentials: 401, not_verified: 403, account_disabled: 403,
  account_exists: 409, already_linked: 409, rate_limited: 429, too_many_attempts: 429, mail_unavailable: 503,
};
const COOKIE = 'ba_session';

export function mountAuth(app: Express, deps: MountAuthDeps) {
  const clock = deps.clock ?? Date.now;
  const cooldown = Number(process.env.AUTH_RESEND_COOLDOWN_SECONDS);
  const verification = createVerificationService(deps.db, deps.mailer ?? optionalMailerFromEnv(), {
    ...(process.env.AUTH_MAIL_DOMAIN ? { mailDomain: process.env.AUTH_MAIL_DOMAIN } : {}),
    ...(Number.isFinite(cooldown) && cooldown >= 0 && process.env.AUTH_RESEND_COOLDOWN_SECONDS ? { resendCooldownSeconds: cooldown } : {}),
    ...deps.verificationOptions,
  }, clock);
  const accounts = createAccountService(deps.db, verification, { reverifyDays: reverifyDaysFromEnv(), ...deps.accountOptions }, clock);
  const anyRequest = windowLimiter(60, 60_000, clock);
  const sendsEmail = windowLimiter(20, 3_600_000, clock);

  const clientOf = (req: Request) => {
    const header = deps.clientIpHeader && req.headers[deps.clientIpHeader];
    const value = Array.isArray(header) ? header.at(-1) : header;
    return (value?.split(',').at(-1)?.trim() || req.socket.remoteAddress || 'unknown').slice(0, 64);
  };
  const body = (req: Request) => (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const setCookie = (res: Response, token: string, expires: Date) =>
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: deps.secureCookies ?? false, expires, path: '/' });
  const cookieToken = (req: Request) => req.headers.cookie?.match(/(?:^|;\s*)ba_session=([a-f0-9]{64})(?:;|$)/)?.[1];

  const handle = (options: { sendsEmail?: boolean }, fn: (req: Request, res: Response, client: string) => unknown) => async (req: Request, res: Response) => {
    try {
      const client = clientOf(req);
      anyRequest(`ip:${client}`);
      if (options.sendsEmail) sendsEmail(`mail:${client}`);
      await fn(req, res, client);
    } catch (error) {
      if (error instanceof AuthError) {
        if (error.retryAfterSeconds) res.setHeader('Retry-After', String(error.retryAfterSeconds));
        return res.status(STATUS[error.code]).json({ error: error.message, code: error.code, ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}) });
      }
      console.error('auth: unexpected error', error instanceof Error ? error.message : error);
      res.status(500).json({ error: 'Something went wrong. Try again.' });
    }
  };
  const publicAccount = (account: Account | null) => account && { username: account.username, verified: account.verified, status: account.status };

  // Register with an ETH username/email + password. Keeps the current guest profile (progress, Elo) for the account.
  app.post('/api/auth/register', handle({ sendsEmail: true }, async (req, res) => {
    const { identifier, password } = body(req);
    let playerId = deps.playerFromCookie(req.headers.cookie)?.id;
    if (!playerId) {
      // This browser must hold the new profile: only the browser that registered can confirm the code.
      const created = deps.createPlayer();
      playerId = created.profile.id;
      setCookie(res, created.token, new Date(Date.now() + 365 * 86_400_000));
    }
    const sent = await accounts.register({ identifier, password, playerId });
    res.status(202).json({ status: 'verification_sent', username: sent.username, sentTo: sent.sentTo, expiresAt: sent.expiresAt });
  }));

  // Enter the emailed code: the account becomes active and this browser is logged in.
  app.post('/api/auth/verify', handle({}, (req, res) => {
    const { identifier, code } = body(req);
    const account = accounts.confirm(identifier, code, deps.playerFromCookie(req.headers.cookie)?.id ?? null);
    const session = accounts.startSession(account.playerId);
    setCookie(res, session.token, session.expiresAt);
    res.json({ account: publicAccount(account), profile: deps.playerFromCookie(`${COOKIE}=${session.token}`) });
  }));

  app.post('/api/auth/resend', handle({ sendsEmail: true }, async (req, res) => {
    await accounts.resendConfirmation(body(req).identifier);
    res.json({ status: 'sent_if_pending' });
  }));

  app.post('/api/auth/login', handle({}, async (req, res, client) => {
    const { identifier, password } = body(req);
    const session = await accounts.login({ identifier, password, client });
    setCookie(res, session.token, session.expiresAt);
    res.json({ account: publicAccount(session.account), profile: deps.playerFromCookie(`${COOKIE}=${session.token}`) });
  }));

  app.post('/api/auth/logout', handle({}, (req, res) => {
    const token = cookieToken(req);
    if (token) accounts.endSession(token);
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  }));

  app.post('/api/auth/forgot', handle({ sendsEmail: true }, async (req, res) => {
    await accounts.forgotPassword(body(req).identifier);
    res.json({ status: 'sent_if_account_exists' });
  }));

  app.post('/api/auth/reset', handle({}, async (req, res) => {
    const { identifier, code, password } = body(req);
    const account = await accounts.resetPassword({ identifier, code, password });
    res.json({ account: publicAccount(account) });
  }));

  // Delete my account and login data (confirmed with the password). Gameplay data stays under an anonymous id.
  app.post('/api/auth/delete', handle({}, async (req, res, client) => {
    const profile = deps.playerFromCookie(req.headers.cookie);
    if (!profile) throw new AuthError('invalid_credentials', 'Log in first.');
    await accounts.deleteOwn({ playerId: profile.id, password: body(req).password, client });
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  }));

  // Who am I? Never creates a guest profile.
  app.get('/api/auth/me', handle({}, (req, res) => {
    const profile = deps.playerFromCookie(req.headers.cookie);
    res.json({ required: deps.required ?? true, profile, account: profile ? publicAccount(accounts.accountForPlayer(profile.id)) : null });
  }));

  return accounts;
}
