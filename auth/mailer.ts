import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { AuthError } from './errors';

export interface Mail { to: string; subject: string; text: string }
export interface Mailer { send(mail: Mail): Promise<void> }

// A blocked or filtered SMTP port must fail fast instead of hanging the request.
const TIMEOUTS = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 };

export interface SmtpSettings { transport: string | SMTPTransport.Options; from: string }

/**
 * Either AUTH_SMTP_URL (smtps://user:password@host:465, password URL-encoded) or the separate fields
 * AUTH_SMTP_HOST / _PORT / _USER / _PASSWORD, which need no encoding. Port 465 uses TLS from the start,
 * any other port must upgrade with STARTTLS (credentials are never sent in clear).
 */
export function smtpSettingsFromEnv(env: NodeJS.ProcessEnv = process.env): SmtpSettings | null {
  const from = env.AUTH_MAIL_FROM;
  if (!from) return null;
  if (env.AUTH_SMTP_HOST) {
    const port = Number(env.AUTH_SMTP_PORT || 587);
    const secure = env.AUTH_SMTP_SECURE ? env.AUTH_SMTP_SECURE === 'true' : port === 465;
    return {
      from,
      transport: {
        host: env.AUTH_SMTP_HOST, port, secure, requireTLS: !secure, ...TIMEOUTS,
        ...(env.AUTH_SMTP_USER ? { auth: { user: env.AUTH_SMTP_USER, pass: env.AUTH_SMTP_PASSWORD ?? '' } } : {}),
      },
    };
  }
  return env.AUTH_SMTP_URL ? { from, transport: env.AUTH_SMTP_URL } : null;
}

const createTransport = (settings: SmtpSettings) =>
  nodemailer.createTransport(typeof settings.transport === 'string' ? { url: settings.transport, ...TIMEOUTS } : settings.transport);

/** Real delivery. Failures are logged without secrets so an operator can tell a bad password from a blocked port. */
export function createSmtpMailer(settings: SmtpSettings): Mailer {
  const transport = createTransport(settings);
  return {
    async send(mail) {
      try { await transport.sendMail({ from: settings.from, ...mail }); }
      catch (error) {
        const e = error as { code?: string; responseCode?: number; command?: string };
        console.error(`auth: sending email failed (${[e.code, e.responseCode, e.command].filter(Boolean).join(' ') || 'unknown'})`);
        throw new AuthError('mail_unavailable', 'The verification email could not be sent. Try again later.');
      }
    },
  };
}

/** Connects and logs in without sending anything. Resolves to a short human-readable result. */
export async function verifySmtp(env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const settings = smtpSettingsFromEnv(env);
  if (!settings) throw new Error('SMTP is not configured: set AUTH_MAIL_FROM and AUTH_SMTP_HOST (or AUTH_SMTP_URL).');
  try { await createTransport(settings).verify(); }
  catch (error) {
    const e = error as { code?: string; responseCode?: number; message?: string };
    const hint = e.code === 'EAUTH' ? 'wrong user or password (Gmail needs an app password)'
      : /ETIMEDOUT|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|timed? ?out/i.test(`${e.code} ${e.message}`) ? 'cannot reach the server: wrong host or port, or outbound SMTP is blocked from this machine'
      : e.code === 'ESOCKET' ? 'TLS problem: port 465 needs TLS from the start, other ports (587) use STARTTLS' : 'see the message above';
    throw new Error(`${e.code ?? 'error'}${e.responseCode ? ` ${e.responseCode}` : ''}: ${e.message ?? ''} -> ${hint}`);
  }
  return `SMTP login OK, sending as ${settings.from}`;
}

/** Development only: prints the email, including the code, to stderr. */
export function createConsoleMailer(): Mailer {
  return { async send(mail) { console.error(`\n--- email to ${mail.to} ---\n${mail.subject}\n\n${mail.text}\n---\n`); } };
}

export function mailerFromEnv(env: NodeJS.ProcessEnv = process.env): Mailer {
  if (env.AUTH_MAIL_TRANSPORT === 'console') {
    if (env.NODE_ENV === 'production') throw new Error('AUTH_MAIL_TRANSPORT=console prints verification codes to the log and is refused when NODE_ENV=production.');
    return createConsoleMailer();
  }
  const settings = smtpSettingsFromEnv(env);
  if (settings) return createSmtpMailer(settings);
  throw new Error('No mail transport configured. Set AUTH_MAIL_FROM and AUTH_SMTP_HOST (or AUTH_SMTP_URL), or AUTH_MAIL_TRANSPORT=console for development.');
}

/** For the app server: starts without mail configured, and sending then fails with `mail_unavailable`. */
export function optionalMailerFromEnv(env: NodeJS.ProcessEnv = process.env): Mailer {
  try { return mailerFromEnv(env); }
  catch (error) {
    console.warn(`auth: email verification is disabled. ${error instanceof Error ? error.message : ''}`);
    return { async send() { throw new AuthError('mail_unavailable', 'Email verification is not available right now.'); } };
  }
}
