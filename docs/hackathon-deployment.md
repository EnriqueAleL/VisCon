# The Mania: VIScon deployment runbook

This runbook packages the app for the supplied Ubuntu VM (4 vCPU, 8 GB RAM,
80 GB disk). It does not claim that a VM has been accessed or a site published.
The managed hostname and SSH details must come from the team portal.

## Deploy on Saturday, then update continuously

1. Use the team's VM and clone the public repository there. Never put API keys in
   the repository or a `VITE_*` variable. The image build excludes `.env`, media,
   local databases, virtual environments, and Git history.
2. Pull Git LFS **before** Sunday. The lecture `.mp4` files must be actual videos,
   not small pointer files. Mounts deliberately keep the recordings and original
   transcripts outside the image build; changing frontend code never uploads the
   full media corpus to the Docker builder again.

   ```sh
   git lfs install
   git lfs pull
   git lfs fsck
   du -sh lectures
   ```

   If Git LFS is unavailable on the supplied Ubuntu VM, install the distribution's
   `git-lfs` package first. Make the same read-only corpus directories available
   through `LECTURES_DIR`, `QA_DATA_DIR`, and `DEMO_MEDIA_DIR` if they are stored
   outside the checkout. `qa/data/index.json` and all 24 original `.vtt` files are
   required for startup. Missing recordings keep search and transcripts working
   but are a failing final demo check.
3. Copy `.env.example` to the untracked root `.env`. Compose reads it for
   interpolation; no `.env` is embedded in an image. Set the deployment values:

   ```dotenv
   APP_PUBLIC_URL=https://NN.hackathon.ethz.ch
   ALLOWED_ORIGINS=https://NN.hackathon.ethz.ch,http://localhost:8080,http://127.0.0.1:8080
   COOKIE_SECURE=true
   MANIA_TRUST_PROXY=false
   LECTURE_QA_PROVIDER=local
   DOCKER_TARGET=runtime
   ```

   Replace `NN` with the actual team hostname. Origin values have no trailing
   slash or spaces. Compose forces `HOST=0.0.0.0` and `PORT=8080`, so the example's
   development `PORT=3001` is harmless. Leave `EXAM_DATE` unset until the correct
   exam date is known, or let students choose their own date in the app.
4. Build and start the app:

   ```sh
   docker compose build app
   docker compose up -d app
   docker compose ps
   docker compose logs --tail=100 app
   curl --fail http://127.0.0.1:8080/api/health
   docker compose exec app npm run check:deployment -- http://127.0.0.1:8080 --require-videos --ask --load=30
   ```

   The build runs TypeScript checking and Vite. Startup uses Node 24 and the
   existing `tsx` server with built-in SQLite. It runs as the `node` user, with a
   read-only root filesystem, read-only corpus mounts, temporary `/tmp`, and the
   persistent `mania-data` volume for SQLite. Runtime limits leave CPU and memory
   headroom for the OS. The log rotation prevents unbounded disk growth. The
   optional Python image adds Python 3.11 and its dependencies; it does not depend
   on the VM's Python 3.14 environment.

   With `COOKIE_SECURE=true`, browser sessions must use the managed HTTPS URL.
   The internal checker sends its temporary study cookie itself, allowing a local
   HTTP smoke test without weakening the deployment setting.
5. Open `https://NN.hackathon.ethz.ch` from a mentor's laptop and a phone on mobile
   data. Test searching, video seeking, one recall quest, the pipeline and cache,
   a puzzle submission, and a second browser's live board. Use browser network
   tools to confirm Socket.IO starts with HTTP polling. Keep **default transports**;
   the managed proxy does not support a raw WebSocket-only connection.

## ETH account guard

The whole API, the lecture media and both Socket.IO namespaces require an account with a confirmed ETH student
email (see [`auth/README.md`](../auth/README.md)). Before deploying: set `AUTH_SMTP_URL` and `AUTH_MAIL_FROM` so codes
can be sent, set `AUTH_CLIENT_IP_HEADER=x-forwarded-for` so rate limits are per person behind the proxy, and make sure the
front end has a register/log-in screen. Leave `AUTH_REQUIRE_VERIFIED` unset. For `check:deployment`, log in once in a
browser and pass the `ba_session` cookie through `CHECK_COOKIE_FILE`.

## Email for verification codes

Nobody can sign up until the app can send mail. Pick one sender and put it in the untracked `.env` (Compose passes
these variables into the container; `AUTH_REQUIRE_VERIFIED` is intentionally not passed, so the guard cannot be
switched off in the deployed app):

```dotenv
AUTH_MAIL_FROM="VIScon <sender@example.org>"   # must be an address the SMTP account may send as
AUTH_SMTP_HOST=smtp.gmail.com                   # your provider's SMTP server
AUTH_SMTP_PORT=465                              # 465 = TLS, 587 = STARTTLS
AUTH_SMTP_USER=sender@example.org
AUTH_SMTP_PASSWORD=app-password-here
AUTH_CLIENT_IP_HEADER=x-forwarded-for
```

Then test from the VM, before anyone tries the website, with a real `@student.ethz.ch` mailbox as the recipient:

```sh
docker compose up -d app
docker compose exec app npm run auth -- smtp-check                       # login only, sends nothing
docker compose exec app npm run auth -- smtp-check someone@student.ethz.ch   # also sends a test mail
```

`smtp-check` says whether the problem is the password, the host/port, or outbound SMTP being blocked on the VM.
Look in the recipient's spam folder as well: ETH filters unknown senders. `AUTH_MAIL_TRANSPORT=console` is refused in
production on purpose, because it would print every code into the logs.

## Student uploads

