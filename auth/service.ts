import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { AuthError } from './errors';
import { maskEmail, parseEthIdentifier } from './identifier';
import type { Mailer } from './mailer';

export interface VerificationOptions {
  /** Domain the code is mailed to. A student.ethz.ch mailbox is what proves the person studies at ETH. */
  mailDomain: string;
  codeTtlSeconds: number;
  maxAttempts: number;
  resendCooldownSeconds: number;
  maxRequestsPerHour: number;
}
export const defaultOptions: VerificationOptions = {
  mailDomain: 'student.ethz.ch', codeTtlSeconds: 600, maxAttempts: 5, resendCooldownSeconds: 60, maxRequestsPerHour: 5,
};

export interface CodeRequestResult { username: string; sentTo: string; expiresAt: string }
export interface VerifiedStudent { username: string; email: string; verifiedAt: string }

const HOUR = 3600;
const sha256 = (value: string) => createHash('sha256').update(value).digest();

export function openAuthDatabase(file = process.env.AUTH_DB_PATH || '.data/auth.sqlite'): DatabaseSync {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS email_challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, salt TEXT NOT NULL, codeHash TEXT NOT NULL,
      createdAt INTEGER NOT NULL, expiresAt INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, consumedAt INTEGER);
    CREATE INDEX IF NOT EXISTS email_challenges_user ON email_challenges (username, createdAt);
    CREATE TABLE IF NOT EXISTS verified_students (
      username TEXT PRIMARY KEY, email TEXT NOT NULL, verifiedAt INTEGER NOT NULL, lastVerifiedAt INTEGER NOT NULL);`);
  return db;
}

export function createVerificationService(db: DatabaseSync, mailer: Mailer, overrides: Partial<VerificationOptions> = {}, clock: () => number = Date.now) {
  const options = { ...defaultOptions, ...overrides };
  const now = () => Math.floor(clock() / 1000);
  const emailFor = (username: string) => `${username}@${options.mailDomain}`;

  /** Sends a fresh one-time code. Any earlier unused code for the same username stops working. */
  async function requestCode(identifier: unknown): Promise<CodeRequestResult> {
    const { username } = parseEthIdentifier(identifier);
    const t = now();
    const last = db.prepare('SELECT createdAt FROM email_challenges WHERE username=? ORDER BY createdAt DESC LIMIT 1').get(username) as { createdAt: number } | undefined;
    if (last && t - last.createdAt < options.resendCooldownSeconds) {
      const wait = options.resendCooldownSeconds - (t - last.createdAt);
      throw new AuthError('rate_limited', `A code was just sent. Wait ${wait} seconds before requesting another.`, wait);
    }
    const recent = db.prepare('SELECT createdAt FROM email_challenges WHERE username=? AND createdAt>? ORDER BY createdAt ASC').all(username, t - HOUR) as { createdAt: number }[];
    if (recent.length >= options.maxRequestsPerHour) {
      const wait = recent[0].createdAt + HOUR - t;
      throw new AuthError('rate_limited', 'Too many codes requested for this account. Try again later.', wait);
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const salt = randomBytes(16).toString('hex');
    db.prepare('UPDATE email_challenges SET consumedAt=? WHERE username=? AND consumedAt IS NULL').run(t, username);
    const id = Number(db.prepare('INSERT INTO email_challenges (username,salt,codeHash,createdAt,expiresAt) VALUES (?,?,?,?,?)')
      .run(username, salt, sha256(salt + code).toString('hex'), t, t + options.codeTtlSeconds).lastInsertRowid);

    const to = emailFor(username);
    const minutes = Math.round(options.codeTtlSeconds / 60);
    try {
      await mailer.send({
        to, subject: `Your VIScon verification code: ${code}`,
        text: `Your VIScon verification code is ${code}\n\nIt expires in ${minutes} minutes and works once. If you did not ask for it, ignore this email.\n`,
      });
    } catch (error) {
      db.prepare('DELETE FROM email_challenges WHERE id=?').run(id); // a failed send must not burn the rate limit
      throw error;
    }
    return { username, sentTo: maskEmail(to), expiresAt: new Date((t + options.codeTtlSeconds) * 1000).toISOString() };
  }

  /** Checks the code. Success is recorded; the code cannot be used again. */
  function verifyCode(identifier: unknown, code: unknown): VerifiedStudent {
    const { username } = parseEthIdentifier(identifier);
    const invalid = () => new AuthError('invalid_or_expired', 'That code is wrong or has expired. Request a new one.');
    if (typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) throw invalid();
    const t = now();
    const row = db.prepare('SELECT id,salt,codeHash,expiresAt,attempts FROM email_challenges WHERE username=? AND consumedAt IS NULL ORDER BY createdAt DESC, id DESC LIMIT 1')
      .get(username) as { id: number; salt: string; codeHash: string; expiresAt: number; attempts: number } | undefined;
    if (!row || row.expiresAt <= t) throw invalid();
    if (row.attempts >= options.maxAttempts) throw new AuthError('too_many_attempts', 'Too many wrong codes. Request a new one.');

    db.exec('BEGIN IMMEDIATE');
    try {
      const matches = timingSafeEqual(sha256(row.salt + code.trim()), Buffer.from(row.codeHash, 'hex'));
      if (!matches) {
        db.prepare('UPDATE email_challenges SET attempts=attempts+1 WHERE id=?').run(row.id);
        db.exec('COMMIT');
        throw invalid();
      }
      db.prepare('UPDATE email_challenges SET consumedAt=? WHERE id=?').run(t, row.id);
      db.prepare(`INSERT INTO verified_students (username,email,verifiedAt,lastVerifiedAt) VALUES (?,?,?,?)
        ON CONFLICT(username) DO UPDATE SET lastVerifiedAt=excluded.lastVerifiedAt`).run(username, emailFor(username), t, t);
      db.exec('COMMIT');
    } catch (error) {
      if (!(error instanceof AuthError)) db.exec('ROLLBACK');
      throw error;
    }
    return getVerified(username)!;
  }

  function getVerified(identifier: unknown): VerifiedStudent | null {
    const { username } = parseEthIdentifier(identifier);
    const row = db.prepare('SELECT username,email,verifiedAt FROM verified_students WHERE username=?').get(username) as { username: string; email: string; verifiedAt: number } | undefined;
    return row ? { username: row.username, email: row.email, verifiedAt: new Date(row.verifiedAt * 1000).toISOString() } : null;
  }

  function listVerified(): VerifiedStudent[] {
    return (db.prepare('SELECT username,email,verifiedAt FROM verified_students ORDER BY verifiedAt DESC').all() as { username: string; email: string; verifiedAt: number }[])
      .map(row => ({ ...row, verifiedAt: new Date(row.verifiedAt * 1000).toISOString() }));
  }

  return { requestCode, verifyCode, getVerified, listVerified, options };
}
export type VerificationService = ReturnType<typeof createVerificationService>;
