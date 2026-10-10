import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';

process.env.DATABASE_PATH = ':memory:';
const { db, session, createPlayer, adoptAccount } = await import('../server/store');
const { mountAuth } = await import('./routes');
const { createVerifiedGuard } = await import('./guard');

const PASSWORD = 'correct horse battery';
const outbox: { subject: string }[] = [];
let server: Server, base: string, skew = 0;

before(async () => {
  const app = express();
  app.use(express.json());
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  mountAuth(app, { db, playerFromCookie: session, createPlayer, mailer: { send: async m => { outbox.push(m); } }, clock: () => Date.now() + skew, accountOptions: { onVerified: a => adoptAccount(a.playerId, a.username) } });
  app.use(['/api', '/media'], createVerifiedGuard({ db, playerFromCookie: session }).http);
  app.get('/api/secret', (_req, res) => res.json({ secret: true }));
  app.get('/media/lectures/lec1.mp4', (_req, res) => res.send('video'));
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

const get = (path: string, cookie?: string) => fetch(base + path, { headers: cookie ? { cookie } : {} });
const post = (path: string, body: unknown, cookie?: string) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
const code = () => outbox.at(-1)!.subject.match(/\d{6}/)![0];
const cookieOf = (res: Response) => res.headers.getSetCookie().find(c => c.startsWith('ba_session='))!.split(';')[0];

test('anonymous visitors only reach the health probe and the log-in flow', async () => {
  assert.equal((await get('/api/health')).status, 200);
  assert.equal((await get('/api/auth/me')).status, 200);
  for (const path of ['/api/secret', '/media/lectures/lec1.mp4', '/api/secret?x=/api/auth/', '/api/authx']) {
    const res = await get(path);
    assert.equal(res.status, 401, path);
    assert.equal(((await res.json()) as any).code, 'login_required');
  }
});

test('a guest cookie and an unconfirmed registration are both refused; only a confirmed ETH mailbox passes', async () => {
  const guest = createPlayer();
  const guestCookie = `ba_session=${guest.token}`;
  assert.equal((await get('/api/secret', guestCookie)).status, 401, 'guest profile is not enough');

  assert.equal((await post('/api/auth/register', { identifier: 'riordache', password: PASSWORD }, guestCookie)).status, 202);
  const pending = await get('/api/secret', guestCookie);
  assert.equal(pending.status, 403, 'registered but not yet confirmed');
  assert.equal(((await pending.json()) as any).code, 'verification_required');
  const login = await post('/api/auth/login', { identifier: 'riordache', password: PASSWORD });
  assert.equal(login.status, 403, 'password alone does not pass before the email is confirmed');

  const verify = await post('/api/auth/verify', { identifier: 'riordache', code: code() }, guestCookie);
  assert.equal(verify.status, 200);
  const cookie = cookieOf(verify);
  assert.equal((await get('/api/secret', cookie)).status, 200);
  assert.equal(await (await get('/media/lectures/lec1.mp4', cookie)).text(), 'video');

  assert.equal((await get('/api/secret', guestCookie)).status, 401, 'the old anonymous cookie stops working once the account is confirmed');
  const again = await post('/api/auth/login', { identifier: 'riordache@ethz.ch', password: PASSWORD });
  assert.equal(again.status, 200);
  assert.equal((await get('/api/secret', cookieOf(again))).status, 200);
});

test('a logged-in but unconfirmed session is told to verify (403), not to log in', async () => {
  const guest = createPlayer();
  skew += 120_000;
  const cookie = `ba_session=${guest.token}`;
  await post('/api/auth/register', { identifier: 'abc123', password: PASSWORD }, cookie);
  // Give the pending account a real login session to prove sessions alone are not trusted either.
  const { createAccountService } = await import('./accounts');
  const { createVerificationService } = await import('./service');
  const accounts = createAccountService(db, createVerificationService(db, { send: async () => {} }));
  const { token } = accounts.startSession(guest.profile.id);
  const res = await get('/api/secret', `ba_session=${token}`);
  assert.equal(res.status, 403);
  assert.equal(((await res.json()) as any).code, 'verification_required');
});

test('logout and password reset revoke access immediately', async () => {
  const login = await post('/api/auth/login', { identifier: 'riordache', password: PASSWORD });
  const cookie = cookieOf(login);
  assert.equal((await get('/api/secret', cookie)).status, 200);
  await post('/api/auth/logout', {}, cookie);
  assert.equal((await get('/api/secret', cookie)).status, 401);
});

test('socket middleware applies the same rule, and the guard can be disabled for development', async () => {
  const guard = createVerifiedGuard({ db, playerFromCookie: session });
  const verifiedLogin = await post('/api/auth/login', { identifier: 'riordache', password: PASSWORD });
  const ask = (cookie?: string) => new Promise<Error | undefined>(resolve => guard.socket({ handshake: { headers: { cookie } } }, resolve));
  assert.ok(await ask(), 'anonymous socket refused');
  assert.ok(await ask(`ba_session=${createPlayer().token}`));
  assert.equal(await ask(cookieOf(verifiedLogin)), undefined);
  const open = createVerifiedGuard({ db, playerFromCookie: session, enabled: false });
  assert.equal(open.accessFor(undefined), 'ok');
});
