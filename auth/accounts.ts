import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';
import { AuthError } from './errors';
import { parseEthIdentifier } from './identifier';
import { dummyHash, hashPassword, PASSWORD_MAX, validatePassword, verifyPassword } from './password';
import type { CodeRequestResult, VerificationService } from './service';

/** pending: mailbox not confirmed yet. expired: confirmed long ago, must be confirmed again. */
export type AccountStatus = 'pending' | 'verified' | 'expired' | 'disabled';
export interface Account { username: string; playerId: string; verified: boolean; status: AccountStatus; verifiedAt: string | null }
export interface AccountOptions {
  sessionDays: number;
  /** A confirmed mailbox counts for this many days, then the student must confirm again. 0 = never expires. */
  reverifyDays: number;
  failureWindowSeconds: number;
  maxFailuresPerUserAndClient: number;
  maxFailuresPerUser: number;
  maxFailuresPerClient: number;
  /** Called once when an email is confirmed, e.g. to set the player's display name. */
  onVerified?: (account: Account) => void;
  /** Called when every session of a player was invalidated (revoked, password reset, deleted): close their live connections. */
  onRevoked?: (playerId: string) => void;
  /** Called after an account was deleted, so app data keyed to the player can be made anonymous. */
  onDeleted?: (playerId: string, username: string) => void;
}
export const defaultAccountOptions: AccountOptions = {
  sessionDays: 30, reverifyDays: 180, failureWindowSeconds: 900, maxFailuresPerUserAndClient: 5, maxFailuresPerUser: 30, maxFailuresPerClient: 30,
};

interface Row { username: string; playerId: string; passwordHash: string; createdAt: number; verifiedAt: number | null; disabledAt: number | null }
export const hashSessionToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Shared with the request guard so both agree on what "verified" means. */
export function statusOf(row: { verifiedAt: number | null; disabledAt: number | null }, nowSeconds: number, reverifyDays: number): AccountStatus {
  if (row.disabledAt !== null) return 'disabled';
  if (row.verifiedAt === null) return 'pending';
  return reverifyDays > 0 && nowSeconds - row.verifiedAt >= reverifyDays * 86_400 ? 'expired' : 'verified';
}

