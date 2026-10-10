import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';

process.env.DATABASE_PATH = ':memory:';
const { db, session, createPlayer } = await import('../server/store');
const { mountAuth } = await import('../auth/routes');
const { createVerifiedGuard } = await import('../auth/guard');
const { mountAdmin } = await import('./routes');

const PASSWORD = 'correct horse battery';
const outbox: { subject: string }[] = [];
let server: Server, base: string, accounts: ReturnType<typeof mountAuth>;
const cookies = new Map<string, string>();

before(async () => {
  const app = express();
  app.use(express.json());
  accounts = mountAuth(app, { db, playerFromCookie: session, createPlayer, mailer: { send: async m => { outbox.push(m); } }, verificationOptions: { resendCooldownSeconds: 0 } });
  app.use(['/api'], createVerifiedGuard({ db, playerFromCookie: session }).http);
  mountAdmin(app, { db, playerFromCookie: session, accounts, rootAdmins: new Set(['riordache']) });
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const name of ['riordache', 'anna', 'ben', 'cara']) {
    const { profile } = createPlayer();
    await accounts.register({ identifier: name, password: PASSWORD, playerId: profile.id });
    accounts.confirm(name, outbox.at(-1)!.subject.match(/\d{6}/)![0]);
    cookies.set(name, `ba_session=${accounts.startSession(profile.id).token}`);
  }
});
after(() => server.close());

async function call(as: string | null, method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(as ? { cookie: cookies.get(as)! } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) as any };
}

test('anonymous visitors and guests cannot reach any course or admin route', async () => {
  for (const [method, path] of [['GET', '/api/platform/courses'], ['GET', '/api/me/roles'], ['POST', '/api/platform/courses/propose'], ['GET', '/api/admin/admins'], ['POST', '/api/admin/courses'], ['GET', '/api/admin/audit']]) {
    assert.equal((await call(null, method, path, method === 'GET' ? undefined : {})).status, 401, `${method} ${path}`);
  }
  const guest = createPlayer();
  const res = await fetch(base + '/api/admin/admins', { headers: { cookie: `ba_session=${guest.token}` } });
  assert.equal(res.status, 401);
});

test('roles are reported correctly and students are blocked from every administrator route', async () => {
  assert.deepEqual((await call('riordache', 'GET', '/api/me/roles')).body, { username: 'riordache', admin: true, rootAdmin: true, courseAdminOf: [] });
  assert.equal((await call('anna', 'GET', '/api/me/roles')).body.admin, false);
  for (const [method, path, body] of [
    ['GET', '/api/admin/admins'], ['GET', '/api/admin/accounts'], ['GET', '/api/admin/audit'], ['POST', '/api/admin/admins', { username: 'anna' }],
    ['POST', '/api/admin/courses', { name: 'Hacked' }], ['POST', '/api/admin/courses/computer-architecture/archive'],
    ['DELETE', '/api/admin/courses/computer-architecture'], ['POST', '/api/admin/courses/computer-architecture/admins', { username: 'anna' }],
    ['POST', '/api/admin/accounts/ben/revoke'], ['DELETE', '/api/admin/admins/riordache'],
  ] as [string, string, unknown?][]) assert.equal((await call('anna', method, path, body)).status, 403, `${method} ${path}`);
  assert.equal((await call('anna', 'PATCH', '/api/platform/courses/computer-architecture', { description: 'defaced' })).status, 403);
  assert.equal((await call('riordache', 'GET', '/api/platform/courses/computer-architecture')).body.description, 'The 24 recorded lectures of the course.');
});

