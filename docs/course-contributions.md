# Course contributions: decisions so far

Roles, courses and course admins are built (see `admin/README.md`). Material submission, review and indexing are not built yet. This records what the team decided.

## Roles
- **Admin**: creates courses, other admins and course admins, and can review anything. The first admin is `riordache`
  (to be configured on the server, not through the app, so nobody can promote themselves).
- **Course admin**: scoped to specific courses; reviews material for those courses only.
- **User**: any verified ETH student.

## Rules
1. Any verified student can propose material for a course, or propose a new course. Whoever proposes a new course becomes its
   course admin directly.
2. Transcripts come from the web (the submitter provides the `.vtt`/`.srt`); the server does no transcription.
3. Every verified student sees every approved course. Enrolment cannot be verified, so it is not checked.
4. Hosting student-submitted material is allowed (decided by the team).
5. A submission is not visible until an admin or that course's admin accepts it; acceptance triggers indexing with `qa/`.
6. Material types for now: lecture video + transcript, lecture slides, course script.

## Open points for later
- Done: a proposed course is hidden until an admin approves it, although its proposer is its course admin straight away.
- A submitter should not approve their own submission; if a course has one course admin, an admin reviews theirs.
- Uploads need size and type limits, per-user quotas, storage outside the web folder and outside git, and an admin action
  to unpublish or delete.
- `qa/` is single-course today (flat `lectures/lecN.*`, one `index.json`); it needs per-course folders and indexes, a background
  indexing job, and the Python image variant on the VM. Slides and scripts need a new text-extraction step.
