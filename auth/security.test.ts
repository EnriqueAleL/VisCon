import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AuthError } from './errors';
import { createAccountService, statusOf } from './accounts';
import { createVerifiedGuard } from './guard';
import { createVerificationService, openAuthDatabase } from './service';
import { DatabaseSync } from 'node:sqlite';
import { initAuthSchema } from './schema';
import type { Mail } from './mailer';

const PASSWORD = 'correct horse battery';
const DAY = 86_400_000;
function setup(options = {}) {
  const db = openAuthDatabase(':memory:'), sent: Mail[] = [], revoked: string[] = [], deleted: string[] = [];
  let time = 1_800_000_000_000;
  const clock = () => time;
  const verification = createVerificationService(db, { send: async m => { sent.push(m); } }, { resendCooldownSeconds: 0 }, clock);
  const accounts = createAccountService(db, verification, { reverifyDays: 180, onRevoked: id => revoked.push(id), onDeleted: id => deleted.push(id), ...options }, clock);
  const players = new Map<string, { id: string; name: string; rating: number; createdAt: string }>();
  const guard = createVerifiedGuard({ db, enabled: true, reverifyDays: 180, clock, playerFromCookie: cookie => players.get(cookie ?? '') ?? null });
  const code = () => sent.at(-1)!.subject.match(/\d{6}/)![0];
  async function signUp(username: string, playerId: string) {
    players.set(playerId, { id: playerId, name: username, rating: 1200, createdAt: '' });
    await accounts.register({ identifier: username, password: PASSWORD, playerId });
    accounts.confirm(username, code());
  }
  return { db, accounts, guard, sent, revoked, deleted, code, signUp, advance: (days: number) => { time += days * DAY; } };
}
const rejects = (p: Promise<unknown> | (() => unknown), code: string) => assert.rejects(async () => typeof p === 'function' ? p() : p, (e: AuthError) => e instanceof AuthError && e.code === code, code);

test('status rules: pending, verified, expired and disabled', () => {
  const now = 1_000_000_000;
  assert.equal(statusOf({ verifiedAt: null, disabledAt: null }, now, 180), 'pending');
  assert.equal(statusOf({ verifiedAt: now - 10, disabledAt: null }, now, 180), 'verified');
  assert.equal(statusOf({ verifiedAt: now - 180 * 86_400, disabledAt: null }, now, 180), 'expired');
  assert.equal(statusOf({ verifiedAt: now - 999 * 86_400, disabledAt: null }, now, 0), 'verified', '0 means it never expires');
  assert.equal(statusOf({ verifiedAt: now, disabledAt: now }, now, 180), 'disabled', 'disabled wins');
});

test('a revoked account loses access at once, cannot log in, and its live connections are told to close', async () => {
  const { accounts, guard, signUp, revoked } = setup();
  await signUp('riordache', 'p1');
  const { token } = (await accounts.login({ identifier: 'riordache', password: PASSWORD, client: 'c' }));
  assert.ok(token);
  assert.equal(guard.accessFor('p1'), 'ok');
  accounts.revoke('riordache@ethz.ch');
  assert.equal(guard.accessFor('p1'), 'account_disabled');
  assert.deepEqual(revoked, ['p1']);
  await rejects(accounts.login({ identifier: 'riordache', password: PASSWORD, client: 'c' }), 'account_disabled');
  await rejects(accounts.login({ identifier: 'riordache', password: 'wrong password!', client: 'c' }), 'invalid_credentials');
  accounts.restore('riordache');
  assert.equal(guard.accessFor('p1'), 'ok');
  assert.ok((await accounts.login({ identifier: 'riordache', password: PASSWORD, client: 'c' })).token);
  assert.throws(() => accounts.revoke('nobody'), (e: AuthError) => e.code === 'invalid_identifier');
});

test('a revoked account cannot be revived by confirming a code or by resetting the password', async () => {
  const { accounts, signUp, code } = setup();
  await signUp('riordache', 'p1');
  accounts.revoke('riordache');
  await accounts.forgotPassword('riordache'); // silently does nothing
  await accounts.resendConfirmation('riordache');
  await rejects(accounts.resetPassword({ identifier: 'riordache', code: '123456', password: 'another long password' }), 'invalid_or_expired');
  await rejects(() => accounts.confirm('riordache', code()), 'invalid_or_expired');
});

