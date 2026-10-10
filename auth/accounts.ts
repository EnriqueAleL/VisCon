import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';
import { AuthError } from './errors';
import { parseEthIdentifier } from './identifier';
import { dummyHash, hashPassword, PASSWORD_MAX, validatePassword, verifyPassword } from './password';
import type { CodeRequestResult, VerificationService } from './service';

export interface Account { username: string; playerId: string; verified: boolean; verifiedAt: string | null }
export interface AccountOptions {
  sessionDays: number;
  failureWindowSeconds: number;
  maxFailuresPerUserAndClient: number;
  maxFailuresPerUser: number;
  maxFailuresPerClient: number;
  /** Called once when an email is verified, e.g. to set the player's display name. */
  onVerified?: (account: Account) => void;
}
export const defaultAccountOptions: AccountOptions = {
  sessionDays: 30, failureWindowSeconds: 900, maxFailuresPerUserAndClient: 5, maxFailuresPerUser: 30, maxFailuresPerClient: 30,
};

interface Row { username: string; playerId: string; passwordHash: string; createdAt: number; verifiedAt: number | null }
export const hashSessionToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function createAccountService(db: DatabaseSync, verification: VerificationService, overrides: Partial<AccountOptions> = {}, clock: () => number = Date.now) {
  const options = { ...defaultAccountOptions, ...overrides };
  const seconds = () => Math.floor(clock() / 1000);
  const toAccount = (row: Row): Account => ({ username: row.username, playerId: row.playerId, verified: row.verifiedAt !== null, verifiedAt: row.verifiedAt === null ? null : new Date(row.verifiedAt * 1000).toISOString() });
  const byUsername = (username: string) => db.prepare('SELECT * FROM accounts WHERE username=?').get(username) as Row | undefined;
  const byPlayer = (playerId: string) => db.prepare('SELECT * FROM accounts WHERE playerId=?').get(playerId) as Row | undefined;

  function assertCanRegister(username: string, playerId: string) {
    if (byUsername(username)?.verifiedAt) throw new AuthError('account_exists', 'An account for this ETH username already exists. Log in, or reset your password.');
    const linked = byPlayer(playerId);
    if (linked?.verifiedAt && linked.username !== username) throw new AuthError('already_linked', 'This profile already belongs to another account. Log out first.');
  }

  /** Creates (or restarts) a pending account and emails the code. The account only works after confirm(). */
  async function register(input: { identifier: unknown; password: unknown; playerId: string }): Promise<CodeRequestResult> {
    const { username } = parseEthIdentifier(input.identifier);
    validatePassword(input.password, username);
    assertCanRegister(username, input.playerId);
    const passwordHash = await hashPassword(input.password);
    const sent = await verification.requestCode(username);
    assertCanRegister(username, input.playerId); // state may have changed while hashing and sending
    db.prepare('DELETE FROM accounts WHERE playerId=? AND username<>? AND verifiedAt IS NULL').run(input.playerId, username);
    db.prepare(`INSERT INTO accounts (username,playerId,passwordHash,createdAt) VALUES (?,?,?,?)
      ON CONFLICT(username) DO UPDATE SET playerId=excluded.playerId, passwordHash=excluded.passwordHash, createdAt=excluded.createdAt`)
      .run(username, input.playerId, passwordHash, seconds());
    return sent;
  }

  /** Checks the emailed code and activates the account. */
  function confirm(identifier: unknown, code: unknown): Account {
    const { username } = parseEthIdentifier(identifier);
    const row = byUsername(username);
    if (!row || row.verifiedAt) throw new AuthError('invalid_or_expired', 'That code is wrong or has expired. Request a new one.');
    verification.verifyCode(username, code);
    db.prepare('UPDATE accounts SET verifiedAt=? WHERE username=? AND verifiedAt IS NULL').run(seconds(), username);
    const account = toAccount(byUsername(username)!);
    options.onVerified?.(account);
    return account;
  }

  function startSession(playerId: string) {
    const token = randomBytes(32).toString('hex');
    const createdAt = clock(), expiresAt = createdAt + options.sessionDays * 86_400_000;
    db.prepare('INSERT INTO auth_sessions (tokenHash,playerId,createdAt,expiresAt) VALUES (?,?,?,?)').run(hashSessionToken(token), playerId, createdAt, expiresAt);
    db.prepare('DELETE FROM auth_sessions WHERE expiresAt<?').run(createdAt);
    return { token, expiresAt: new Date(expiresAt) };
  }
  const endSession = (token: string) => { db.prepare('DELETE FROM auth_sessions WHERE tokenHash=?').run(hashSessionToken(token)); };

  function failureCount(key: string, since: number) {
    const rows = db.prepare('SELECT at FROM auth_failures WHERE key=? AND at>? ORDER BY at ASC').all(key, since) as { at: number }[];
    return rows;
  }
  function assertNotBlocked(username: string, client: string) {
    const t = seconds(), since = t - options.failureWindowSeconds;
    for (const [key, max] of [[`pair:${username}|${client}`, options.maxFailuresPerUserAndClient], [`user:${username}`, options.maxFailuresPerUser], [`client:${client}`, options.maxFailuresPerClient]] as const) {
      const rows = failureCount(key, since);
      if (rows.length >= max) throw new AuthError('rate_limited', 'Too many failed log-in attempts. Try again later.', Math.max(1, rows[rows.length - max].at + options.failureWindowSeconds - t));
    }
  }
  function recordFailure(username: string, client: string) {
    const t = seconds(), insert = db.prepare('INSERT INTO auth_failures (key,at) VALUES (?,?)');
    for (const key of [`pair:${username}|${client}`, `user:${username}`, `client:${client}`]) insert.run(key, t);
    db.prepare('DELETE FROM auth_failures WHERE at<?').run(t - options.failureWindowSeconds * 4);
  }

  async function login(input: { identifier: unknown; password: unknown; client: string }) {
    const { username } = parseEthIdentifier(input.identifier);
    assertNotBlocked(username, input.client);
    const row = byUsername(username);
    const password = typeof input.password === 'string' && input.password.length <= PASSWORD_MAX ? input.password : '';
    const matches = await verifyPassword(row?.passwordHash ?? await dummyHash(), password);
    if (!row || !matches) {
      recordFailure(username, input.client);
      throw new AuthError('invalid_credentials', 'Wrong username or password.');
    }
    if (!row.verifiedAt) throw new AuthError('not_verified', 'Confirm your ETH email first. Check your inbox for the code, or request a new one.');
    db.prepare('DELETE FROM auth_failures WHERE key=?').run(`pair:${username}|${input.client}`);
    return { account: toAccount(row), ...startSession(row.playerId) };
  }

  /** Same answer whether or not the account exists, so this cannot be used to look up registered usernames. */
  async function quietly(send: () => Promise<unknown>) {
    try { await send(); }
    catch (error) { if (!(error instanceof AuthError)) throw error; if (error.code === 'mail_unavailable') console.error('auth: verification email failed'); }
  }
  const resendConfirmation = (identifier: unknown) => {
    const { username } = parseEthIdentifier(identifier);
    const row = byUsername(username);
    return row && !row.verifiedAt ? quietly(() => verification.requestCode(username)) : Promise.resolve();
  };
  const forgotPassword = (identifier: unknown) => {
    const { username } = parseEthIdentifier(identifier);
    return byUsername(username)?.verifiedAt ? quietly(() => verification.requestCode(username)) : Promise.resolve();
  };

  /** Proves mailbox control with a fresh code, sets a new password and signs out every device. */
  async function resetPassword(input: { identifier: unknown; code: unknown; password: unknown }): Promise<Account> {
    const { username } = parseEthIdentifier(input.identifier);
    validatePassword(input.password, username);
    const row = byUsername(username);
    if (!row?.verifiedAt) throw new AuthError('invalid_or_expired', 'That code is wrong or has expired. Request a new one.');
    verification.verifyCode(username, input.code);
    db.prepare('UPDATE accounts SET passwordHash=? WHERE username=?').run(await hashPassword(input.password), username);
    db.prepare('DELETE FROM auth_sessions WHERE playerId=?').run(row.playerId);
    db.prepare('DELETE FROM auth_failures WHERE key=?').run(`user:${username}`);
    return toAccount(byUsername(username)!);
  }

  const accountForPlayer = (playerId: string) => { const row = byPlayer(playerId); return row ? toAccount(row) : null; };
  return { register, confirm, login, startSession, endSession, resendConfirmation, forgotPassword, resetPassword, accountForPlayer, options };
}
export type AccountService = ReturnType<typeof createAccountService>;