test('full flow: propose, review, approve, appoint a course admin, then that admin edits only their course', async () => {
  const proposed = await call('ben', 'POST', '/api/platform/courses/propose', { name: 'Discrete Mathematics', department: 'D-MATH', degree: 'bsc', studyYear: 1, description: 'Graphs and counting' });
  assert.equal(proposed.status, 201);
  assert.deepEqual([proposed.body.id, proposed.body.status, proposed.body.admins], ['discrete-mathematics', 'proposed', ['ben']]);
  assert.deepEqual((await call('ben', 'GET', '/api/me/roles')).body.courseAdminOf, ['discrete-mathematics']);

  assert.equal((await call('cara', 'GET', '/api/platform/courses/discrete-mathematics')).status, 404, 'other students cannot see a proposal');
  assert.ok(!(await call('cara', 'GET', '/api/platform/courses')).body.courses.some((c: { id: string }) => c.id === 'discrete-mathematics'));
  assert.equal((await call('cara', 'PATCH', '/api/platform/courses/discrete-mathematics', { name: 'Hijacked' })).status, 403);
  assert.equal((await call('ben', 'POST', '/api/admin/courses/discrete-mathematics/approve')).status, 403, 'proposers cannot approve themselves');

  assert.equal((await call('riordache', 'POST', '/api/admin/courses/discrete-mathematics/approve')).body.status, 'active');
  assert.ok((await call('cara', 'GET', '/api/platform/courses')).body.courses.some((c: { id: string }) => c.id === 'discrete-mathematics'));

  assert.equal((await call('ben', 'PATCH', '/api/platform/courses/discrete-mathematics', { description: 'Graphs, counting and proofs' })).status, 200);
  assert.equal((await call('ben', 'PATCH', '/api/platform/courses/computer-architecture', { description: 'nope' })).status, 403);

  const withAdmin = await call('riordache', 'POST', '/api/admin/courses/discrete-mathematics/admins', { username: 'cara@student.ethz.ch' });
  assert.deepEqual([withAdmin.status, withAdmin.body.admins], [201, ['ben', 'cara']]);
  assert.equal((await call('riordache', 'POST', '/api/admin/courses/discrete-mathematics/admins', { username: 'ghost12' })).status, 404);
  assert.equal((await call('riordache', 'DELETE', '/api/admin/courses/discrete-mathematics/admins/ben')).status, 200);
  assert.equal((await call('ben', 'PATCH', '/api/platform/courses/discrete-mathematics', { description: 'again' })).status, 403, 'removing a seat takes effect at once');
});

test('administrators: appoint, use the powers, and remove them again', async () => {
  assert.equal((await call('riordache', 'POST', '/api/admin/admins', { username: 'anna' })).status, 201);
  assert.equal((await call('anna', 'POST', '/api/admin/courses', { name: 'Physics' })).status, 201);
  assert.deepEqual((await call('anna', 'GET', '/api/admin/admins')).body.admins, [{ username: 'anna', root: false }, { username: 'riordache', root: true }]);
  assert.equal((await call('anna', 'DELETE', '/api/admin/admins/riordache')).status, 403, 'the server-set admin is untouchable');
  assert.equal((await call('anna', 'DELETE', '/api/admin/admins/anna')).status, 403, 'no self-demotion');
  assert.equal((await call('riordache', 'DELETE', '/api/admin/admins/anna')).status, 200);
  assert.equal((await call('anna', 'POST', '/api/admin/courses', { name: 'Chemistry' })).status, 403);
});

test('blocking an account from the API ends its access immediately, and cannot be aimed at administrators or oneself', async () => {
  assert.equal((await call('ben', 'GET', '/api/platform/courses')).status, 200);
  const blocked = await call('riordache', 'POST', '/api/admin/accounts/ben/revoke');
  assert.deepEqual(blocked.body, { username: 'ben', status: 'disabled' });
  assert.equal((await call('ben', 'GET', '/api/platform/courses')).status, 401);
  assert.equal((await call('riordache', 'POST', '/api/admin/accounts/riordache/revoke')).status, 403);
  assert.equal((await call('riordache', 'POST', '/api/admin/accounts/nobody1/revoke')).status, 404);
  const list = (await call('riordache', 'GET', '/api/admin/accounts')).body.accounts;
  assert.equal(list.find((a: { username: string }) => a.username === 'ben').status, 'disabled');
  assert.equal((await call('riordache', 'POST', '/api/admin/accounts/ben/restore')).body.status, 'verified');
  assert.equal((await call('ben', 'GET', '/api/platform/courses')).status, 401, 'sessions stay closed; ben logs in again');
});

test('the audit log shows who did what, to administrators only, and bad input is refused', async () => {
  const log = (await call('riordache', 'GET', '/api/admin/audit?limit=50')).body.entries as { actor: string; action: string; target: string }[];
  for (const expected of ['course.propose', 'course.approve', 'course_admin.grant', 'admin.grant', 'admin.revoke', 'account.revoke', 'account.restore'])
    assert.ok(log.some(e => e.action === expected), expected);
  assert.equal((await call('cara', 'GET', '/api/admin/audit')).status, 403);
  assert.equal((await call('riordache', 'POST', '/api/admin/courses', { name: '<script>' })).status, 400);
  assert.equal((await call('riordache', 'POST', '/api/admin/courses', {})).status, 400);
  assert.equal((await call('riordache', 'POST', '/api/admin/courses', { name: 'Physics' })).status, 409);
  assert.equal((await call('riordache', 'GET', '/api/platform/courses/does-not-exist')).status, 404);
  assert.equal((await call('riordache', 'POST', '/api/admin/courses/does-not-exist/approve')).status, 404);
});
