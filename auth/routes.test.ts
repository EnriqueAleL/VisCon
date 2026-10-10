import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';

process.env.DATABASE_PATH = ':memory:';
const { db, session, createPlayer, adoptAccount } = await import('../server/store');
const { mountAuth } = await import('./routes');

const PASSWORD = 'correct horse battery';
const outbox: { to: string; subject: string }[] = [];
let server: Server, base: string, skew = 0;

before(async () => {
  const app = express();
  app.use(express.json());
  mountAuth(app, { db, playerFromCookie: session, createPlayer, mailer: { send: async mail => { outbox.push(mail); } }, clock: () => Date.now() + skew, accountOptions: { onVerified: a => adoptAccount(a.playerId, a.username) } });
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

/** A tiny browser: keeps the ba_session cookie between calls. */
function browser() {
  let cookie = '';
  return {
    get cookie() { return cookie; },
    async call(method: string, path: string, body?: unknown) {
      const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      const set = res.headers.getSetCookie().find(c => c.startsWith('ba_session='));
      if (set) cookie = set.startsWith('ba_session=;') ? '' : set.split(';')[0];
      return { status: res.status, body: await res.json() as any, setCookie: set };
    },
  };
}
const lastCode = () => outbox.at(-1)!.subject.match(/\d{6}/)![0];

test('guest -> register -> verify -> same player, logged in; then log in again from another browser', async () => {
  const guest = browser();
  const guestPlayer = createPlayer();
  const guestCookie = `ba_session=${guestPlayer.token}`;
  const first = await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json', cookie: guestCookie }, body: JSON.stringify({ identifier: 'riordache@ethz.ch', password: PASSWORD }) });
  assert.equal(first.status, 202);
  assert.equal(outbox.at(-1)!.to, 'riordache@student.ethz.ch');

  const verifyResponse = await fetch(base + '/api/auth/verify', { method: 'POST', headers: { 'content-type': 'application/json', cookie: guestCookie }, body: JSON.stringify({ identifier: 'riordache', code: lastCode() }) });
  const verified = await verifyResponse.json() as any;
  assert.equal(verifyResponse.status, 200);
  assert.deepEqual(verified.account, { username: 'riordache', verified: true });
  assert.equal(verified.profile.id, guestPlayer.profile.id, 'the guest profile (progress, Elo) becomes the account');
  assert.equal(verified.profile.name, 'riordache');
  const set = verifyResponse.headers.getSetCookie().find(c => c.startsWith('ba_session='))!;
  assert.match(set, /HttpOnly/i);
  assert.match(set, /SameSite=Lax/i);

  const other = browser();
  assert.equal((await other.call('POST', '/api/auth/login', { identifier: 'riordache', password: 'wrong password!' })).status, 401);
  const login = await other.call('POST', '/api/auth/login', { identifier: 'riordache@student.ethz.ch', password: PASSWORD });
  assert.equal(login.status, 200);
  assert.equal(login.body.profile.id, guestPlayer.profile.id);
  const me = await other.call('GET', '/api/auth/me');
  assert.deepEqual(me.body.account, { username: 'riordache', verified: true });
  assert.equal(session(other.cookie)?.id, guestPlayer.profile.id, 'existing server code (session()) accepts the login cookie');

  assert.equal((await other.call('POST', '/api/auth/logout')).status, 200);
  assert.equal(session(`ba_session=${other.cookie.split('=')[1] ?? ''}`), null);
  assert.equal((await other.call('GET', '/api/auth/me')).body.account, null);
  void guest;
});

test('errors map to the right status codes and never leak whether a user exists', async () => {
  const b = browser();
  assert.equal((await b.call('POST', '/api/auth/register', { identifier: 'someone@gmail.com', password: PASSWORD })).status, 400);
  assert.equal((await b.call('POST', '/api/auth/register', { identifier: 'newuser1', password: 'short' })).status, 400);
  assert.equal((await b.call('POST', '/api/auth/register', { identifier: 'riordache', password: PASSWORD })).status, 409);
  assert.equal((await b.call('POST', '/api/auth/login', { identifier: 'ghost', password: PASSWORD })).status, 401);
  const a = await b.call('POST', '/api/auth/forgot', { identifier: 'ghost' });
  const c = await b.call('POST', '/api/auth/forgot', { identifier: 'riordache' });
  assert.equal(a.status, 200);
  assert.deepEqual(Object.keys(a.body), Object.keys(c.body));
  assert.equal((await b.call('POST', '/api/auth/login', undefined)).status, 400);
});

test('forgot -> reset changes the password through the API', async () => {
  const b = browser();
  skew += 61_000; // past the resend cooldown
  const before = outbox.length;
  assert.equal((await b.call('POST', '/api/auth/forgot', { identifier: 'riordache' })).status, 200);
  assert.equal(outbox.length, before + 1);
  assert.equal((await b.call('POST', '/api/auth/reset', { identifier: 'riordache', code: lastCode(), password: 'a new long password' })).status, 200);
  assert.equal((await b.call('POST', '/api/auth/login', { identifier: 'riordache', password: PASSWORD })).status, 401);
  assert.equal((await b.call('POST', '/api/auth/login', { identifier: 'riordache', password: 'a new long password' })).status, 200);
});
