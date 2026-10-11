# PolyCosmos

A study platform for ETH students that turns a semester of lecture recordings,
scripts and slides into a place you can explore, search and practise in, alone or
with friends.

Built at the VIScon Hackathon. The repository keeps its original name, `VisCon`.

## The problem

ETH students spend three to four months of every year studying for exams. Much of
that time goes not into learning but into finding things: the material for a
single course is spread across dozens of hour-long recordings, a PDF script, slide
decks and exercise sheets, and none of it is connected. Remembering *that*
something was explained is easy; finding *where* means scrubbing through video.
Revision is mostly solitary, and there is little feedback on what you actually know
until the exam itself.

PolyCosmos connects that material and makes it navigable:

- every lecture is broken into chapters you can see, search and open at the exact
  second the topic starts;
- a question in plain words returns the lecture and timestamp where it was answered,
  with the source shown, never an invented answer;
- scripts open in a reader that translates any selected passage and answers
  questions about the book with a page reference;
- recall practice and live 1v1 quiz duels turn revision into something you can do
  with other students, with an Elo rating that shows progress.

## What's in it

| Page | URL | What it does |
| --- | --- | --- |
| **Galaxy** | `/` | The front page. Every course is a planet, its lectures are cities on the surface, and each chapter is a building whose height is the chapter's length. Fly in, click a building, and the recording opens at that chapter. Includes the question box, a lecture chat, the course documents and the Versus ship. |
| **Lectures** | `/learn` | The same courses as a list: department → degree and study year → course → lecture. Video player with chapters, transcript, bookmarks, watched-chapter tracking, study notes and the lecture chat. |
| **Versus** | `/arena`, `/room/:id` | Real-time 1v1 matches with invitation links. Multiple choice, numeric and Java questions; Ranked (Elo, start 1200, K = 32) or Friendly; practice against a bot. Played from a 3D cockpit where correct answers fire on the opponent's ship. |
| **Study world** | `/world` | A hand-built world for Digital Design and Computer Architecture: 24 lecture cities, recall with spaced review, daily expeditions, pipeline, cache and virtual-memory visualizers, timed mock exams, puzzles and shared study tables. |
| **Reader** | in the galaxy and list views | A PDF reader for course scripts with selectable text, translation of any selection, and questions about the book answered with a page number. |
| **Campus** | `/campus` | A satellite journey down to ETH Zürich. |

Behind those pages:

- **ETH accounts.** Registration with an ETH username and password, confirmed by a
  one-time code sent to `@student.ethz.ch`. Until then the server sends nothing
  about the courses, not even the page's own scripts. See [auth/README.md](auth/README.md).
- **Courses from students.** Any verified student can propose a course and submit
  lecture transcripts, videos, slides or scripts. Admins and course admins review
  them; approved lectures are indexed in the background and appear in the galaxy
  with no further work. See [admin/](admin/README.md), [submissions/](submissions/README.md),
  [indexing/](indexing/README.md) and [docs/course-catalog.md](docs/course-catalog.md).

### Content

- 24 recorded DDCA lectures with their original WebVTT transcripts (`lectures/`,
  stored with Git LFS) and a chapter index of 500+ chapters (`qa/data/`).
- 120 original Versus quiz questions, 30 each for Discrete Mathematics, Linear
  Algebra, Introduction to Programming and DDCA (`questions/versus/`), plus numeric
  and Java exercises and 72 DDCA recall questions. They are practice material
  written by the team, not official ETH exam questions.
- Three short, self-made demo videos for testing the player, labelled as demos.

## How it works

| Part | Built with | Used for |
| --- | --- | --- |
| Galaxy | Plain JavaScript, three.js (vendored), WebGL | The 3D course map, city scenes, cockpit and duel scenes. No build step; served as-is. |
| Lectures, Versus, Study world, Campus | React 19, TypeScript, Vite | The application pages. CodeMirror for the Java editor, KaTeX for formulas, MapLibre GL for the campus map, Lucide for icons. |
| Server | Node.js 24, Express 5, Socket.IO | One process serves every page, the API and the video files (with byte ranges, so seeking is instant). Socket.IO keeps Versus rooms and study tables in sync; the server owns timers, answers and scores. |
| Storage | SQLite (`node:sqlite`) | Accounts, sessions, Elo, match history, study progress, courses, submissions and the audit log. |
| Lecture search | BM25 keyword search over transcript windows (`video-pull-up/`) | The default search. Runs locally, needs no API key, returns the original cue timestamps. |
| Chapter index and Q&A | Python 3, OpenAI API (`qa/`) | Splits each lecture into titled chapters once, then answers questions in two steps: pick candidate chapters, then pick the exact transcript line. The model only ever chooses among IDs it was given, so every timestamp comes from the transcript itself. Optional; falls back to local search. |
| Reader | PDF.js (vendored), Python service (`translation/`) | Rendering, selection translation (cached per paragraph) and page-referenced book Q&A. |
| Java execution | Judge0 (external, optional) | Runs submitted Java against test cases in an isolated executor. Not part of this repository. |
| Email | Nodemailer over SMTP | Verification and password-reset codes. |
| Deployment | Docker, Docker Compose | A single container on port 8080 with SQLite on a persistent volume. |

The product name lives in one place, [shared/brand.json](shared/brand.json).

## Requirements

**To run it locally**

- Node.js 24 or newer, and npm
- Git LFS (for the lecture videos; without them, transcripts and chapters still work)
- A browser with WebGL (current Chrome, Firefox, Safari or Edge)

**Optional**

- Python 3.10+ for the model-backed Q&A, background indexing and the reader's
  translation service (Python 3.11 in the Docker image)
- An OpenAI API key for the same three features. Browsing, search, Versus and the
  study world work without one.