Submitted material is stored under `UPLOADS_DIR` (`/app/.data/uploads`, on the persistent volume, so it survives restarts and counts against
the disk). The limits are in `.env.example`; a lecture video may be up to 2 GB by default. Before relying on it, upload a large file through the
managed URL: the proxy in front of the VM may cap request size or duration, and the app cannot raise that. Back up `.data` if the material matters.

## Indexing approved material

Approved lectures are indexed with an LLM and approved PDFs are text-extracted, in the background (`indexing/README.md`). That needs Python, so build the
Python image (`DOCKER_TARGET=qa-runtime` in `.env`; it installs `qa/requirements.txt`) and set `OPENAI_API_KEY` and `QA_INDEX_MODEL`. Without them
approvals still work and items simply wait; `GET /api/platform/courses/<id>/index` shows why. Check Python with
`docker compose exec app /opt/qa-venv/bin/python -c "import openai, pypdf"`. Published material and indexes live under `/app/.data/courses`.

## Trust the managed identity explicitly

`X-User-Id` and `X-User-Name` are honored only when `MANIA_TRUST_PROXY=true`.
Until then, local guests use the existing signed player session. To use real
edu-ID names on the public board, enable this only after confirming that requests
reach the VM through the managed proxy and direct requests cannot forge trusted
headers. Set `MANIA_TRUSTED_PROXY_IPS` to the actual proxy addresses seen by the
container where those addresses are available. It is a comma-separated address
allowlist; mapped IPv4 addresses are handled. An empty allowlist with trust enabled
trusts every incoming connection, so it requires an ingress restriction that
admits only the managed proxy. Do not enable that combination on a directly
reachable public VM. Use the portal's network configuration or the operator's
firewall; the app does not configure either.

Redeploy after changing these variables. `/api/mania/progress` returns
`profile.source: "proxy"` on a managed authenticated request when configured
correctly. Confirm it in the browser, without copying identity headers into the
frontend. The `APP_PUBLIC_URL` must match the address used in puzzle share links.

## Optional backend model Q&A

The default local transcript search and prepared demo answers require no key.
To use the existing Python pipeline, set these backend-only values in root `.env`:

```dotenv
DOCKER_TARGET=qa-runtime
LECTURE_QA_PROVIDER=python
QA_PYTHON=/opt/qa-venv/bin/python
OPENAI_API_KEY=your_key_here
QA_INDEX_MODEL=your_available_model
QA_ANSWER_MODEL=your_available_model
```

Rebuild with `docker compose build app`, then `docker compose up -d app`.
The model must be available to your key. `OPENAI_BASE_URL` can point to the supplied
gateway if it supports the Responses API used by this pipeline. Python Q&A falls
back visibly to local transcript search if the provider is unavailable. Do not
show `.env`, environment dumps, or `docker compose config` with real keys during
the pitch; Compose configuration includes resolved backend environment values.

## Check the managed URL

From a machine with this checkout and Node dependencies:

```sh
npm run check:deployment -- https://NN.hackathon.ethz.ch --require-videos --ask --load=30
```

Login redirects are an expected failure until an authenticated session is supplied.
Use `CHECK_COOKIE_FILE` pointing to a private file outside the public repository
that contains your browser's **Cookie header value**. Restrict that file to your
own user. The checker never prints cookies or identity response bodies. The URL
argument must be an origin only. `--ask` makes one Q&A call; a configured provider
may charge for it. `--load` is a bounded health smoke check, not evidence that the
full audience can submit simultaneously. Rehearse the puzzle with several phones
through the managed URL and watch memory, latency, and the live board.

```sh
docker stats --no-stream
docker compose logs --tail=100 app
```

## Updates, persistence, and recovery

For each reviewed source update on the VM:

```sh
git pull --ff-only
docker compose build app
docker compose up -d app
docker compose exec app npm run check:deployment -- http://127.0.0.1:8080 --require-videos
```

Use the existing checkout's normal branch workflow; do not reset local changes.
Keep the persistent volume when replacing containers. `docker compose down -v`
deletes saved profiles, mastery, reviews, tables, and leaderboards. Arena rooms and
active puzzle attempts live partly in memory and can end during a restart; finish
them before planned updates. For a consistent SQLite backup, briefly stop the app
and archive the named volume (including WAL/SHM files), then start it again:

```sh
mkdir -p ../mania-backups
docker compose stop app
docker compose run --rm --no-deps -T --entrypoint tar app -czf - -C /app/.data . > ../mania-backups/mania-data.tar.gz
docker compose up -d app
```

Keep the backup directory outside the public checkout because it contains participant data.
For a failed release, redeploy the previously reviewed source version and retain
the same volume. Do not improvise database resets during the final. `restart:
unless-stopped` restarts an unexpectedly exited process after a VM reboot; Docker
health status alone does not automatically restart a living unhealthy process.

## Sunday deadline and public vote

- **09:00 CEST:** feature freeze. Only validated fixes, polish, and rehearsal.
- **11:00:** finish the last deployment; run required-video and Q&A checks.
- **11:30:** test the managed URL from mobile data, including video seeking,
  puzzle submission, live presence, and the projected leaderboard.
- **Before 12:00:** link the public repository on the team page, check that the
  running Compose service has its restart policy, and verify that corpus mounts
  and the database volume survive a controlled restart. Stop changing the VM.
- **Before the final/public vote:** change portal access from team-only to
  **Authentication only** so any edu-ID participant can join. This is a manual
  portal setting; application code cannot change it. Recheck with a participant
  outside the team. Keep backend keys private.
- Ask the organizers before posting the puzzle in Discord. No announcement is
  sent by this implementation. Reserve the designated sidequest owner for the
  leaderboard tasks and submit real completed sidequests through helpdesk.

Use [the three-minute demo script](demo-script.md). After VM access ends at noon,
the service must run unattended; there is no assumed opportunity for a hotfix.
