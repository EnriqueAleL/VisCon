import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AuthError } from './errors';
import { createAccountService, hashSessionToken } from './accounts';
import { hashPassword, validatePassword, verifyPassword } from './password';
import { createVerificationService, openAuthDatabase } from './service';
import type { Mail } from './mailer';

const PASSWORD = 'correct horse battery';
function setup(options = {}) {
  const db = openAuthDatabase(':memory:'), sent: Mail[] = [];
  let time = 1_800_000_000_000;
  const verification = createVerificationService(db, { send: async mail => { sent.push(mail); } }, {}, () => time);
  const verified: string[] = [];
  const accounts = createAccountService(db, verification, { onVerified: a => verified.push(a.username), ...options }, () => time);
  return { db, sent, verified, accounts, advance: (s: number) => { time += s * 1000; }, code: () => sent.at(-1)!.subject.match(/\d{6}/)![0] };
}
const rejects = (promise: Promise<unknown> | (() => unknown), code: string) =>
  assert.rejects(async () => typeof promise === 'function' ? promise() : promise, (e: AuthError) => e instanceof AuthError && e.code === code, code);

test('passwords are hashed with scrypt, verified, and policy-checked', async () => {
  const hash = await hashPassword(PASSWORD);
  assert.ok(hash.startsWith('scrypt$') && !hash.includes(PASSWORD));
  assert.equal(await verifyPassword(hash, PASSWORD), true);
  assert.equal(await verifyPassword(hash, PASSWORD + 'x'), false);
  assert.equal(await verifyPassword('garbage', PASSWORD), false);
  for (const bad of [undefined, 'short', 'aaaaaaaaaaaa', 'x'.repeat(200), 'myriordache123']) assert.throws(() => validatePassword(bad, 'riordache'), (e: AuthError) => e.code === 'weak_password');
  assert.doesNotThrow(() => validatePassword(PASSWORD, 'riordache'));
});

test('register -> email code -> confirm -> login on a fresh device', async () => {
  const { accounts, sent, code, verified } = setup();
  const result = await accounts.register({ identifier: 'riordache@ethz.ch', password: PASSWORD, playerId: 'player-1' });
  assert.equal(result.username, 'riordache');
  assert.equal(sent[0].to, 'riordache@student.ethz.ch');
  await rejects(accounts.login({ identifier: 'riordache', password: PASSWORD, client: 'c1' }), 'not_verified');
  const account = accounts.confirm('riordache@student.ethz.ch', code());
  assert.deepEqual([account.verified, account.playerId, verified], [true, 'player-1', ['riordache']]);
  const session = await accounts.login({ identifier: 'RIORDACHE', password: PASSWORD, client: 'c2' });
  assert.equal(session.account.playerId, 'player-1');
  assert.equal(session.token.length, 64);
  assert.equal(accounts.accountForPlayer('player-1')?.username, 'riordache');
});

test('wrong passwords and unknown users are indistinguishable, and attempts are limited', async () => {
  const { accounts, code, advance } = setup({ maxFailuresPerUserAndClient: 3 });
  await accounts.register({ identifier: 'riordache', password: PASSWORD, playerId: 'p1' });
  accounts.confirm('riordache', code());
  const messages = new Set<string>();
  for (const identifier of ['riordache', 'nobody']) {
    try { await accounts.login({ identifier, password: 'wrong password!', client: 'c' + identifier }); }
    catch (e) { messages.add(`${(e as AuthError).code}:${(e as AuthError).message}`); }
  }
  assert.equal(messages.size, 1);
  for (let i = 0; i < 2; i++) await rejects(accounts.login({ identifier: 'riordache', password: 'wrong password!', client: 'attacker' }), 'invalid_credentials');
  await rejects(accounts.login({ identifier: 'riordache', password: 'wrong password!', client: 'attacker' }), 'invalid_credentials'); // 3rd failure
  await rejects(accounts.login({ identifier: 'riordache', password: PASSWORD, client: 'attacker' }), 'rate_limited');
  assert.ok((await accounts.login({ identifier: 'riordache', password: PASSWORD, client: 'owner' })).token); // other clients unaffected
  advance(901);
  assert.ok((await accounts.login({ identifier: 'riordache', password: PASSWORD, client: 'attacker' })).token);
});