test('verification expires after the configured time and can be renewed with a fresh code', async () => {
  const { accounts, guard, signUp, advance, code, sent } = setup();
  await signUp('riordache', 'p1');
  advance(179);
  assert.equal(guard.accessFor('p1'), 'ok');
  advance(2);
  assert.equal(guard.accessFor('p1'), 'verification_required', 'expired');
  assert.equal(accounts.accountForPlayer('p1')?.status, 'expired');
  await rejects(accounts.login({ identifier: 'riordache', password: PASSWORD, client: 'c' }), 'not_verified');
  const before = sent.length;
  await accounts.resendConfirmation('riordache');
  assert.equal(sent.length, before + 1, 'a renewal code is sent');
  await rejects(() => accounts.confirm('riordache', '000000' === code() ? '111111' : '000000'), 'invalid_or_expired');
  const renewed = accounts.confirm('riordache', code());
  assert.equal(renewed.status, 'verified');
  assert.equal(guard.accessFor('p1'), 'ok');
  assert.ok((await accounts.login({ identifier: 'riordache', password: PASSWORD, client: 'c' })).token);
});

test('resetting the password also renews an expired verification, and signs every device out', async () => {
  const { accounts, guard, signUp, advance, code, revoked } = setup();
  await signUp('riordache', 'p1');
  advance(400);
  assert.equal(guard.accessFor('p1'), 'verification_required');
  await accounts.forgotPassword('riordache');
  await accounts.resetPassword({ identifier: 'riordache', code: code(), password: 'a brand new password' });
  assert.equal(guard.accessFor('p1'), 'ok');
  assert.deepEqual(revoked, ['p1']);
});

test('with reverifyDays 0 a confirmation never expires', async () => {
  const { accounts, signUp, advance } = setup({ reverifyDays: 0 });
  await signUp('riordache', 'p1');
  advance(5000);
  assert.equal(accounts.accountForPlayer('p1')?.status, 'verified');
});

test('self-service deletion needs the password, erases the login data and anonymises the player', async () => {
  const { accounts, db, signUp, deleted, revoked } = setup();
  await signUp('riordache', 'p1');
  await accounts.login({ identifier: 'riordache', password: PASSWORD, client: 'c' });
  await rejects(accounts.deleteOwn({ playerId: 'p1', password: 'wrong password!', client: 'c' }), 'invalid_credentials');
  assert.ok(accounts.accountForPlayer('p1'), 'a wrong password deletes nothing');
  await accounts.deleteOwn({ playerId: 'p1', password: PASSWORD, client: 'c' });
  for (const table of ['accounts', 'verified_students', 'email_challenges']) assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n, 0, table);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM auth_sessions').get() as { n: number }).n, 0);
  assert.deepEqual([deleted, revoked], [['p1'], ['p1']]);
  await rejects(accounts.login({ identifier: 'riordache', password: PASSWORD, client: 'c' }), 'invalid_credentials');
  await rejects(accounts.deleteOwn({ playerId: 'p1', password: PASSWORD, client: 'c' }), 'invalid_credentials');
});

test('an administrator can erase an account by username, and list shows every status', async () => {
  const { accounts, signUp } = setup();
  await signUp('riordache', 'p1');
  await signUp('abc123', 'p2');
  accounts.revoke('abc123');
  assert.deepEqual(accounts.list().map(a => [a.username, a.status]).sort(), [['abc123', 'disabled'], ['riordache', 'verified']]);
  accounts.deleteByUsername('abc123');
  assert.deepEqual(accounts.list().map(a => a.username), ['riordache']);
});

test('an existing database from before disabledAt existed is upgraded in place', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE accounts (username TEXT PRIMARY KEY, playerId TEXT NOT NULL UNIQUE, passwordHash TEXT NOT NULL, createdAt INTEGER NOT NULL, verifiedAt INTEGER)');
  db.exec("INSERT INTO accounts VALUES ('old','p',?,1,1)".replace('?', "'h'"));
  initAuthSchema(db);
  initAuthSchema(db); // idempotent
  assert.equal((db.prepare('SELECT disabledAt FROM accounts WHERE username=?').get('old') as { disabledAt: number | null }).disabledAt, null);
});
