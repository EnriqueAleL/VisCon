import nodemailer from 'nodemailer';
import { AuthError } from './errors';

export interface Mail { to: string; subject: string; text: string }
export interface Mailer { send(mail: Mail): Promise<void> }

/** Real delivery. AUTH_SMTP_URL looks like smtps://user:password@smtp.example.org:465 */
export function createSmtpMailer(url: string, from: string): Mailer {
  const transport = nodemailer.createTransport(url);
  return {
    async send(mail) {
      try { await transport.sendMail({ from, ...mail }); }
      catch { throw new AuthError('mail_unavailable', 'The verification email could not be sent. Try again later.'); }
    },
  };
}

/** Development only: prints the email, including the code, to stderr. Never enable in production. */
export function createConsoleMailer(): Mailer {
  return { async send(mail) { console.error(`\n--- email to ${mail.to} ---\n${mail.subject}\n\n${mail.text}\n---\n`); } };
}

export function mailerFromEnv(env: NodeJS.ProcessEnv = process.env): Mailer {
  if (env.AUTH_MAIL_TRANSPORT === 'console') return createConsoleMailer();
  if (env.AUTH_SMTP_URL && env.AUTH_MAIL_FROM) return createSmtpMailer(env.AUTH_SMTP_URL, env.AUTH_MAIL_FROM);
  throw new Error('No mail transport configured. Set AUTH_SMTP_URL and AUTH_MAIL_FROM, or AUTH_MAIL_TRANSPORT=console for development.');
}

/** For the app server: starts without mail configured, and sending then fails with `mail_unavailable`. */
export function optionalMailerFromEnv(env: NodeJS.ProcessEnv = process.env): Mailer {
  try { return mailerFromEnv(env); }
  catch {
    console.warn('auth: no mail transport configured (AUTH_SMTP_URL / AUTH_MAIL_FROM); email verification is disabled.');
    return { async send() { throw new AuthError('mail_unavailable', 'Email verification is not available right now.'); } };
  }
}