test('a verified username cannot be taken over; an unverified registration can be restarted by its real owner', async () => {
  const { accounts, code, advance } = setup();
  await accounts.register({ identifier: 'riordache', password: 'attacker password', playerId: 'attacker' });
  const squatterCode = code();
  advance(61);
  await accounts.register({ identifier: 'riordache', password: PASSWORD, playerId: 'owner' }); // the real owner registers afterwards
  if (squatterCode !== code()) await rejects(() => accounts.confirm('riordache', squatterCode), 'invalid_or_expired');
  const account = accounts.confirm('riordache', code());
  assert.equal(account.playerId, 'owner');
  await rejects(accounts.login({ identifier: 'riordache', password: 'attacker password', client: 'x' }), 'invalid_credentials');
  advance(61);
  await rejects(accounts.register({ identifier: 'riordache', password: PASSWORD, playerId: 'someone-else' }), 'account_exists');
});

test('a profile that already belongs to a verified account cannot register a second one', async () => {
  const { accounts, code, advance } = setup();
  await accounts.register({ identifier: 'riordache', password: PASSWORD, playerId: 'p1' });
  accounts.confirm('riordache', code());
  advance(61);
  await rejects(accounts.register({ identifier: 'other', password: PASSWORD, playerId: 'p1' }), 'already_linked');
});

test('forgot/resend answer the same for unknown accounts and only mail real ones', async () => {
  const { accounts, sent, code, advance } = setup();
  await accounts.forgotPassword('nobody');
  await accounts.resendConfirmation('nobody');
  assert.equal(sent.length, 0);
  await accounts.register({ identifier: 'riordache', password: PASSWORD, playerId: 'p1' });
  await accounts.forgotPassword('riordache'); // pending, not verified: no mail
  assert.equal(sent.length, 1);
  accounts.confirm('riordache', code());
  advance(61);
  await accounts.forgotPassword('riordache');
  assert.equal(sent.length, 2);
});

test('reset needs a fresh code, changes the password and signs out all devices', async () => {
  const { accounts, db, sent, code, advance } = setup();
  await accounts.register({ identifier: 'riordache', password: PASSWORD, playerId: 'p1' });
  accounts.confirm('riordache', code());
  const session = await accounts.login({ identifier: 'riordache', password: PASSWORD, client: 'c' });
  advance(61);
  await accounts.forgotPassword('riordache');
  await rejects(accounts.resetPassword({ identifier: 'riordache', code: '000000' === code() ? '111111' : '000000', password: 'brand new password' }), 'invalid_or_expired');
  await rejects(accounts.resetPassword({ identifier: 'riordache', code: code(), password: 'short' }), 'weak_password');
  await accounts.resetPassword({ identifier: 'riordache', code: code(), password: 'brand new password' });
  assert.equal(sent.length, 2); // registration code + reset code
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM auth_sessions WHERE tokenHash=?').get(hashSessionToken(session.token))!.n, 0);
  await rejects(accounts.login({ identifier: 'riordache', password: PASSWORD, client: 'c' }), 'invalid_credentials');
  assert.ok((await accounts.login({ identifier: 'riordache', password: 'brand new password', client: 'c' })).token);
});

test('sessions are stored hashed and can be ended', async () => {
  const { accounts, db } = setup();
  const { token } = accounts.startSession('p1');
  const row = db.prepare('SELECT tokenHash FROM auth_sessions').get() as { tokenHash: string };
  assert.notEqual(row.tokenHash, token);
  assert.equal(row.tokenHash, hashSessionToken(token));
  accounts.endSession(token);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM auth_sessions').get() as { n: number }).n, 0);
});
