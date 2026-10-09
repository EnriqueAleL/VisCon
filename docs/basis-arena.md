# Basis Arena

A working first version of a study duel app: React + TypeScript, Node.js, Socket.IO and SQLite. The interface is in English, with quizzes, numeric answers, and a Java editor. The light Campus scorebook direction was selected during planning.

## Run

Use Node.js 24 LTS (the implementation uses built-in `node:sqlite`).

```sh
npm install
npm run dev
```

Open http://localhost:5173. Create a room and open its invite link in a separate browser profile or an incognito window for the second player. Two tabs in one browser share the same player identity. Practice solo starts an explicitly labeled bot match.

```sh
npm run build
npm start
```

The production build is served on http://localhost:3001. Environment values can be supplied by the hosting environment or by Node's `--env-file` option, e.g. `node --env-file=.env --import tsx server/index.ts`. `.env.example` documents the configuration; the app does not implicitly load `.env`.

## Implemented

- Home, configurable lobby, synchronized match, per-round review, results, history, leaderboard and profile.
- Two-player invite rooms, readiness reset after configuration changes, synchronized deadlines and recoverable reconnections.
- Quiz and numeric evaluation on the server, with hidden answer keys.
- Friendly matches and Ranked Elo (start 1,200; K = 32; equal ratings exchange 16 points after a decisive result). A tie is a draw. Correct answers earn 1,000 match points; speed adds no points.
- Persistent profiles, match history and ratings in SQLite. Duplicate match finalization cannot award Elo twice.
- Practice bot, clearly distinguished from another person; bot matches never change Elo.
- Java editor with syntax highlighting, sample input/output, test result UI, and an optional isolated Judge0 integration.
- Responsive layouts, keyboard focus, reduced motion, and a keyboard-contained leave dialog.

## Content integration

All bundled questions are demonstration material, not ETH exam content. They exercise the interface and import contract while the lecture transcript pipeline is developed separately.

See [the integration contract](question-contract.md) and [the example bank](../examples/questions.json). Set `QUESTION_BANK_PATH` to an absolute path to a private JSON array of validated questions. Reload the server to replace the bank. Do not place answer keys or hidden tests in `public/` or frontend modules.

Java execution is unavailable until `JUDGE0_URL` and `JUDGE0_JAVA_LANGUAGE_ID` are configured. Configure an isolated, maintained executor; optionally supply its authentication token with `JUDGE0_API_KEY`. The app sends code only to that administrator-configured service, uses a queue/poll flow, disables network access for submissions, and requests time/memory limits. It never executes player code inside the Node.js process. An evaluator outage cancels a Java match without changing Elo.

## Current scope

- Profiles are anonymous browser identities, protected by a random HTTP-only session cookie. Clearing cookies loses access to that identity. Account recovery and cross-device sign-in are not implemented.
- Active rooms live in the Node.js process. Restarting the server removes active rooms; completed matches and ratings survive. This version uses one server process, not a distributed deployment.
- Invite links work for clients that can reach the host. `localhost` links are local to the computer; for LAN or a deployed host, open the app at its reachable address and include that origin in `ALLOWED_ORIGINS`. This repository has not been deployed publicly.
- Ranked is suitable for trying the flow with friends. Verified accounts, rating-abuse controls and calibrated production question sets are later work.
- The Java UI and adapter are implemented, but actual Java execution needs the external runner configuration. Multiple-choice currently supports a single correct option.

## Verify

```sh
npm test
npm run build
```

Browser coverage uses Python Playwright and installed Chrome. `tests/browser_flow.py` checks an actual two-browser Ranked match, numeric timeout, rating persistence on reload, privacy of answer keys, rematch, history, Java-unavailable state, and desktop/mobile layout. Run it against a built app on a separate database, using the installed `webapp-testing` server helper:

```sh
.venv/bin/python .agents/skills/webapp-testing/scripts/with_server.py \
  --server 'env PORT=3101 HOST=127.0.0.1 DATABASE_PATH=/tmp/basis-arena-qa.sqlite ALLOWED_ORIGINS=http://127.0.0.1:3101 npm start' \
  --port 3101 -- .venv/bin/python tests/browser_flow.py
```

Screenshots and the browser report are written to `.impeccable/review/` and excluded from git.

The small-bank import check starts a separate server with the three-question example fixture and verifies that each subject can create a room with valid initial settings:

```sh
.venv/bin/python .agents/skills/webapp-testing/scripts/with_server.py \
  --server 'env PORT=3102 HOST=127.0.0.1 DATABASE_PATH=/tmp/basis-arena-import.sqlite QUESTION_BANK_PATH=examples/questions.json npm start' \
  --port 3102 -- .venv/bin/python tests/import_smoke.py
```
