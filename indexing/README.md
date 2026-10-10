# Indexing approved material

Backend only. When an administrator (or the course's admin) approves a submission, it is **published** into its course's own folder and
**indexed in the background**, one item at a time, with the Python tool in `qa/`.

| Material | What happens | Model calls |
|---|---|---|
| lecture (transcript + optional video) | files copied to `lectures/lec<N>.vtt\|srt` and `.mp4`, then `python -m viscon_qa index --lectures N --force` builds the chapter index and the chapter markers | one per lecture |
| slides, script (PDF) | PDF copied to `documents/<id>.pdf`, text extracted per page into `qa/documents/<id>.json` (`python -m viscon_qa extract`) | none |

## Where things live

```
COURSES_DIR (default .data/courses)/<course id>/
  lectures/lec7.vtt, lec7.mp4         published material (hard links to the stored uploads: no extra disk)
  documents/<submission id>.pdf
  qa/index.json                       the chapter index of this course (same format as the original qa/data/index.json)
  qa/chapters/lec7.json, lec7.chapters.vtt
  qa/documents/<submission id>.json   {pages: [{page, text}], ...}
```

Each course is its own world: the tool is started with `QA_LECTURES_DIR` and `QA_INDEX_PATH` pointing at that course's folders, so
nothing in `qa/` had to change to support several courses. The original DDCA recordings (`lectures/`, `qa/data/`) are untouched; their lecture
numbers (1-24) cannot be taken by a submission.

## The worker

- States of an approved item: `queued -> indexing -> done | failed` (`indexError` holds a short, key-free reason).
- One job at a time, oldest approval first; a poll every `INDEXING_POLL_SECONDS` (5) plus an immediate nudge on approval.
- A failure that may be transient (network, rate limit, model hiccup, timeout) is retried with growing delays (1, 2 min...) up to `INDEXING_MAX_ATTEMPTS`
  (3). A file that can never work (a password-protected or image-only PDF) fails at once with a clear reason.
- **Shared budget:** all courses together get at most `INDEXING_MAX_PAID_RUNS` (50) paid lecture-indexing runs, counted in `indexing_runs`.
  Every attempt counts, retries and re-indexes included, because each one is billed. When it is used up, lectures wait, `reindex` of a lecture
  is refused, and `GET /api/courses/:id/index` says why; PDF extraction is free and goes on. Raise the setting and restart to continue.
- If the API key, model or Python packages are missing, lectures simply **wait** (they do not burn attempts) and `GET /api/courses/:id/index`
  says why; documents need no key and still run.
- After a crash or restart, items that were `indexing` are put back in the queue.
- Removing approved material (administrator) takes the lecture out of the index (`unindex`), deletes its chapter markers, summary and published files.
  Removing while a job runs is safe: the job's result is discarded and cleaned up.
- The Python process gets only the variables it needs (never SMTP passwords, cookie or database settings), runs in its own process group so a
  timeout stops everything it started (20 min per lecture, 5 min per PDF), and PDF extraction is limited to 2 GB of memory and 180 s of CPU.

## API (administrators and that course's admins)

- `GET /api/courses/:id/index`: whether lecture indexing and PDF extraction are ready (and why not), counts per state, and every approved item with its state.
- `POST /api/submissions/:id/reindex`: queue it again (after a failure, or to rebuild an index). Submissions also report `indexState`, `indexError` and `indexedAt`.

## Settings

`OPENAI_API_KEY` and `QA_INDEX_MODEL` (lectures), `QA_PYTHON` (interpreter with `qa/requirements.txt`), `COURSES_DIR`, `INDEXING_ENABLED`,
`INDEXING_MAX_ATTEMPTS`, `INDEXING_MAX_PAID_RUNS`, `INDEXING_POLL_SECONDS`. **Docker:** the default image has no Python; build with `DOCKER_TARGET=qa-runtime`.

## Tests

`service.test.ts` (queue, retries, recovery, permissions, removal, with a fake runner), `runner.test.ts` (environment isolation, timeouts, error
messages), `race.test.ts` (removal at every moment of a run), and `e2e.test.ts`, which runs the **real Python tool and the real OpenAI client**
against a local fake of the OpenAI API (`fake-openai.ts`); it skips itself unless Python with `qa/requirements.txt` is available
(`QA_PYTHON=/path/to/python npm test`). The Python side has its own tests in `qa/tests`.

## Not done yet

- **Nothing reads these indexes yet.** `server/lecture-catalog.ts`, the Q&A endpoints and the study world still only know the original DDCA data.
  The next step is a catalog that merges every course's `qa/index.json` and media, plus per-course Q&A (the tool already takes the folders from its
  environment) and a media route for published files.
- Slides and scripts are extracted but not used for answers or matched to lecture chapters (see `TODO.md`).
- Summaries are not generated automatically (still on demand via `qa summary`).
- If the server is killed while Python runs, that Python process may finish on its own; the job is re-queued on the next start.
