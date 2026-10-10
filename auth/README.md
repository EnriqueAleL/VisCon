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
30 days). Accounts and sessions live in the app database (`DATABASE_PATH`); the CLI uses the same file unless `AUTH_DB_PATH` is set.

## What is guarded

With `AUTH_REQUIRE_VERIFIED` unset (the default), a request is served only if its session belongs to a player
whose account has `verifiedAt` set, i.e. a confirmed `@student.ethz.ch` mailbox:

| Surface | Without a verified account |
|---|---|
| every `/api/*` route (Arena, study world, lectures, Q&A, puzzles, study tables) | `401 login_required` (no account) or `403 verification_required` (registered, email not confirmed) |
| lecture videos, captions, chapters under `/media/*` | same |
| Socket.IO root namespace (Arena) and `/study` | connection refused with the same message |
| `/api/health`, `/api/auth/*` | open, so people can register, log in and be monitored |
| the built front end (`/`, `/arena`, `/learn`, every JS, CSS, image and font file) | **gated too.** Anonymous visitors get a tiny sign-in page (`auth.html`, 733 bytes plus ~260 KB of React and the screens) for every page URL, and `401` for every other file. After log-in the same URL serves the real app. Only `favicon.svg`, the fonts and the sign-in page's own files are public. |

Nothing about the courses (names, structure, lectures, questions, media) leaves the server before verification. The sign-in page's file list is read from Vite's build manifest (`dist/.vite/manifest.json`), so the server refuses to start with the guard on if `dist/auth.html` is missing. Anonymous guest cookies are never enough, and confirming an account retires the account's old guest cookie.
The hackathon proxy headers (`MANIA_TRUST_PROXY`) do not bypass the guard.
`AUTH_REQUIRE_VERIFIED=false` turns the guard off for local front-end work (the browser test runner sets it).
The deployment checker needs a logged-in cookie: `CHECK_COOKIE_FILE` with the `ba_session` value.

## Front end

`shared/auth/` holds the screens: `AuthGate.tsx` (flow), `authApi.ts` (calls `/api/auth/*`), `strings.ts` (en/de) and
`AuthGate.css`. `src/main.tsx` and `web-interface/src/main.tsx` wrap their root in `<AuthGate locale=...>`. The gate asks
`GET /api/auth/me`; when the server reports `required: false` (guard disabled) the app renders straight away.
The server stays the security boundary, the gate is only the user interface.

## Account lifecycle and administration

Statuses: **pending** (mailbox not confirmed), **verified**, **expired** (confirmed more than `AUTH_REVERIFY_DAYS`
ago, default 180, `0` = never) and **disabled**. Only *verified* passes the guard. An expired student logs in with the
password, confirms a fresh emailed code and is back; a password reset also renews it. This keeps former students out.

Run these where the app's database is (on the VM: `docker compose exec app npm run auth -- ...`):

```sh
npm run auth -- list                      # every account and its status
npm run auth -- revoke  <username|email>  # block now: sessions end, open sockets close within ~30 s
npm run auth -- restore <username|email>
npm run auth -- delete  <username|email>  # erase the account and its login data (erasure requests)
```

A signed-in user can delete their own account with `POST /api/auth/delete {password}`. Deletion removes the account,
sessions, codes and verification record; their study progress stays under an anonymous id (`Student xxxx`) with no link
back to the person. Open Socket.IO connections are re-checked every `AUTH_SOCKET_RECHECK_SECONDS` (default 30), so a revoke
from the command line, an expired session or an expired verification also ends live connections.

Responses carry `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN` and `Referrer-Policy: same-origin`, plus
HSTS when `COOKIE_SECURE=true`. The server warns at startup if it runs in production without `COOKIE_SECURE=true`.

## Roles and courses

See [`../admin/README.md`](../admin/README.md): admins (`AUTH_ADMINS`), course admins and courses.

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

- **Screens are a first version.** `shared/auth/AuthGate.tsx` (English and German, styled with the shared tokens) wraps the study world, Arena and lecture app. It shows log in / create account / code / forgot-password screens until the account is verified, re-shows them if the session ends, and adds a small "Signed in as" pill with log out. Expect to restyle it.
- **Needs SMTP.** Set `AUTH_MAIL_FROM` and `AUTH_SMTP_HOST` (+ `_PORT`, `_USER`, `_PASSWORD`) or `AUTH_SMTP_URL`; test with
  `npm run auth -- smtp-check [recipient]`. Without them the server starts with a warning but cannot send codes.
  `AUTH_MAIL_TRANSPORT=console` prints codes in development and is refused when `NODE_ENV=production`.
- A nonexistent mailbox just never receives the code; we cannot tell.
- Verification never expires, and there is no account deletion or e-mail change yet.
- Guest profiles still exist. Logging in on a device abandons that device's guest profile.
- Rate limits are in memory per process (fine for one container).
