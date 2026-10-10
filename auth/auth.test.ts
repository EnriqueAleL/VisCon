import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AuthError } from './errors';
import { maskEmail, parseEthIdentifier } from './identifier';
import { createVerificationService, openAuthDatabase } from './service';
import type { Mail } from './mailer';

function setup(options = {}) {
  const sent: Mail[] = [];
  let time = 1_800_000_000_000;
  const service = createVerificationService(openAuthDatabase(':memory:'), { send: async mail => { sent.push(mail); } }, options, () => time);
  const codeOf = (mail: Mail) => mail.subject.match(/\d{6}/)![0];
  return { service, sent, codeOf, advance: (seconds: number) => { time += seconds * 1000; } };
}
const code = (fn: () => unknown) => { try { fn(); } catch (error) { return error instanceof AuthError ? error.code : 'other'; } return 'none'; };

test('accepts a username or either ETH address form and normalises to the username', () => {
  for (const input of ['riordache', 'riordache@ethz.ch', 'riordache@student.ethz.ch', '  RiOrdache@Student.ETHZ.ch ']) {
    assert.equal(parseEthIdentifier(input).username, 'riordache');
  }
});

test('rejects other domains, aliases and malformed input', () => {
  for (const input of ['', 'a', 'riordache@gmail.com', 'riordache@ethz.ch.evil.com', 'rio rdache', 'first.last@student.ethz.ch', 'a@b@ethz.ch', '1abc', '@ethz.ch', 42, null]) {
    assert.equal(code(() => parseEthIdentifier(input)), 'invalid_identifier', String(input));
  }
});

test('masks the address in responses', () => assert.equal(maskEmail('riordache@student.ethz.ch'), 'r*******e@student.ethz.ch'));

test('mails a six-digit code to the student mailbox and verifies it once', async () => {
  const { service, sent, codeOf } = setup();
  const result = await service.requestCode('riordache@ethz.ch');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'riordache@student.ethz.ch');
  assert.match(codeOf(sent[0]), /^\d{6}$/);
  assert.equal(result.sentTo, 'r*******e@student.ethz.ch');
  assert.equal(service.getVerified('riordache'), null);
  const student = service.verifyCode('riordache', codeOf(sent[0]));
  assert.equal(student.username, 'riordache');
  assert.equal(service.getVerified('riordache@student.ethz.ch')?.email, 'riordache@student.ethz.ch');
  assert.equal(code(() => service.verifyCode('riordache', codeOf(sent[0]))), 'invalid_or_expired');
});

test('a wrong code is rejected and locks the challenge after the attempt limit', async () => {
  const { service, sent, codeOf } = setup({ maxAttempts: 3 });
  await service.requestCode('riordache');
  const right = codeOf(sent[0]), wrong = right === '000000' ? '000001' : '000000';
  for (let i = 0; i < 3; i++) assert.equal(code(() => service.verifyCode('riordache', wrong)), 'invalid_or_expired');
  assert.equal(code(() => service.verifyCode('riordache', right)), 'too_many_attempts');
  assert.equal(service.getVerified('riordache'), null);
});

test('codes expire', async () => {
  const { service, sent, codeOf, advance } = setup({ codeTtlSeconds: 600 });
  await service.requestCode('riordache');
  advance(601);
  assert.equal(code(() => service.verifyCode('riordache', codeOf(sent[0]))), 'invalid_or_expired');
});

test('a new code invalidates the previous one, and requests are rate limited', async () => {
  const { service, sent, codeOf, advance } = setup({ resendCooldownSeconds: 60, maxRequestsPerHour: 3 });
  await service.requestCode('riordache');
  await assert.rejects(service.requestCode('riordache'), (e: AuthError) => e.code === 'rate_limited' && e.retryAfterSeconds! > 0);
  advance(61); await service.requestCode('riordache');
  const [first, second] = sent.map(codeOf);
  if (first !== second) assert.equal(code(() => service.verifyCode('riordache', first)), 'invalid_or_expired');
  advance(61); await service.requestCode('riordache');
  advance(61);
  await assert.rejects(service.requestCode('riordache'), (e: AuthError) => e.code === 'rate_limited');
  assert.equal(service.verifyCode('riordache', codeOf(sent[2])).username, 'riordache');
});

test('a failed email send does not consume the rate limit or leave a usable code', async () => {
  const db = openAuthDatabase(':memory:');
  let fail = true; const sent: Mail[] = [];
  const service = createVerificationService(db, { send: async mail => { if (fail) throw new AuthError('mail_unavailable', 'down'); sent.push(mail); } });
  await assert.rejects(service.requestCode('riordache'), (e: AuthError) => e.code === 'mail_unavailable');
  fail = false;
  await service.requestCode('riordache');
  assert.equal(sent.length, 1);
});

test('rejects malformed codes without touching the attempt counter', async () => {
  const { service, sent, codeOf } = setup({ maxAttempts: 1 });
  await service.requestCode('riordache');
  for (const bad of ['', '12345', '1234567', 'abcdef', 123456, null]) assert.equal(code(() => service.verifyCode('riordache', bad)), 'invalid_or_expired');
  assert.equal(service.verifyCode('riordache', codeOf(sent[0])).username, 'riordache');
});
