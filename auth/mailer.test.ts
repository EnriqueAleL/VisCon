import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mailerFromEnv, optionalMailerFromEnv, smtpSettingsFromEnv, verifySmtp } from './mailer';

const base = { AUTH_MAIL_FROM: 'VIScon <noreply@example.org>' };

test('separate SMTP fields: 465 is TLS from the start, 587 must use STARTTLS, no URL-encoding needed', () => {
  const tls = smtpSettingsFromEnv({ ...base, AUTH_SMTP_HOST: 'smtp.gmail.com', AUTH_SMTP_PORT: '465', AUTH_SMTP_USER: 'u@example.org', AUTH_SMTP_PASSWORD: 'p@ss/w:rd#1' });
  assert.deepEqual(tls && typeof tls.transport === 'object' && { secure: tls.transport.secure, requireTLS: tls.transport.requireTLS, pass: (tls.transport.auth as { pass: string }).pass }, { secure: true, requireTLS: false, pass: 'p@ss/w:rd#1' });
  const starttls = smtpSettingsFromEnv({ ...base, AUTH_SMTP_HOST: 'mail.example.org' });
  assert.ok(starttls && typeof starttls.transport === 'object');
  assert.deepEqual([starttls.transport.port, starttls.transport.secure, starttls.transport.requireTLS], [587, false, true]);
  assert.ok((starttls.transport.connectionTimeout ?? 0) > 0, 'a blocked port must time out');
});

test('a URL works too, and nothing is configured without a sender address', () => {
  assert.equal(smtpSettingsFromEnv({ ...base, AUTH_SMTP_URL: 'smtps://u:p@h:465' })?.transport, 'smtps://u:p@h:465');
  assert.equal(smtpSettingsFromEnv({ AUTH_SMTP_HOST: 'h' }), null);
  assert.equal(smtpSettingsFromEnv({}), null);
});

test('the console mailer that prints codes is refused in production', () => {
  assert.doesNotThrow(() => mailerFromEnv({ AUTH_MAIL_TRANSPORT: 'console' }));
  assert.throws(() => mailerFromEnv({ AUTH_MAIL_TRANSPORT: 'console', NODE_ENV: 'production' }), /refused/);
});

test('the server still starts without mail, and sending then reports mail_unavailable', async () => {
  const warn = console.warn; console.warn = () => {};
  try {
    const mailer = optionalMailerFromEnv({ NODE_ENV: 'production', AUTH_MAIL_TRANSPORT: 'console' });
    await assert.rejects(mailer.send({ to: 'a@b.c', subject: 's', text: 't' }), (e: { code: string }) => e.code === 'mail_unavailable');
  } finally { console.warn = warn; }
});

test('smtp-check explains an unreachable server instead of hanging', async () => {
  await assert.rejects(verifySmtp({ ...base, AUTH_SMTP_HOST: '127.0.0.1', AUTH_SMTP_PORT: '1' }), /cannot reach the server/);
  await assert.rejects(verifySmtp({}), /not configured/);
});
