import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { AuthError } from './errors';

const scrypt = (password: string, salt: Buffer, keylen: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scryptCallback(password, salt, keylen, options, (error, key) => error ? reject(error) : resolve(key)));

const N = 32768, R = 8, P = 1, KEYLEN = 64;
const maxmem = (n: number, r: number) => 128 * n * r * 2;
export const PASSWORD_MIN = 10, PASSWORD_MAX = 128;

export function validatePassword(password: unknown, username: string): asserts password is string {
  const weak = (message: string) => new AuthError('weak_password', message);
  if (typeof password !== 'string') throw weak('Enter a password.');
  if (password.length < PASSWORD_MIN) throw weak(`Use at least ${PASSWORD_MIN} characters.`);
  if (password.length > PASSWORD_MAX) throw weak(`Use at most ${PASSWORD_MAX} characters.`);
  if (new Set(password).size < 4) throw weak('Use a password with more variety.');
  if (username.length >= 4 && password.toLowerCase().includes(username)) throw weak('The password must not contain your username.');
}

/** `scrypt$N$r$p$salt$hash`, so parameters can be raised later without breaking old hashes. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P, maxmem: maxmem(N, R) });
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  const params = { N: Number(n), r: Number(r), p: Number(p) };
  if (scheme !== 'scrypt' || !salt || !hash || !(params.N <= 2 ** 17) || !(params.r <= 16) || !(params.p <= 4)) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password.normalize('NFKC'), Buffer.from(salt, 'base64'), expected.length, { ...params, maxmem: maxmem(params.N, params.r) });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

let dummy: Promise<string> | undefined;
/** Hash checked when the account does not exist, so response time does not reveal which usernames are registered. */
export const dummyHash = () => (dummy ??= hashPassword('not-a-real-password'));
