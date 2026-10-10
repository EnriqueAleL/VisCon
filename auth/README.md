# ETH student verification

Proves that someone controls an ETH student mailbox by emailing them a one-time code.

## Flow

1. The user enters `riordache`, `riordache@ethz.ch` or `riordache@student.ethz.ch`. All three mean the
   same person and are normalised to the username `riordache`.
2. We email a 6-digit code to `<username>@student.ethz.ch` (`AUTH_MAIL_DOMAIN`). Staff-only
   `@ethz.ch` mailboxes therefore do not pass, which is the point.
3. The user enters the code. On success the username is stored in `verified_students`.

## Rules

- Code: 6 digits, valid 10 minutes, single use, stored only as a salted SHA-256 hash.
- 5 wrong guesses lock that code. Requesting a new code invalidates the previous one.
- One code per username per 60 s, at most 5 per hour. A failed email send does not count.
- Responses never reveal whether a mailbox exists; the address is masked (`r*******e@student.ethz.ch`).
- Only `[a-z][a-z0-9]{1,15}` usernames on `ethz.ch` / `student.ethz.ch` are accepted. Aliases such as
  `first.last@student.ethz.ch` are rejected so one student maps to one id.

## Use it

```sh
export AUTH_MAIL_TRANSPORT=console          # dev: prints the email instead of sending it
npm run auth -- request riordache@ethz.ch
npm run auth -- verify riordache 123456
npm run auth -- status riordache
npm run auth -- list
```

Production needs `AUTH_SMTP_URL` and `AUTH_MAIL_FROM` (see `.env.example`). From code:
`createVerificationService(openAuthDatabase(), mailerFromEnv())` gives `requestCode`, `verifyCode`,
`getVerified` and `listVerified`; failures throw `AuthError` with a `code` and optional `retryAfterSeconds`.

## Not done yet

- No HTTP routes and no session: nothing links a verified username to the player cookie or to the
  proxy identity (`X-User-Id`) used by the app. That is the next step.
- Rate limits are per username only. An HTTP layer should also limit per client IP, otherwise one
  client can make us mail many different students.
- We cannot tell whether a mailbox exists; a nonexistent username just never receives the code.
- Verification does not expire. Someone who leaves ETH stays verified until the table is cleared.
- Needs an SMTP account allowed to send to ETH addresses (not available in this repo).
