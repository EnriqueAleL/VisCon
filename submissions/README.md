# Material submissions and review

Backend only. A verified student submits lecture material to an active course; an administrator or that course's admin
reviews it. Approved material is published and indexed in the background: see [`../indexing/README.md`](../indexing/README.md).

## What can be submitted

| Type | Files (slot) | Also needs |
|---|---|---|
| `lecture` | `transcript` (.vtt or .srt, required), `video` (mp4, mov or webm, optional) | lecture number 1-999 |
| `slides` | `slides` (PDF) | optional lecture number |
| `script` | `script` (PDF) | nothing |

Transcripts come from the web (the student supplies them); the server never transcribes.

## Flow

1. `POST /api/courses/:id/submissions {type, title, number?, notes?}` creates a **draft** (course must be `active`).
2. `PUT /api/submissions/:id/files/:slot` uploads one file as the raw request body: `Content-Type: application/octet-stream`,
   a `Content-Length` (required), optional `X-Filename`. Replace a file by uploading the slot again.
3. `POST /api/submissions/:id/submit` -> **pending**. Needs every required file, a lecture number that is not already
   approved in the course, and files not already submitted for the course (checked by SHA-256).
4. A reviewer approves (`POST .../approve {note?}`) or rejects (`POST .../reject {note}`, a reason is required). The submitter can
   `POST .../withdraw` while it is a draft or pending.
5. An administrator can later take approved material down: `POST /api/admin/submissions/:id/remove {reason}`.

Status: `draft -> pending -> approved | rejected | withdrawn`, and `approved -> removed`. Rejected, withdrawn and removed submissions lose their
files (the record and the reason stay). Drafts nobody finishes within 24 hours are purged hourly.

Reading: `GET /api/me/submissions`, `GET /api/submissions/:id` (submitter or reviewer), `GET /api/courses/:id/submissions?status=pending`
(reviewers; also `approved|rejected|withdrawn|removed`), `GET /api/submissions/:id/files/:slot` (download, always as an attachment).

## Who may do what

- **Submit, upload, withdraw:** only the submitter. Any verified student can submit to any active course.
- **See a submission and download its files:** the submitter, and reviewers once it is no longer a draft. Other students cannot; nobody sees another person's draft.
- **Review:** administrators, and the admins of *that* course. A course admin cannot review their own submission
  (another course admin or an administrator must); an administrator can, since there is nobody above them.
- **Remove approved material:** administrators only. Review actions are written to the audit log.

## Safety

- Files are recognised from their own first bytes (PDF `%PDF-`, MP4/MOV `ftyp`, WebM EBML, WebVTT `WEBVTT`, SRT cue lines); names and
  declared types are never trusted. A transcript needs at least 3 timestamped cues. The wrong kind of file is refused with 415 as soon
  as the first bytes arrive; an oversized one with 413 before the body is read when `Content-Length` already exceeds the limit.
- Bytes stream to disk while being counted and hashed, so memory stays flat (a 400 MB upload moved the server's memory by about 37 MB).
  A cut-off upload removes its partial file. The server accepts a request for up to 30 minutes.
- Stored under `UPLOADS_DIR` (default `.data/uploads`, on the persistent volume in Docker) as `<submission id>/<slot>.<ext>`. Every path is built
  from a server-generated id, a fixed slot name and a sniffed extension: no user text reaches the file system. Nothing is served statically.
  Downloads are `Content-Disposition: attachment` with `nosniff` and a sandboxing CSP.
- Limits (environment, MB): `UPLOAD_MAX_VIDEO_MB` 2000, `UPLOAD_MAX_PDF_MB` 100, `UPLOAD_MAX_TRANSCRIPT_MB` 5, per student per day
  `UPLOAD_MAX_USER_DAY_MB` 4000, whole platform `UPLOAD_MAX_TOTAL_MB` 30000, and `UPLOAD_MAX_PENDING_PER_USER` 5 drafts or pending items.
  Creating more than 20 submissions an hour is refused.
- Never put uploaded files in git: they are course material of third parties (see `docs/course-contributions.md`).

## Not done yet

- The **indexer**: approved items stay `queued`. It needs per-course folders for `qa/`, a background job and the Python image.
- **No screens** (submit form, review queue).
- Replacing an already approved lecture means an administrator removes it first.
- The managed hackathon proxy may limit request body sizes or time; test a large upload through it early.
