# PolyCosmos

**A big year. A little universe.**

PolyCosmos is a study space for ETH's first year. Every course becomes a planet,
every lecture a city on it, and every topic a house you can walk into. Inside, the
recording opens at the exact moment the topic starts, with a short summary and a
chat that knows the lecture. When you want to check what stuck, board the ship and
challenge a friend to a quiz duel.

Built by team **The Mania** at the VIScon Hackathon 2026 (Study & Learning track).
Live at https://10.hackathon.ethz.ch.

## The problem

ETH students spend three to four months of every year studying for exams, and the
Basisjahr is where that pressure first lands: new people, new subjects, and a lot to
take in at once.

A surprising amount of that time goes into *finding* things rather than learning
them. You sit down with an exercise sheet, and one question sends you back to a
lecture. You remember the professor explaining it, but was that last Tuesday or the
week before? Each course is spread across dozens of hour-long recordings, a script,
slides and exercise sheets, none of them connected. A few open tabs later, you are
still looking for the explanation you came for. Revision is mostly solitary, and
there is little feedback on what you actually know until the exam.

PolyCosmos gives the semester a shape:

- **See the whole course at once.** Each lecture is broken into chapters, laid out
  as a city. Taller houses are longer chapters. You can start a study session with
  a single house.
- **Jump to the moment, not the video.** Ask in plain words and get the lecture and
  timestamp where it was explained, with the source shown. If nothing matches, it
  says so instead of inventing an answer.
- **Ask the question that feels too basic to say out loud.** A chat beside the video
  uses the lecture transcript as context, so follow-ups stay grounded in the
  material.
- **Read the script in your language.** Select any passage to translate it, or ask
  about the book and get a page reference.
- **Revise with someone.** Real-time quiz duels with friends, ranked matches with
  Elo, or a practice bot.

## Built for every course

PolyCosmos is not tied to one subject. The galaxy, lecture view, search and chat
are all generated from whatever courses the server has. Nothing about a specific
course is hard-coded:

- A course appears as a planet as soon as it has one indexed lecture.
- Courses are organised by department, degree and study year, so each student
  starts from their own programme.
- Any verified student can propose a new course and submit lecture transcripts,
  videos, slides or scripts. Admins and course admins review submissions; approved
  lectures are split into chapters in the background and appear in the galaxy
  automatically. (The backend for this is complete; the submission screens are
  still to come.)

### What the demo ships with

To show the whole experience end to end, the demo is loaded with one complete course
and pieces of others:

| Content | Course | Notes |
| --- | --- | --- |
| 24 lecture recordings with transcripts and 500+ chapters | Digital Design and Computer Architecture (DDCA) | The fully loaded demo course: every feature works on it. Videos are stored with Git LFS. |
| A full textbook in the reader, with translation and Q&A | Theoretical Computer Science | `translation/ti_book.pdf` |
| 120 Versus quiz questions, 30 per subject | Discrete Mathematics, Linear Algebra, Introduction to Programming, DDCA | Written by the team as practice, not official ETH exam questions |
| Study world (recall, visualizers, mock exams) | DDCA | A hand-built prototype of what each course could get |
| Three short demo videos | Linear Algebra, Analysis, Informatics | Self-made, labelled as demos, for testing the player |

## What's in it

| Page | URL | What it does |
| --- | --- | --- |
| **Galaxy** | `/` | The front page. Courses are planets; land on one to see its lecture cities, then walk among the chapter houses. Open a house and the recording plays from that chapter. The city's weather shows how hard students found the lecture, and crowds show who else is studying there. Also holds the question box, the lecture chat, course documents and the Versus ship. |
| **Lectures** | `/learn` | The same courses as a list, for when you just want to get to a lecture: department → degree and study year → course → lecture. Video with chapters, transcript, bookmarks, watched-chapter tracking, study notes and the lecture chat. |
| **Versus** | `/arena`, `/room/:id` | Real-time 1v1 quiz duels with invitation links. Multiple-choice, numeric and Java questions; Ranked (Elo) or Friendly; a practice bot. Played from a 3D cockpit where correct answers fire on the opponent's ship. Score alone decides the winner. |
| **Reader** | in the galaxy and list views | A PDF reader for course scripts: selectable text, translation of any selection, and questions about the book answered with a page number. |
| **Study world** | `/world` | Recall with spaced review, daily expeditions, pipeline, cache and virtual-memory visualizers, timed mock exams, puzzles and shared study tables. Currently DDCA only. |
| **Campus** | `/campus` | A satellite journey down to ETH Zürich. |

The interface is in English, with a German translation selectable from the account
menu.

