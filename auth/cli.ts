import { AuthError } from './errors';
import { mailerFromEnv, verifySmtp } from './mailer';
import { createAccountService, type Account } from './accounts';
import { reverifyDaysFromEnv } from './guard';
import { createVerificationService, openAuthDatabase } from './service';

const usage = `Usage:
  npm run auth -- request <username|email>     email a one-time code
  npm run auth -- verify  <username|email> <code>
  npm run auth -- status  <username|email>     is this person verified?
  npm run auth -- list                         all accounts and their status
  npm run auth -- revoke  <username|email>     block an account now (sessions and live connections end)
  npm run auth -- restore <username|email>     unblock it
  npm run auth -- delete  <username|email>     erase the account and its login data
  npm run auth -- smtp-check [to]              test the SMTP login; with <to>, also send a test email`;

async function main() {
  const [command, identifier, code] = process.argv.slice(2);
  if (command === 'smtp-check') {
    console.log(await verifySmtp());
    if (identifier) {
      if (!/^[^\s@]+@[^\s@]+$/.test(identifier)) throw new Error('Give a full email address to send the test to.');
      await mailerFromEnv().send({ to: identifier, subject: 'VIScon test email', text: 'This is a test from VIScon. If you can read it, verification emails can be delivered.\n' });
      console.log(`Test email sent to ${identifier}. Check the inbox and the spam folder.`);
    }
    return;
  }
  const db = openAuthDatabase();
  const mailerNeeded = command === 'request';
  const service = createVerificationService(db, mailerNeeded ? mailerFromEnv() : { send: async () => { throw new Error('mail not configured'); } }, {
    ...(process.env.AUTH_MAIL_DOMAIN ? { mailDomain: process.env.AUTH_MAIL_DOMAIN } : {}),
  });
  const accounts = createAccountService(db, service, { reverifyDays: reverifyDaysFromEnv() });
  switch (command) {
    case 'request': {
      const result = await service.requestCode(identifier);
      console.log(`Code sent to ${result.sentTo}. Expires ${result.expiresAt}.`);
      break;
    }
    case 'verify': {
      const account = accounts.confirm(identifier, code);
      console.log(`Verified ${account.username}.`);
      break;
    }
    case 'status': {
      const student = service.getVerified(identifier);
      console.log(student ? `Verified: ${student.username} since ${student.verifiedAt}` : 'Not verified.');
      process.exitCode = student ? 0 : 1;
      break;
    }
    case 'list': console.table(accounts.list().map(a => ({ username: a.username, status: a.status, verifiedAt: a.verifiedAt }))); break;
    case 'revoke': { const a = accounts.revoke(identifier); console.log(`Revoked ${a.username}: sessions closed, access blocked.`); break; }
    case 'restore': { const a = accounts.restore(identifier); console.log(`Restored ${a.username} (${a.status}).`); break; }
    case 'delete': accounts.deleteByUsername(identifier); console.log('Account and login data deleted.'); break;
    default: console.error(usage); process.exitCode = 2;
  }
}

main().catch(error => {
  if (error instanceof AuthError) { console.error(`${error.code}: ${error.message}`); process.exitCode = 1; }
  else { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
});
