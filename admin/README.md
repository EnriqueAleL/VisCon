# Admins, course admins and courses

Backend only. Material submission, review and indexing come later (see `docs/course-contributions.md`).

## Roles

| Role | Who | Can |
|---|---|---|
| **Admin** | ETH usernames in `AUTH_ADMINS` (set on the server, default `riordache`), plus anyone an admin appoints | everything below, plus appointing and removing admins and course admins, blocking accounts, reading the audit log |
| **Course admin** | appointed per course by an admin, or automatically the student who proposed that course | edit that course's name and description (more once material review exists). Nothing for other courses |
| **Student** | any verified account | list active courses, propose a course |

Powers are re-read on every request and need a *verified* account, so a blocked, expired or deleted account loses them at once.
Admins set through `AUTH_ADMINS` cannot be removed or blocked from the app, and nobody can remove or block themselves, so
the platform can never be left without an admin.

## Courses

`proposed` (hidden except from its proposer, its course admins and admins) -> `active` -> `archived` (hidden from students).
DDCA exists from the start as `computer-architecture`. A student proposal creates the course as `proposed` and makes the proposer
its course admin immediately; an admin approves or rejects it (rejecting deletes it). Limits: 3 proposals waiting and 5 per day per
student. Names are 3-80 characters; the id is a slug of the name and never changes.

## API (all need a verified login; all JSON)

Students: `GET /api/me/roles`, `GET /api/courses`, `GET /api/courses/:id`, `POST /api/courses/propose {name, description}`,
`PATCH /api/courses/:id {name?, description?}` (admins and that course's admins).

Admins:

```
GET    /api/admin/admins                       POST /api/admin/admins {username}      DELETE /api/admin/admins/:username
POST   /api/admin/courses {name, description}  POST /api/admin/courses/:id/approve | archive | unarchive
DELETE /api/admin/courses/:id                  (reject a proposal)
POST   /api/admin/courses/:id/admins {username}   DELETE /api/admin/courses/:id/admins/:username
GET    /api/admin/accounts                     POST /api/admin/accounts/:username/revoke | restore
GET    /api/admin/audit?limit=100
```

Errors are `{error, code}` with 403 `forbidden`, 404 `not_found`, 400 `invalid_input`, 409 `conflict`, 429 `rate_limited`.
Appointing someone requires that they already have an account. Every change is written to `audit_log` (who, what, which course or user).

## Where it lives

`schema.ts` (tables; also upgrades older databases and seeds DDCA), `service.ts` (all rules, no HTTP), `routes.ts`,
`errors.ts`. Roles are a `role` column on `accounts`; seats are in `course_admins`. Not wired to the existing lecture catalog yet:
`server/lecture-catalog.ts` still hardcodes the DDCA course.
