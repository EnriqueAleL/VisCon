import { AuthError } from './errors';
import { mailerFromEnv, verifySmtp } from './mailer';
import { createVerificationService, openAuthDatabase } from './service';

const usage = `Usage:
  npm run auth -- request <username|email>     email a one-time code
  npm run auth -- verify  <username|email> <code>
  npm run auth -- status  <username|email>     is this person verified?
  npm run auth -- list                         all verified students
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
  switch (command) {
    case 'request': {
      const result = await service.requestCode(identifier);
      console.log(`Code sent to ${result.sentTo}. Expires ${result.expiresAt}.`);
      break;
    }
    case 'verify': {
      const student = service.verifyCode(identifier, code);
      console.log(`Verified ${student.username} (${student.email}).`);
      break;
    }
    case 'status': {
      const student = service.getVerified(identifier);
      console.log(student ? `Verified: ${student.username} since ${student.verifiedAt}` : 'Not verified.');
      process.exitCode = student ? 0 : 1;
      break;
    }
    case 'list': console.table(service.listVerified()); break;
    default: console.error(usage); process.exitCode = 2;
  }
}

main().catch(error => {
  if (error instanceof AuthError) { console.error(`${error.code}: ${error.message}`); process.exitCode = 1; }
  else { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
});
