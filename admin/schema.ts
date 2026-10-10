import { initAuthSchema } from '../auth/schema';

export const ADMIN_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('proposed','active','archived')),
  proposedBy TEXT, createdBy TEXT NOT NULL, createdAt INTEGER NOT NULL, approvedBy TEXT, approvedAt INTEGER);
CREATE TABLE IF NOT EXISTS course_admins (
  courseId TEXT NOT NULL, username TEXT NOT NULL, grantedBy TEXT NOT NULL, grantedAt INTEGER NOT NULL,
  PRIMARY KEY (courseId, username));
CREATE INDEX IF NOT EXISTS course_admins_user ON course_admins (username);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT, detail TEXT);
`;

type Db = Parameters<typeof initAuthSchema>[0];

/** Roles live on accounts (`role`), courses and their admins in their own tables. DDCA is course #1 from the start. */
export function initAdminSchema(db: Db) {
  initAuthSchema(db);
  db.exec(ADMIN_SCHEMA_SQL);
  const columns = (db.prepare('PRAGMA table_info(accounts)').all() as { name: string }[]).map(c => c.name);
  if (!columns.includes('role')) db.exec("ALTER TABLE accounts ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
  const now = Math.floor(Date.now() / 1000);
  db.exec(`INSERT OR IGNORE INTO courses (id,name,description,status,createdBy,createdAt,approvedBy,approvedAt) VALUES
    ('computer-architecture','Digital Design & Computer Architecture','The 24 recorded lectures of the course.','active','system',${now},'system',${now})`);
}
