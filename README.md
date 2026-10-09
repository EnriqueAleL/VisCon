# VisCon + Basis Arena

One local app for finding moments in lecture videos and practising with friends.
The shared server serves both frontends and preserves the existing player profiles,
rooms, Elo ratings, question bank, and match history.

## Run everything

Use Node.js 24 or newer. From the repository root:

```sh
git lfs install
git lfs pull
npm install
npm run dev
```

- **Basis Arena:** http://localhost:5173/ — rooms, practice, quizzes, numeric answers, Java editor, Elo and history.
- **VisCon:** http://localhost:5173/learn — course picker, chat, lecture library, native video, chapters, transcripts, bookmarks and available study notes.

Use **Lectures** in Arena or the **Arena** icon in VisCon to switch. Leaving an
active Arena room through this link asks for confirmation. Both pages use the
same origin, player cookie and backend; existing `/room/:id` invitation links work.

The latest VisCon icon sidebar, hover menus and year → semester → study-year →
course selection are retained. The 24 imported Digital Design and Computer
Architecture recordings appear under **Aufzeichnungen**, since their index does
not supply verified year/semester/study-year metadata. Three short playable demos
are available under **2026 → Herbstsemester → Bachelor (BSc), 1. Studienjahr**.
Demo content is labelled separately from the recordings.

For a production build:

```sh
npm run build
npm start
```

Open http://localhost:3001/ or http://localhost:3001/learn. Keep `lectures/`,
`qa/data/`, and `video-pull-up/` alongside the build; the large videos are streamed
from their original locations, with byte-range seeking, rather than copied into
`dist/`. Missing LFS video files leave their transcripts and chapters readable.

## Connected components

| Component | Integration |
| --- | --- |
| `src/`, `server/`, `shared/` | Existing Basis Arena, Socket.IO and SQLite |
| `web-interface/` | Latest course picker and icon sidebar, now connected to real APIs |
| `video-pull-up/` | Shared retrieval, cited transcript answers, player seeking and playable demos |
| `lectures/` | 24 recordings and their original WebVTT transcripts |
| `qa/data/index.json` | Chapter titles, summaries, timestamps and search metadata |
| `qa/data/summaries/` | Cached study notes, shown when available |
| `qa/viscon_qa/` | Optional model-based Q&A provider; existing CLI remains available |

The root `npm install`, `npm run dev`, and `npm run build` are sufficient for the
combined app. The frontend pages have separate CSS entry points so both existing
designs are preserved. The backend API and media routes are proxied in development
and served on the same origin in production.

## Search and optional Q&A

Search works immediately without API keys. It uses the existing video-pull-up
lexical retriever over real transcript windows and returns original cue timestamps.
This is keyword search, not semantic model inference: a more specific term may be
needed, and insufficient context or no match is shown explicitly.

To opt into the existing Python two-stage Q&A pipeline:

```sh
python3 -m venv .venv
.venv/bin/pip install -r qa/requirements.txt
cp qa/.env.example qa/.env
# Configure OPENAI_API_KEY and QA_INDEX_MODEL / QA_ANSWER_MODEL in qa/.env.
LECTURE_QA_PROVIDER=python npm run dev
```

This mode sends the question and lecture context to the configured provider and
can incur API charges. Its result is mapped into the same cited video response.
If it is unavailable, the UI explicitly falls back to local transcript search.
`QA_PYTHON` can select a separate Python environment. `OLLAMA_MODEL` optionally
enables the video-pull-up local explanation provider instead. No keys are sent to
the frontend, and no model is called just to browse courses or cached notes.

Environment variables can be exported in the shell or loaded with Node's
`--env-file`; the root server does not implicitly read `.env`. See `.env.example`.
The Python component retains its own `qa/.env` loading.

## Verification

```sh
npm test
npm run build
python3 -m venv .venv
.venv/bin/pip install playwright
npm run test:ui
```

The browser suite uses installed Google Chrome and starts an isolated server with
a temporary SQLite database. It tests both the latest lecture UI and the existing
two-player Ranked match flow, including timestamp seeking, bookmarks, scoped chat
history, stale request cancellation, video range requests, navigation, Elo,
reconnection, and desktop/mobile layouts. Reports and screenshots are written to
`.impeccable/review/`. `TEST_URL` can target an already running shared server.

Arena still uses its separate, explicitly labelled demonstration question bank.
Lecture transcripts are not automatically converted into verified match questions.
Java execution still needs the configured isolated Judge0 service.

See [Arena documentation](docs/basis-arena.md), [question import contract](docs/question-contract.md),
[Q&A documentation](qa/README.md), and [integration notes](docs/integration.md).
