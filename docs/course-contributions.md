# Course contributions: decisions so far

Roles, courses and course admins are built (`admin/README.md`), material submission and review (`submissions/README.md`) and background indexing (`indexing/README.md`). and serving the indexed courses in the lecture app (`docs/course-catalog.md`). This records what the team decided.

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
- Done: a course admin cannot approve their own submission; an administrator reviews it (administrators can approve their own).
- Done: size and type limits, per-user quotas, storage outside the web folder, an admin action to remove approved material.
  Still to decide: keep uploaded files out of git for good (the repo already tracks the DDCA lectures).
- Done: per-course folders and indexes, the background job, PDF text extraction. Also done: a catalogue and Q&A that read every course's index. Still to do: the Python image on the VM, the study world for new courses,
  and using slides and scripts in answers.