**Access.** Registration uses an ETH username and password, confirmed by a one-time
code sent to the student's `@student.ethz.ch` mailbox. Until then the server sends
nothing about the courses, not even the app's own scripts.

**Difficulty weather.** Students rate each chapter from 1 to 5 after watching. Where
there are quiz answers for the same chapter, their mistake rate counts as extra
evidence. The combined score turns the city's sky sunny, fair, overcast or stormy,
and planet labels show a matching badge so the hard lectures stand out before you
land.

## How it works

| Part | Built with | Used for |
| --- | --- | --- |
| Galaxy | Plain JavaScript, three.js (vendored), WebGL | The 3D course map, lecture cities, weather, cockpit and duel scenes. No build step; served as-is. |
| Lectures, Versus, Study world, Campus | React 19, TypeScript, Vite | The application pages. CodeMirror for the Java editor, KaTeX for formulas, MapLibre GL for the campus map, Lucide for icons. |
| Server | Node.js 24, Express 5, Socket.IO | One process serves every page, the API and the video files (with byte ranges, so seeking is instant). Socket.IO keeps duels, study tables and live crowds in sync; the server owns timers, answers and scores. |
| Storage | SQLite (`node:sqlite`) | Accounts, sessions, Elo, match history, study progress, ratings, courses, submissions and the audit log. |
| Lecture search | BM25 keyword search over transcript windows (`video-pull-up/`) | The default search. Runs locally, needs no API key, returns the original cue timestamps. |
| Chapters, Q&A and chat | Python 3, OpenAI-compatible API (`qa/`) | Splits each lecture into titled chapters once, then answers questions in two steps: pick candidate chapters, then pick the exact transcript line. The model only ever chooses among IDs it was given, so every timestamp comes from the transcript itself. Optional; falls back to local search. |
| Background indexing | Node worker + `qa/` (`indexing/`) | Turns approved student submissions into chapter indexes, one job at a time, with retries and a shared spending cap. |
| Reader | PDF.js (vendored), Python service (`translation/`) | Rendering, selection translation (cached per paragraph) and page-referenced book Q&A. |
| Java execution | Judge0 (external, optional) | Runs submitted Java against test cases in an isolated executor. Not part of this repository. |
| Email | Nodemailer over SMTP | Verification and password-reset codes. |
| Deployment | Docker, Docker Compose | A single container on port 8080 with SQLite and uploads on a persistent volume. |

The product name lives in one place, [shared/brand.json](shared/brand.json).

## Technical difficulties we faced

**Six people pushing to one branch.** All six of us worked on `main` at the same
time, often in the same files. On day one this cost us: overlapping edits to the
galaxy and the server, merge conflicts, and changes that undid each other. On day
two we adapted. Everyone pulled before starting and before committing, kept commits
small and focused, put new features in new files instead of growing the shared
ones, owned a clear area (galaxy, Versus, Q&A, accounts, deployment), and nobody
ever force-pushed. A written runbook ([docs/updating-the-server.md](docs/updating-the-server.md))
made deploying something anyone could do safely.

**Joining separately built pieces into one app.** The quiz game, the lecture viewer,
the transcript search, the Q&A pipeline, the reader and the galaxy started as
separate projects with their own servers. They now share one Node server, one
origin, one session cookie and one account guard. The galaxy is plain JavaScript
outside the bundler (Vite wrapped its stylesheet as a JS module and left it
unstyled), and both React apps had to be forced onto a single copy of React.

**A planet and a street in one scene.** A planet's surface and a city street are
about four orders of magnitude apart in size, enough to cause visible floating-point
jitter. Landing therefore swaps to a second scene, hidden inside a warp effect, so
the cut reads as the landing itself.

**Stopping the model from inventing timestamps.** Asking a language model "when was
this explained?" invites confident, wrong times. The Q&A pipeline only lets the
model choose from chapter IDs and transcript line labels that were in its prompt;
anything else is rejected, and every timestamp shown is read from the transcript.
The reader works the same way for page numbers, and checks that a batch translation
returns exactly as many paragraphs as it was given.

**A small API budget.** The hackathon provides a limited model budget. Search works
with no model at all, chapter indexes and study notes are computed once and cached,
translations are cached per paragraph, and background indexing has a hard cap on
paid runs shared across every course.

**Large files.** Lecture videos are several gigabytes in total. They live in Git LFS,
are streamed with byte ranges rather than copied into the build, and uploads are
written to disk while being hashed, so a 400 MB upload moved server memory by only
about 37 MB.

