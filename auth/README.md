# ETH student accounts

Accounts for ETH students: ETH username or email + password, confirmed once by a one-time code mailed to their student mailbox, then a normal password log-in from any device.

## Flow

1. **Register** (`POST /api/auth/register {identifier, password}`). The identifier is `riordache`,
   `riordache@ethz.ch` or `riordache@student.ethz.ch`; all normalise to the username `riordache`. The
   current guest profile (progress, Elo, history) becomes the account. A 6-digit code is mailed to
   `<username>@student.ethz.ch` (`AUTH_MAIL_DOMAIN`), so a staff-only `@ethz.ch` mailbox does not pass.
2. **Verify** (`POST /api/auth/verify {identifier, code}`). The account becomes active, the display name
   becomes the username, and this browser is logged in.
3. **Log in** later from any device (`POST /api/auth/login {identifier, password}`); **log out**
   (`/api/auth/logout`). `GET /api/auth/me` says who you are without creating a guest.
4. **Forgot password**: `POST /api/auth/forgot {identifier}` mails a fresh code, then
   `POST /api/auth/reset {identifier, code, password}` sets the new password and signs out every device.
   `POST /api/auth/resend {identifier}` re-sends the code for an unconfirmed registration.

An account cannot log in until step 2 is done. An unconfirmed registration is just a pending row that the
real owner can restart; it never blocks a username.

## How it plugs into the app

An account owns an ordinary `players` row, so the Arena, the study world and sockets work unchanged.
`session()` in `server/store.ts` accepts either the old guest token or a login session from `auth_sessions`,
both through the same `ba_session` cookie (HttpOnly, SameSite=Lax, `Secure` when `COOKIE_SECURE=true`,
30 days). Accounts and sessions live in the app database; the CLI uses its own file (`AUTH_DB_PATH`).

## Rules

- Passwords: 10-128 characters, scrypt (N=32768) with a per-password salt, never stored or logged in clear.
- Codes: 6 digits, 10 minutes, single use, stored as salted hashes; 5 wrong guesses lock one; a new code
  cancels the old one; 1 per minute and 5 per hour per username.
- Log-in failures: 5 per 15 min per username+client, 30 per username, 30 per client. Unknown users cost the
  same time as wrong passwords and return the same error.
- Sessions are stored hashed; a password reset deletes all of them.
- `forgot`/`resend` answer identically whether or not the account exists.
- Per-IP limits: 60 requests/min and 20 email-sending requests/hour. Behind the managed proxy set
  `AUTH_CLIENT_IP_HEADER=x-forwarded-for`, otherwise everyone shares the proxy's address.
- Only `[a-z][a-z0-9]{1,15}` usernames on `ethz.ch` / `student.ethz.ch`; aliases like
  `first.last@student.ethz.ch` are rejected so one student maps to one account.

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

- **No front end.** There are no register/login screens; the API is ready for them.
- **Needs SMTP.** Without `AUTH_SMTP_URL` + `AUTH_MAIL_FROM` the server starts (with a warning) but cannot
  send codes. Use `AUTH_MAIL_TRANSPORT=console` in development to print them.
- A nonexistent mailbox just never receives the code; we cannot tell.
- Verification never expires, and there is no account deletion or e-mail change yet.
- Guest profiles still exist. Logging in on a device abandons that device's guest profile.
- Rate limits are in memory per process (fine for one container).
