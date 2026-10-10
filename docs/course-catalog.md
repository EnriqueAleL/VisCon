# The course catalogue (what the lecture app shows)

Backend only. The lecture app (`/learn`) and its Q&A now serve **every published course**, not just the original DDCA recordings.

## What a course needs to appear

An **active** course (created by an admin, or a student proposal an admin approved) with at least one lecture that is **approved and indexed**
(`indexState = done`, see `indexing/README.md`). Removed, rejected, failed and still-queued lectures, other material types (slides, scripts) and
courses without lectures are not listed. Archiving a course hides it, with its media, at once.

## How it is built

- The original catalogue (24 DDCA lectures + the 3 demo courses) is loaded once, exactly as before (`server/lecture-catalog.ts`).
- Published courses are added on top by `server/course-catalog.ts`, one course at a time, from the database (which lectures are approved and indexed, with the
  titles students gave) and the course's folder under `COURSES_DIR` (index, transcript, video). Each lecture is validated on its own: a damaged
  transcript or a missing index entry **skips that lecture** (logged as `catalog: skipped ...`) and never breaks the catalogue.
- `server/catalog-store.ts` keeps it fresh without a restart. Every request compares a cheap fingerprint (two queries); only when something changed does it
  rebuild, and only the courses that changed, never twice at once. If a course cannot be loaded, it keeps its last good state and the others still update.
- DDCA keeps its ids (`lec7`). Submitted lectures get `<course id>-lec<N>` (for example `physics-lec3`, `computer-architecture-lec25`), so ids never collide.
  Lecture numbers 1-24 of DDCA stay reserved for the originals.

## What the browser receives

- `GET /api/lectures` has the **same shape as before** (the app loads it once and filters in the browser). It is serialised and gzip-compressed once per
  catalogue version (about 640 KB becomes about 130 KB) and revalidated with an `ETag`, so an unchanged list costs a `304` with no body. `?courseId=` still filters.
- `GET /api/lectures/:id` returns one lecture with its full transcript; `.../summary` returns a summary if one exists (generated automatically after indexing, from the chapter index only).
- **Videos are never part of any of this.** They are only links. A video is requested when someone presses play (`preload="metadata"`), and then in pieces:
  `Range` requests return `206` with just those bytes.
- `/api/courses` is the lecture app's course list. Course management lives under `/api/platform/` (see `admin/README.md`) so the two never collide.
  New courses carry no semester or degree, so the course picker lists them under **Aufzeichnungen**, next to DDCA.

## Media of published courses (`/media/courses/<course>/...`)

Behind the same login as all of `/media`. Only exact names, only for an approved, indexed lecture of an active course, otherwise `404`:
`lectures/lec<N>.(mp4|webm|mov|mkv)`, `captions/lec<N>.vtt` (generated as WebVTT from the transcript, which may be SRT, so the browser's `<track>` works),
`chapters/lec<N>.chapters.vtt`. Requests beyond the end of a file answer `416`.

## Q&A

- `LECTURE_QA_PROVIDER=local` (default): the lexical transcript search now covers all published lectures; a course filter keeps it inside that course.
- `LECTURE_QA_PROVIDER=python`: the question goes to the Python tool pointed at **that course's own index** (`QA_LECTURES_DIR`, `QA_INDEX_PATH`), so the model only
  sees that course's chapters. For DDCA the submitted lectures are added to the originals (`QA_EXTRA_INDEX_PATH`, `QA_EXTRA_LECTURES_DIR`).
  No course chosen still means the original recordings. If the model service fails, the student gets the local search instead.
- The Python process receives only the variables it needs (never SMTP passwords or cookie settings).

## Not done yet

- The **study world** (map, recall questions, visualizers) is still DDCA-only and hand-authored.
- Slides and scripts are extracted but not used in answers.
- No semester, degree or year for new courses (so they all sit under *Aufzeichnungen*), no lecturer, date or thumbnail.
- Videos are served as uploaded: no lower-quality version for slow connections.

## The galaxy front page

`galaxy/` (on `main`) builds its planets, cities and houses from `/api/courses` and `/api/lectures`, so a published course shows up there with no extra work: course = planet (`color`, `shortName`), lecture = city (`episode`, `duration`), chapter = house (`title`, `start`, `end`, `summary`). A course with no lectures yet is hidden. The verified-account guard serves it at `/` and `/galaxy` (the sign-in page for everyone else); the study world is at `/world`.