export function createAccountService(db: DatabaseSync, verification: VerificationService, overrides: Partial<AccountOptions> = {}, clock: () => number = Date.now) {
  const options = { ...defaultAccountOptions, ...overrides };
  const seconds = () => Math.floor(clock() / 1000);
  const statusFor = (row: Row) => statusOf(row, seconds(), options.reverifyDays);
  const toAccount = (row: Row): Account => {
    const status = statusFor(row);
    return { username: row.username, playerId: row.playerId, verified: status === 'verified', status, verifiedAt: row.verifiedAt === null ? null : new Date(row.verifiedAt * 1000).toISOString() };
  };
  const byUsername = (username: string) => db.prepare('SELECT * FROM accounts WHERE username=?').get(username) as Row | undefined;
  const byPlayer = (playerId: string) => db.prepare('SELECT * FROM accounts WHERE playerId=?').get(playerId) as Row | undefined;
  const needsConfirmation = (row: Row | undefined): row is Row => !!row && ['pending', 'expired'].includes(statusFor(row));
  const badCode = () => new AuthError('invalid_or_expired', 'That code is wrong or has expired. Request a new one.');

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

  /** Checks the emailed code and (re)activates the account: first confirmation, or a renewal after it expired. */
  function confirm(identifier: unknown, code: unknown): Account {
    const { username } = parseEthIdentifier(identifier);
    const row = byUsername(username);
    if (!needsConfirmation(row)) throw badCode();
    verification.verifyCode(username, code);
    const first = row.verifiedAt === null;
    db.prepare('UPDATE accounts SET verifiedAt=? WHERE username=?').run(seconds(), username);
    const account = toAccount(byUsername(username)!);
    if (first) options.onVerified?.(account);
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
  const endAllSessions = (playerId: string) => { db.prepare('DELETE FROM auth_sessions WHERE playerId=?').run(playerId); options.onRevoked?.(playerId); };

  function failures(key: string, since: number) {
    return db.prepare('SELECT at FROM auth_failures WHERE key=? AND at>? ORDER BY at ASC').all(key, since) as { at: number }[];
  }
  function assertNotBlocked(username: string, client: string) {
    const t = seconds(), since = t - options.failureWindowSeconds;
    for (const [key, max] of [[`pair:${username}|${client}`, options.maxFailuresPerUserAndClient], [`user:${username}`, options.maxFailuresPerUser], [`client:${client}`, options.maxFailuresPerClient]] as const) {
      const rows = failures(key, since);
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
    const status = statusFor(row);
    if (status === 'disabled') throw new AuthError('account_disabled', 'This account has been disabled. Contact the administrators.');
    if (status !== 'verified') throw new AuthError('not_verified', status === 'expired'
      ? 'Please confirm your ETH student email again to continue.'
      : 'Confirm your ETH email first. Check your inbox for the code, or request a new one.');
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
    return needsConfirmation(byUsername(username)) ? quietly(() => verification.requestCode(username)) : Promise.resolve();
  };
  const forgotPassword = (identifier: unknown) => {
    const { username } = parseEthIdentifier(identifier);
    const row = byUsername(username);
    return row?.verifiedAt && row.disabledAt === null ? quietly(() => verification.requestCode(username)) : Promise.resolve();
  };

  /** Proves mailbox control with a fresh code, sets a new password and signs out every device. */
  async function resetPassword(input: { identifier: unknown; code: unknown; password: unknown }): Promise<Account> {
    const { username } = parseEthIdentifier(input.identifier);
    validatePassword(input.password, username);
    const row = byUsername(username);
    if (!row?.verifiedAt || row.disabledAt !== null) throw badCode();
    verification.verifyCode(username, input.code);
    // Controlling the mailbox is exactly what re-verification checks, so a reset also renews it.
    db.prepare('UPDATE accounts SET passwordHash=?, verifiedAt=? WHERE username=?').run(await hashPassword(input.password), seconds(), username);
    db.prepare('DELETE FROM auth_failures WHERE key=?').run(`user:${username}`);
    endAllSessions(row.playerId);
    return toAccount(byUsername(username)!);
  }

  const existing = (identifier: unknown) => {
    const { username } = parseEthIdentifier(identifier);
    const row = byUsername(username);
    if (!row) throw new AuthError('invalid_identifier', `No account for ${username}.`);
    return row;
  };
  /** Administrator action: blocks the account immediately and closes its sessions and live connections. */
  function revoke(identifier: unknown): Account {
    const row = existing(identifier);
    db.prepare('UPDATE accounts SET disabledAt=? WHERE username=?').run(seconds(), row.username);
    endAllSessions(row.playerId);
    return toAccount(byUsername(row.username)!);
  }
  function restore(identifier: unknown): Account {
    const row = existing(identifier);
    db.prepare('UPDATE accounts SET disabledAt=NULL WHERE username=?').run(row.username);
    return toAccount(byUsername(row.username)!);
  }

  /** Removes the account and everything we hold about the person's login. Gameplay data stays under an anonymous id. */
  function remove(username: string, playerId: string) {
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const [sql, value] of [
        ['DELETE FROM accounts WHERE username=?', username], ['DELETE FROM verified_students WHERE username=?', username],
        ['DELETE FROM email_challenges WHERE username=?', username], ['DELETE FROM auth_sessions WHERE playerId=?', playerId],
      ] as const) db.prepare(sql).run(value);
      db.prepare('DELETE FROM auth_failures WHERE key LIKE ?').run(`%${username}%`);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    options.onDeleted?.(playerId, username);
    options.onRevoked?.(playerId);
  }
  /** Self-service: the account owner confirms with the password. */
  async function deleteOwn(input: { playerId: string; password: unknown; client: string }) {
    const row = byPlayer(input.playerId);
    if (!row) throw new AuthError('invalid_credentials', 'There is no account to delete.');
    assertNotBlocked(row.username, input.client);
    const password = typeof input.password === 'string' && input.password.length <= PASSWORD_MAX ? input.password : '';
    if (!(await verifyPassword(row.passwordHash, password))) { recordFailure(row.username, input.client); throw new AuthError('invalid_credentials', 'Wrong password.'); }
    remove(row.username, row.playerId);
  }
  /** Administrator action, e.g. for an erasure request. */
  const deleteByUsername = (identifier: unknown) => { const row = existing(identifier); remove(row.username, row.playerId); };

  const accountForPlayer = (playerId: string) => { const row = byPlayer(playerId); return row ? toAccount(row) : null; };
  const list = () => (db.prepare('SELECT * FROM accounts ORDER BY createdAt DESC').all() as unknown as Row[]).map(toAccount);
  return { register, confirm, login, startSession, endSession, resendConfirmation, forgotPassword, resetPassword, revoke, restore, deleteOwn, deleteByUsername, accountForPlayer, list, options };
}
export type AccountService = ReturnType<typeof createAccountService>;