- SMTP credentials to send verification emails (for local work the code can be
  printed to the terminal instead)
- A Judge0 instance to run Java answers

**To deploy**

- A Linux VM with Docker and Docker Compose
- An HTTPS hostname in front of port 8080

## Run locally

```sh
git lfs install
git lfs pull
npm install
cp .env.example .env
```

Accounts are required by default. For local work, add one of these to `.env`:

```sh
AUTH_MAIL_TRANSPORT=console    # register normally; the code is printed in the terminal
AUTH_REQUIRE_VERIFIED=false    # or skip accounts entirely (front-end work only, never in production)
```

Then start the server and the frontend together:

```sh
npm run dev
```

Open http://localhost:5173. The API runs on port 3001 and is proxied by Vite. The
root scripts load `.env` automatically.

**Production build**

```sh
npm run build
npm start          # http://localhost:3001
```

Keep `lectures/`, `qa/data/` and `video-pull-up/` next to the build: videos are
streamed from where they are, not copied into `dist/`.

### Optional services

**Model-backed Q&A and indexing** (see [qa/README.md](qa/README.md)):

```sh
python3 -m venv .venv
.venv/bin/pip install -r qa/requirements.txt
cp qa/.env.example qa/.env      # set OPENAI_API_KEY, QA_INDEX_MODEL, QA_ANSWER_MODEL
```

Then set `LECTURE_QA_PROVIDER=python` in `.env`. Questions and lecture excerpts are
sent to the configured provider and may cost API credits. If it fails, the app
falls back to local search and says so.

**Reader translation and book Q&A** (see [translation/README.md](translation/README.md)):

```sh
cd translation
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env            # set OPENAI_API_KEY and TR_MODEL
.venv/bin/python -m viscon_translate serve     # port 8788
```

The PDF stays readable when this service is not running.

## Deploy

```sh
git lfs pull
cp .env.example .env
# Set APP_PUBLIC_URL, ALLOWED_ORIGINS, COOKIE_SECURE=true and the SMTP settings.
docker compose build app
docker compose up -d app
```

Compose binds `0.0.0.0:8080`, restarts unless stopped, and keeps SQLite and uploads
in a named volume. API keys stay on the server. For the Python features, build with
`DOCKER_TARGET=qa-runtime`.

- [docs/hackathon-deployment.md](docs/hackathon-deployment.md): full runbook, proxy trust settings and checks
- [docs/updating-the-server.md](docs/updating-the-server.md): pushing a change to the team VM

## Configuration

Every setting is documented in [.env.example](.env.example). The ones you are most
likely to touch:

| Variable | Purpose |
| --- | --- |
| `AUTH_REQUIRE_VERIFIED`, `AUTH_MAIL_TRANSPORT` | Account guard and how verification codes are delivered |
| `AUTH_SMTP_*`, `AUTH_MAIL_FROM` | Outgoing email |
| `AUTH_ADMINS` | ETH usernames with full admin rights |
| `LECTURE_QA_PROVIDER` | `local` (default) or `python` |
| `OPENAI_API_KEY`, `QA_INDEX_MODEL`, `QA_ANSWER_MODEL` | Model-backed Q&A and indexing |
| `INDEXING_MAX_PAID_RUNS` | Cap on paid indexing runs across all courses (default 50) |
| `JUDGE0_URL`, `JUDGE0_JAVA_LANGUAGE_ID` | Java execution |
| `APP_PUBLIC_URL`, `ALLOWED_ORIGINS`, `COOKIE_SECURE` | Public deployment |

## Tests

```sh
npm test           # server, accounts, admin, submissions, indexing and search
npm run build      # type check and production build
```

Browser tests drive two real sessions through a full Ranked match, lecture seeking,
bookmarks, reconnection and mobile layouts, using an installed Google Chrome:

```sh
python3 -m venv .venv
.venv/bin/pip install playwright
npm run test:ui
```

The Python components have their own tests: `cd qa && python -m pytest`.

## Repository layout

```
galaxy/          3D front page (plain JS + three.js)
web-interface/   lecture list view (/learn)
src/             Versus, study world and campus (React)
server/          Express + Socket.IO server, catalogue, rooms, Elo
shared/          code and design tokens shared by frontends and server
auth/            ETH accounts, sessions and the access guard
admin/           roles and course management
submissions/     student uploads and review
indexing/        background indexing of approved material
qa/              Python chapter index and lecture Q&A
video-pull-up/   local transcript search and media serving
translation/     PDF reader, translation and book Q&A service
questions/       Versus question banks (server only: they contain answers)
lectures/        DDCA recordings and transcripts (Git LFS)
tests/           server and browser tests
docs/            design notes, contracts and runbooks
```

## Further reading

- [docs/versus.md](docs/versus.md): Versus, the cockpit and the duel
- [docs/basis-arena.md](docs/basis-arena.md): match rules and rating
- [docs/question-contract.md](docs/question-contract.md): format for adding questions
- [galaxy/README.md](galaxy/README.md): how the galaxy is built
- [qa/docs/HOW-IT-WORKS.md](qa/docs/HOW-IT-WORKS.md): the Q&A pipeline in detail
- [docs/course-contributions.md](docs/course-contributions.md): rules for student-submitted courses
- [DESIGN.md](DESIGN.md): visual design system

## Credits

Made by a team of six students at ETH Zürich for the VIScon Hackathon.

Lecture recordings belong to their lecturers and ETH Zürich and are used for study
purposes. three.js, PDF.js and the vendored fonts (Chakra Petch, IBM Plex, Inter,
Manrope) keep their own open-source licences.

Parts of the code and documentation were written with the help of Claude Code
(Anthropic). Chapter indexes, automatic study notes and the optional Q&A and
translation features use OpenAI models at runtime, as described above.