**Running behind the hackathon proxy.** Every request reached the VM from the
proxy's address, so login and email rate limits had to read the real client IP from
a header. Identity headers from the proxy are only trusted from known proxy
addresses. The proxy also doesn't support WebSocket-only connections, so Socket.IO
keeps its polling fallback.

**Keeping course material private.** The whole frontend, not just the API, is behind
the account check, so nothing about the courses leaves the server before a student
verifies their ETH address. A review before launch found a way to activate someone
else's pending registration; confirmation now has to come from the browser that
registered.

## Future improvements

- **More Basisjahr courses with real material.** The pipeline is ready; the next step
  is filling the other planets with their recordings and scripts.
- **Submission and review screens**, so students and course admins can use the
  contribution backend without the API.
- **Slides and scripts in answers.** Match slides to lecture chapters, cite them
  ("Lecture 7 @ 29:53, slide 23"), and use their text to correct formulas and terms
  that speech recognition got wrong.
- **A study world for every course**, generated from each course's chapters instead
  of hand-built for DDCA.
- **Semantic search**, so a question phrased differently from the lecture still
  finds it. The current keyword search can miss those.
- **Questions from the lectures**, reviewed before use, so every course gets a Versus
  bank and recall practice.
- **A measured Q&A**: a test set of questions with known answers and timestamps, to
  track accuracy as the pipeline changes.
- **Lighter video** for slow connections, and lecture dates, lecturers and thumbnails
  in the catalogue.
- **A hosted Java judge**, so code questions run in every deployment.

## Requirements

**To run it locally**

- Node.js 24 or newer, and npm
- Git LFS (for the lecture videos; without them, transcripts and chapters still work)
- A browser with WebGL (current Chrome, Firefox, Safari or Edge)

**Optional**

- Python 3.10+ for model-backed Q&A, the lecture chat, background indexing and the
  reader's translation service (Python 3.11 in the Docker image)
- An API key for an OpenAI-compatible endpoint for the same features. Browsing,
  search, Versus and the study world work without one.
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

**Model-backed Q&A, chat and indexing** (see [qa/README.md](qa/README.md)):

```sh
python3 -m venv .venv
.venv/bin/pip install -r qa/requirements.txt
cp qa/.env.example qa/.env      # set OPENAI_API_KEY, QA_INDEX_MODEL, QA_ANSWER_MODEL
```

Then set `LECTURE_QA_PROVIDER=python` in `.env`. `OPENAI_BASE_URL` points it at any
OpenAI-compatible endpoint. Questions and lecture excerpts are sent to that provider
and may cost API credits. If it fails, the app falls back to local search and says
so.

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
| `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `QA_INDEX_MODEL`, `QA_ANSWER_MODEL` | Model-backed Q&A, chat and indexing |
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
server/          Express + Socket.IO server, catalogue, rooms, Elo, live crowds
shared/          code and design tokens shared by frontends and server
auth/            ETH accounts, sessions and the access guard
admin/           roles and course management
submissions/     student uploads and review
indexing/        background indexing of approved material
qa/              Python chapter index, lecture Q&A and chat
video-pull-up/   local transcript search and media serving
translation/     PDF reader, translation and book Q&A service
questions/       Versus question banks (server only: they contain answers)
lectures/        DDCA demo recordings and transcripts (Git LFS)
tests/           server and browser tests
docs/            design notes, contracts and runbooks
```

## Further reading

- [docs/course-catalog.md](docs/course-catalog.md): how courses reach the galaxy and lecture view
- [docs/course-contributions.md](docs/course-contributions.md): rules for student-submitted courses
- [docs/versus.md](docs/versus.md): Versus, the cockpit and the duel
- [docs/basis-arena.md](docs/basis-arena.md): match rules and rating
- [docs/question-contract.md](docs/question-contract.md): format for adding questions
- [galaxy/README.md](galaxy/README.md): how the galaxy is built
- [qa/docs/HOW-IT-WORKS.md](qa/docs/HOW-IT-WORKS.md): the Q&A pipeline in detail
- [DESIGN.md](DESIGN.md): visual design system

## Team and credits

**The Mania:** Enrique Luca, Hayk Serobyan, Matei Chiriac, Rares Iordache, Timofei
Seleznev and Tudor Musat. Mentored by Maria Farelo, with Micha Greutmann as
stakeholder.

Lecture recordings belong to their lecturers and ETH Zürich and are used for study
purposes. three.js, PDF.js and the vendored fonts (Chakra Petch, IBM Plex, Inter,
Manrope) keep their own open-source licences.

Parts of the code and documentation were written with the help of Claude Code
(Anthropic). Chapter indexes, study notes, the lecture chat and the optional Q&A and
translation features call a language model at runtime, as described above.
