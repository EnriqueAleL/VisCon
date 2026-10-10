# Shared frontend integration

Baseline: `ce8e44b` (course selection and hover navigation). Basis Arena remains at
`/`, including its existing `/room/:id`, `/profile`, `/history`, `/leaderboard` and
`/java` routes. The imported VisCon interface is at `/learn` with `#questions`,
`#library` and `#saved` state. Its Arena icon links to the working Arena app.

Vite builds `index.html` and `learn.html` together. Both entries share the local
Inter fonts, semantic tokens, base styles, and product header in `shared/design/`.
Page-specific styles handle layout; [DESIGN.md](../DESIGN.md) is the visual contract.
The preserved satellite scene is available at `/campus`.
In development, `/learn` maps to `learn.html`; `/api`, `/media` and
`/socket.io` reach the shared server. Production Express serves both HTML entries.

`server/lecture-catalog.ts` joins the Q&A index to the original VTT files at startup.
Chapter boundaries are kept unchanged; video-pull-up supplies transcript parsing,
retrieval windows, question validation, lexical scoring, citation shapes and player
seeking. The library response omits transcript bodies; opening a lecture fetches
its full transcript. Restart the server after importing/reindexing lecture data.

| Route | Response |
| --- | --- |
| `GET /api/courses` | Available courses: the original recordings, the labelled demos and every published course (see [course-catalog.md](course-catalog.md)) |
| `GET /api/lectures?courseId=...` | Library metadata, chapter outlines and segment IDs |
| `GET /api/lectures/:id` | One lecture with complete transcript windows |
| `GET /api/lectures/:id/summary` | Cached notes, or `summary: null` |
| `POST /api/ask` or `/api/search` | Cited answer, source timestamps and matching video segments |
| `GET /media/lectures/lecN.mp4` | Original recording; Range and HEAD supported |
| `GET /media/lectures/lecN.vtt` | Original captions |
| `GET /media/chapters/lecN.chapters.vtt` | Q&A chapter track |
| `GET /media/*.mp4` | Existing short video-pull-up demos |

Search accepts `{question, courseId?, lectureId?, limit?}`. Course changes cancel
pending requests and close the previous player. Restoring a chat restores its
course selection and reruns the request. Bookmarks retain their segment ID and the
exact selected timestamp. Course selection, bookmarks and history stay in local
browser storage; the Arena player identity continues to use its HTTP-only cookie.

No recording date or study programme is guessed. Recordings without those fields
appear under **Aufzeichnungen → Digital Design & Computer Architecture**. The
existing year/semester/study-year picker remains available for dated demo content.

`LECTURE_QA_PROVIDER=python` runs `python -m viscon_qa.web` with JSON on stdin, using
the existing two-stage question-answering module and respecting lecture scope.
Processes have a two-minute timeout, output limits, cancellation and a two-request
concurrency cap. Absolute video paths are removed; the server validates timestamps
and substitutes same-origin media URLs. Provider failure is reported as an explicit
transcript fallback. This optional external provider needs its own credentials and
Python dependencies; local search and cached notes do not.

The original standalone video-pull-up demo remains runnable on its own. The former
static eight-lecture frontend fixtures remain in `web-interface/src/data/lectures.ts`
for reference; the connected UI imports its data from the API. The shared question
bank is unchanged and is not populated with unverified generated lecture questions.
