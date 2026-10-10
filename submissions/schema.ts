import { initAdminSchema } from '../admin/schema';

export const SUBMISSION_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY, courseId TEXT NOT NULL, submitter TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('lecture','slides','script')),
  title TEXT NOT NULL, number INTEGER, notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('draft','pending','approved','rejected','withdrawn','removed')),
  createdAt INTEGER NOT NULL, submittedAt INTEGER, reviewedBy TEXT, reviewedAt INTEGER, reviewNote TEXT,
  indexState TEXT NOT NULL DEFAULT 'none' CHECK (indexState IN ('none','queued','indexing','done','failed')));
CREATE INDEX IF NOT EXISTS submissions_course ON submissions (courseId, status);
CREATE INDEX IF NOT EXISTS submissions_submitter ON submissions (submitter, createdAt);
CREATE TABLE IF NOT EXISTS submission_files (
  submissionId TEXT NOT NULL, slot TEXT NOT NULL, size INTEGER NOT NULL, sha256 TEXT NOT NULL,
  originalName TEXT NOT NULL, mime TEXT NOT NULL, ext TEXT NOT NULL, createdAt INTEGER NOT NULL,
  PRIMARY KEY (submissionId, slot));
CREATE INDEX IF NOT EXISTS submission_files_hash ON submission_files (sha256);
`;

export function initSubmissionSchema(db: Parameters<typeof initAdminSchema>[0]) {
  initAdminSchema(db);
  db.exec(SUBMISSION_SCHEMA_SQL);
}
