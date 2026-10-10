import type { DatabaseSync } from 'node:sqlite';
import { parseEthIdentifier } from '../auth/identifier';
import { AdminError } from './errors';

export type CourseStatus = 'proposed' | 'active' | 'archived';
export interface Course {
  id: string; name: string; description: string; status: CourseStatus;
  proposedBy: string | null; createdBy: string; createdAt: string; approvedBy: string | null; admins: string[];
}
export interface Roles { username: string; admin: boolean; rootAdmin: boolean; courseAdminOf: string[] }
export interface AdminOptions {
  /** Usernames that are always administrators; set on the server (AUTH_ADMINS), never changeable through the app. */
  rootAdmins: ReadonlySet<string>;
  clock?: () => number;
  maxPendingProposals?: number;
  maxProposalsPerDay?: number;
}

interface CourseRow { id: string; name: string; description: string; status: CourseStatus; proposedBy: string | null; createdBy: string; createdAt: number; approvedBy: string | null }
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} .,:&()'+\-/]{2,79}$/u;

export function slugify(name: string): string {
  return name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/g, '');
}

export function createAdminService(db: DatabaseSync, options: AdminOptions) {
  const clock = options.clock ?? Date.now;
  const now = () => Math.floor(clock() / 1000);
  const maxPending = options.maxPendingProposals ?? 3, maxPerDay = options.maxProposalsPerDay ?? 5;
  const forbidden = (message = 'You are not allowed to do this.') => new AdminError('forbidden', message);
  const username = (input: unknown) => {
    try { return parseEthIdentifier(input).username; } catch { throw new AdminError('invalid_input', 'Enter a valid ETH username.'); }
  };
  const accountExists = (name: string) => !!db.prepare('SELECT 1 FROM accounts WHERE username=?').get(name);
  const requireAccount = (name: string) => { if (!accountExists(name)) throw new AdminError('not_found', `${name} has no account on the platform yet.`); };

  // ---- roles
  const isRootAdmin = (name: string) => options.rootAdmins.has(name);
  const isAdmin = (name: string) => isRootAdmin(name) || (db.prepare("SELECT 1 FROM accounts WHERE username=? AND role='admin'").get(name) !== undefined);
  const courseAdminOf = (name: string) => (db.prepare('SELECT courseId FROM course_admins WHERE username=? ORDER BY courseId').all(name) as { courseId: string }[]).map(r => r.courseId);
  const rolesOf = (name: string): Roles => ({ username: name, admin: isAdmin(name), rootAdmin: isRootAdmin(name), courseAdminOf: courseAdminOf(name) });
  const requireAdmin = (actor: string) => { if (!isAdmin(actor)) throw forbidden('Only administrators can do this.'); };

  function audit(actor: string, action: string, target: string | null, detail?: Record<string, unknown>) {
    db.prepare('INSERT INTO audit_log (at,actor,action,target,detail) VALUES (?,?,?,?,?)').run(now(), actor, action, target, detail ? JSON.stringify(detail) : null);
  }
  const listAudit = (actor: string, limit = 100) => {
    requireAdmin(actor);
    return (db.prepare('SELECT id,at,actor,action,target,detail FROM audit_log ORDER BY id DESC LIMIT ?').all(Math.min(Math.max(1, Math.floor(limit) || 100), 500)) as { id: number; at: number; actor: string; action: string; target: string | null; detail: string | null }[])
      .map(r => ({ id: r.id, at: new Date(r.at * 1000).toISOString(), actor: r.actor, action: r.action, target: r.target, detail: r.detail ? JSON.parse(r.detail) : null }));
  };

  // ---- admins
  function listAdmins() {
    const stored = (db.prepare("SELECT username FROM accounts WHERE role='admin' ORDER BY username").all() as { username: string }[]).map(r => r.username);
    return [...new Set([...options.rootAdmins, ...stored])].sort().map(name => ({ username: name, root: isRootAdmin(name) }));
  }
  function grantAdmin(actor: string, target: unknown) {
    requireAdmin(actor);
    const name = username(target);
    requireAccount(name);
    if (isAdmin(name)) throw new AdminError('conflict', `${name} is already an administrator.`);
    db.prepare("UPDATE accounts SET role='admin' WHERE username=?").run(name);
    audit(actor, 'admin.grant', name);
    return rolesOf(name);
  }
  function revokeAdmin(actor: string, target: unknown) {
    requireAdmin(actor);
    const name = username(target);
    if (isRootAdmin(name)) throw forbidden('This administrator is set on the server and cannot be removed here.');
    if (name === actor) throw forbidden('You cannot remove your own administrator role.');
    if (!db.prepare("SELECT 1 FROM accounts WHERE username=? AND role='admin'").get(name)) throw new AdminError('not_found', `${name} is not an administrator.`);
    db.prepare("UPDATE accounts SET role='user' WHERE username=?").run(name);
    audit(actor, 'admin.revoke', name);
    return rolesOf(name);
  }

  // ---- courses
  const adminsOf = (courseId: string) => (db.prepare('SELECT username FROM course_admins WHERE courseId=? ORDER BY grantedAt, username').all(courseId) as { username: string }[]).map(r => r.username);
  const toCourse = (r: CourseRow): Course => ({ id: r.id, name: r.name, description: r.description, status: r.status, proposedBy: r.proposedBy, createdBy: r.createdBy, createdAt: new Date(r.createdAt * 1000).toISOString(), approvedBy: r.approvedBy, admins: adminsOf(r.id) });
  const row = (id: string) => db.prepare('SELECT * FROM courses WHERE id=?').get(id) as CourseRow | undefined;
  const mustFind = (id: unknown) => { const r = typeof id === 'string' ? row(id) : undefined; if (!r) throw new AdminError('not_found', 'There is no such course.'); return r; };
  const isCourseAdmin = (name: string, courseId: string) => db.prepare('SELECT 1 FROM course_admins WHERE courseId=? AND username=?').get(courseId, name) !== undefined;
  const canManage = (name: string, courseId: string) => isAdmin(name) || isCourseAdmin(name, courseId);

  function cleanName(input: unknown) {
    const name = typeof input === 'string' ? input.trim().replace(/\s+/g, ' ') : '';
    if (!NAME_RE.test(name)) throw new AdminError('invalid_input', 'The course name must be 3-80 characters (letters, numbers and simple punctuation).');
    return name;
  }
  function cleanDescription(input: unknown) {
    if (input === undefined || input === null) return '';
    const text = typeof input === 'string' ? input.trim() : '';
    if (typeof input !== 'string' || text.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw new AdminError('invalid_input', 'The description must be plain text of at most 500 characters.');
    return text;
  }
  function insertCourse(actor: string, name: string, description: string, status: CourseStatus, proposedBy: string | null): Course {
    const id = slugify(name);
    if (!id) throw new AdminError('invalid_input', 'The course name needs letters or numbers.');
    if (row(id)) throw new AdminError('conflict', 'A course with this name already exists.');
    const t = now();
    db.prepare('INSERT INTO courses (id,name,description,status,proposedBy,createdBy,createdAt,approvedBy,approvedAt) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(id, name, description, status, proposedBy, actor, t, status === 'active' ? actor : null, status === 'active' ? t : null);
    return toCourse(row(id)!);
  }

  /** Administrators see everything. Everyone else sees active courses, plus proposals they made or manage. */
  function listCourses(actor: string): Course[] {
    const all = db.prepare('SELECT * FROM courses ORDER BY name').all() as unknown as CourseRow[];
    const admin = isAdmin(actor);
    return all.filter(c => admin || c.status === 'active' || c.proposedBy === actor || isCourseAdmin(actor, c.id)).map(toCourse);
  }
  function getCourse(actor: string, id: unknown): Course {
    const course = mustFind(id);
    if (!isAdmin(actor) && course.status !== 'active' && course.proposedBy !== actor && !isCourseAdmin(actor, course.id)) throw new AdminError('not_found', 'There is no such course.');
    return toCourse(course);
  }
  function createCourse(actor: string, input: { name?: unknown; description?: unknown }): Course {
    requireAdmin(actor);
    const course = insertCourse(actor, cleanName(input.name), cleanDescription(input.description), 'active', null);
    audit(actor, 'course.create', course.id, { name: course.name });
    return course;
  }
  /** Any verified student may propose a course. They become its course admin; it stays hidden until an administrator approves it. */
  function proposeCourse(actor: string, input: { name?: unknown; description?: unknown }): Course {
    const name = cleanName(input.name), description = cleanDescription(input.description);
    const pending = (db.prepare("SELECT COUNT(*) AS n FROM courses WHERE proposedBy=? AND status='proposed'").get(actor) as { n: number }).n;
    if (pending >= maxPending) throw new AdminError('rate_limited', `You already have ${pending} proposals waiting for review.`);
    const today = (db.prepare('SELECT COUNT(*) AS n FROM courses WHERE proposedBy=? AND createdAt>?').get(actor, now() - 86_400) as { n: number }).n;
    if (today >= maxPerDay) throw new AdminError('rate_limited', 'You proposed several courses today. Try again tomorrow.', 86_400);
    db.exec('BEGIN IMMEDIATE');
    try {
      const course = insertCourse(actor, name, description, 'proposed', actor);
      db.prepare('INSERT INTO course_admins (courseId,username,grantedBy,grantedAt) VALUES (?,?,?,?)').run(course.id, actor, actor, now());
      audit(actor, 'course.propose', course.id, { name });
      db.exec('COMMIT');
      return toCourse(row(course.id)!);
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function setStatus(actor: string, id: unknown, from: CourseStatus[], to: CourseStatus, action: string): Course {
    requireAdmin(actor);
    const course = mustFind(id);
    if (!from.includes(course.status)) throw new AdminError('conflict', `This course is ${course.status}, so it cannot be changed that way.`);
    db.prepare('UPDATE courses SET status=?, approvedBy=?, approvedAt=? WHERE id=?').run(to, to === 'active' ? actor : course.approvedBy, to === 'active' ? now() : null, course.id);
    audit(actor, action, course.id);
    return toCourse(row(course.id)!);
  }
  const approveCourse = (actor: string, id: unknown) => setStatus(actor, id, ['proposed'], 'active', 'course.approve');
  const archiveCourse = (actor: string, id: unknown) => setStatus(actor, id, ['active'], 'archived', 'course.archive');
  const unarchiveCourse = (actor: string, id: unknown) => setStatus(actor, id, ['archived'], 'active', 'course.unarchive');
  /** Rejecting a proposal removes it and its course admins. */
  function rejectProposal(actor: string, id: unknown) {
    requireAdmin(actor);
    const course = mustFind(id);
    if (course.status !== 'proposed') throw new AdminError('conflict', 'Only proposals can be rejected. Archive an active course instead.');
    db.prepare('DELETE FROM course_admins WHERE courseId=?').run(course.id);
    db.prepare('DELETE FROM courses WHERE id=?').run(course.id);
    audit(actor, 'course.reject', course.id, { name: course.name, proposedBy: course.proposedBy });
  }
  /** Administrators, and the course's own admins, may change its name and description (the id never changes). */
  function updateCourse(actor: string, id: unknown, input: { name?: unknown; description?: unknown }): Course {
    const course = mustFind(id);
    if (!canManage(actor, course.id)) throw forbidden('Only administrators and this course\'s admins can edit it.');
    const name = input.name === undefined ? course.name : cleanName(input.name);
    const description = input.description === undefined ? course.description : cleanDescription(input.description);
    db.prepare('UPDATE courses SET name=?, description=? WHERE id=?').run(name, description, course.id);
    audit(actor, 'course.update', course.id, { name, description });
    return toCourse(row(course.id)!);
  }
  function grantCourseAdmin(actor: string, id: unknown, target: unknown) {
    requireAdmin(actor);
    const course = mustFind(id), name = username(target);
    requireAccount(name);
    if (isCourseAdmin(name, course.id)) throw new AdminError('conflict', `${name} already administers this course.`);
    db.prepare('INSERT INTO course_admins (courseId,username,grantedBy,grantedAt) VALUES (?,?,?,?)').run(course.id, name, actor, now());
    audit(actor, 'course_admin.grant', course.id, { username: name });
    return toCourse(row(course.id)!);
  }
  function revokeCourseAdmin(actor: string, id: unknown, target: unknown) {
    requireAdmin(actor);
    const course = mustFind(id), name = username(target);
    if (!isCourseAdmin(name, course.id)) throw new AdminError('not_found', `${name} does not administer this course.`);
    db.prepare('DELETE FROM course_admins WHERE courseId=? AND username=?').run(course.id, name);
    audit(actor, 'course_admin.revoke', course.id, { username: name });
    return toCourse(row(course.id)!);
  }

  /** An account was deleted: it keeps no roles, and no course admin seat. */
  function forgetUser(name: string) {
    db.prepare('DELETE FROM course_admins WHERE username=?').run(name);
    audit('system', 'account.deleted', name);
  }

  return {
    rolesOf, isAdmin, isRootAdmin, listAdmins, grantAdmin, revokeAdmin,
    listCourses, getCourse, createCourse, proposeCourse, approveCourse, archiveCourse, unarchiveCourse, rejectProposal, updateCourse,
    grantCourseAdmin, revokeCourseAdmin, canManage, audit, listAudit, forgetUser,
  };
}
export type AdminService = ReturnType<typeof createAdminService>;
