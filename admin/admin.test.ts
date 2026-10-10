import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { AdminError } from './errors';
import { initAdminSchema } from './schema';
import { createAdminService, slugify } from './service';

const NOW = 1_800_000_000_000;
function setup(options = {}) {
  const db = new DatabaseSync(':memory:');
  initAdminSchema(db);
  let time = NOW;
  for (const name of ['riordache', 'anna', 'ben', 'cara', 'dave'])
    db.prepare("INSERT INTO accounts (username,playerId,passwordHash,createdAt,verifiedAt) VALUES (?,?,'x',1,1)").run(name, `p-${name}`);
  const admin = createAdminService(db, { rootAdmins: new Set(['riordache']), clock: () => time, ...options });
  return { db, admin, advance: (seconds: number) => { time += seconds * 1000; } };
}
const fails = (fn: () => unknown, code: string) => assert.throws(fn, (e: AdminError) => e instanceof AdminError && e.code === code, code);

test('a fresh database has DDCA as the first active course and the server-set admin', () => {
  const { admin } = setup();
  assert.deepEqual(admin.listCourses('anna').map(c => [c.id, c.status]), [['computer-architecture', 'active']]);
  assert.deepEqual(admin.rolesOf('riordache'), { username: 'riordache', admin: true, rootAdmin: true, courseAdminOf: [] });
  assert.deepEqual(admin.rolesOf('anna'), { username: 'anna', admin: false, rootAdmin: false, courseAdminOf: [] });
});

test('ordinary students cannot use any administrator action', () => {
  const { admin } = setup();
  fails(() => admin.createCourse('anna', { name: 'Linear Algebra' }), 'forbidden');
  fails(() => admin.approveCourse('anna', 'computer-architecture'), 'forbidden');
  fails(() => admin.archiveCourse('anna', 'computer-architecture'), 'forbidden');
  fails(() => admin.grantAdmin('anna', 'ben'), 'forbidden');
  fails(() => admin.revokeAdmin('anna', 'riordache'), 'forbidden');
  fails(() => admin.grantCourseAdmin('anna', 'computer-architecture', 'ben'), 'forbidden');
  fails(() => admin.revokeCourseAdmin('anna', 'computer-architecture', 'ben'), 'forbidden');
  fails(() => admin.rejectProposal('anna', 'computer-architecture'), 'forbidden');
  fails(() => admin.listAudit('anna'), 'forbidden');
  fails(() => admin.listAdmins() && admin.updateCourse('anna', 'computer-architecture', { description: 'hacked' }), 'forbidden');
});

test('an administrator creates a course, names course admins, and a student proposal needs approval', () => {
  const { admin } = setup();
  const course = admin.createCourse('riordache', { name: 'Linear Algebra', description: 'Vectors and matrices' });
  assert.deepEqual([course.id, course.status, course.admins], ['linear-algebra', 'active', []]);
  assert.deepEqual(admin.grantCourseAdmin('riordache', 'linear-algebra', 'anna').admins, ['anna']);
  assert.equal(admin.rolesOf('anna').admin, false);
  assert.deepEqual(admin.rolesOf('anna').courseAdminOf, ['linear-algebra']);

  const proposal = admin.proposeCourse('ben', { name: 'Discrete Mathematics' });
  assert.deepEqual([proposal.status, proposal.admins, proposal.proposedBy], ['proposed', ['ben'], 'ben']);
  assert.deepEqual(admin.listCourses('cara').map(c => c.id), ['computer-architecture', 'linear-algebra'], 'others do not see a proposal');
  assert.ok(admin.listCourses('ben').some(c => c.id === 'discrete-mathematics'), 'the proposer does');
  assert.ok(admin.listCourses('riordache').some(c => c.id === 'discrete-mathematics'), 'administrators do');
  fails(() => admin.getCourse('cara', 'discrete-mathematics'), 'not_found');
  assert.equal(admin.approveCourse('riordache', 'discrete-mathematics').status, 'active');
  assert.ok(admin.listCourses('cara').some(c => c.id === 'discrete-mathematics'));
  fails(() => admin.approveCourse('riordache', 'discrete-mathematics'), 'conflict');
});

test('a course admin manages only their own course', () => {
  const { admin } = setup();
  admin.createCourse('riordache', { name: 'Analysis' });
  admin.createCourse('riordache', { name: 'Algorithms' });
  admin.grantCourseAdmin('riordache', 'analysis', 'anna');
  assert.equal(admin.updateCourse('anna', 'analysis', { description: 'Calculus, limits and series' }).description, 'Calculus, limits and series');
  fails(() => admin.updateCourse('anna', 'algorithms', { description: 'nope' }), 'forbidden');
  fails(() => admin.updateCourse('ben', 'analysis', { description: 'nope' }), 'forbidden');
  fails(() => admin.grantCourseAdmin('anna', 'analysis', 'ben'), 'forbidden');
  fails(() => admin.archiveCourse('anna', 'analysis'), 'forbidden');
  admin.revokeCourseAdmin('riordache', 'analysis', 'anna');
  fails(() => admin.updateCourse('anna', 'analysis', { description: 'again' }), 'forbidden');
  fails(() => admin.revokeCourseAdmin('riordache', 'analysis', 'anna'), 'not_found');
});

test('proposals are limited, validated and de-duplicated', () => {
  const { admin, advance } = setup();
  admin.proposeCourse('ben', { name: 'Course One' });
  admin.proposeCourse('ben', { name: 'Course Two' });
  admin.proposeCourse('ben', { name: 'Course Three' });
  fails(() => admin.proposeCourse('ben', { name: 'Course Four' }), 'rate_limited');
  admin.approveCourse('riordache', 'course-one');
  admin.proposeCourse('ben', { name: 'Course Four' });
  fails(() => admin.proposeCourse('ben', { name: 'Course Five' }), 'rate_limited'); // 5 in a day soon
  advance(86_401);
  fails(() => admin.proposeCourse('ben', { name: 'Course Six' }), 'rate_limited'); // still 3 waiting
  admin.approveCourse('riordache', 'course-two');
  admin.proposeCourse('ben', { name: 'Course Six' });
  fails(() => admin.proposeCourse('cara', { name: 'course   one' }), 'conflict');
  for (const bad of ['', 'ab', 'x'.repeat(200), '<script>alert(1)</script>', 'name\u0000', 42, null, '---'])
    fails(() => admin.proposeCourse('cara', { name: bad }), 'invalid_input');
  fails(() => admin.proposeCourse('cara', { name: 'Valid Name', description: 'y'.repeat(501) }), 'invalid_input');
  fails(() => admin.proposeCourse('cara', { name: 'Valid Name', description: { toString: 'x' } }), 'invalid_input');
});

test('rejecting a proposal removes it and its course admin; active courses can only be archived', () => {
  const { admin, db } = setup();
  admin.proposeCourse('ben', { name: 'Spam Course' });
  admin.rejectProposal('riordache', 'spam-course');
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM courses WHERE id=?').get('spam-course') as { n: number }).n, 0);
  assert.equal(admin.rolesOf('ben').courseAdminOf.length, 0);
  fails(() => admin.rejectProposal('riordache', 'computer-architecture'), 'conflict');
  assert.equal(admin.archiveCourse('riordache', 'computer-architecture').status, 'archived');
  assert.deepEqual(admin.listCourses('anna').map(c => c.id), [], 'archived courses are hidden from students');
  assert.equal(admin.unarchiveCourse('riordache', 'computer-architecture').status, 'active');
});

test('administrators can be made and removed, but not the server-set ones or oneself', () => {
  const { admin } = setup();
  fails(() => admin.grantAdmin('riordache', 'nobody1'), 'not_found');
  fails(() => admin.grantAdmin('riordache', 'not a name!'), 'invalid_input');
  assert.equal(admin.grantAdmin('riordache', 'anna').admin, true);
  fails(() => admin.grantAdmin('riordache', 'anna'), 'conflict');
  fails(() => admin.grantAdmin('riordache', 'riordache'), 'conflict');
  assert.equal(admin.createCourse('anna', { name: 'Physics' }).id, 'physics', 'a new admin has the powers at once');
  assert.deepEqual(admin.listAdmins(), [{ username: 'anna', root: false }, { username: 'riordache', root: true }]);
  fails(() => admin.revokeAdmin('anna', 'riordache'), 'forbidden');
  fails(() => admin.revokeAdmin('anna', 'anna'), 'forbidden');
  admin.grantAdmin('anna', 'ben');
  admin.revokeAdmin('riordache', 'anna');
  assert.equal(admin.rolesOf('anna').admin, false);
  fails(() => admin.createCourse('anna', { name: 'Chemistry' }), 'forbidden');
  fails(() => admin.revokeAdmin('riordache', 'cara'), 'not_found');
});

test('every change is written to the audit log, readable only by administrators', () => {
  const { admin } = setup();
  admin.createCourse('riordache', { name: 'Physics' });
  admin.grantAdmin('riordache', 'anna');
  admin.proposeCourse('ben', { name: 'Chemistry' });
  admin.rejectProposal('riordache', 'chemistry');
  const log = admin.listAudit('riordache');
  assert.deepEqual(log.map(e => `${e.actor}:${e.action}:${e.target}`).reverse(), ['riordache:course.create:physics', 'riordache:admin.grant:anna', 'ben:course.propose:chemistry', 'riordache:course.reject:chemistry']);
  assert.ok(log.every(e => !Number.isNaN(Date.parse(e.at))));
  fails(() => admin.listAudit('cara'), 'forbidden');
  assert.doesNotThrow(() => admin.listAudit('anna'), 'anna was made an administrator above');
});

test('forgetting a deleted account removes its course admin seats', () => {
  const { admin } = setup();
  admin.createCourse('riordache', { name: 'Physics' });
  admin.grantCourseAdmin('riordache', 'physics', 'anna');
  admin.forgetUser('anna');
  assert.deepEqual(admin.getCourse('riordache', 'physics').admins, []);
});

test('slugs are stable, ASCII and bounded', () => {
  assert.equal(slugify('Digitale Schaltungen & Rechnerarchitektur'), 'digitale-schaltungen-rechnerarchitektur');
  assert.equal(slugify('Analysis I (Höhere)'), 'analysis-i-hohere');
  assert.equal(slugify('x'.repeat(100)).length, 48);
  assert.equal(slugify('---'), '');
});

test('an older database without the role column is upgraded in place', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE accounts (username TEXT PRIMARY KEY, playerId TEXT NOT NULL UNIQUE, passwordHash TEXT NOT NULL, createdAt INTEGER NOT NULL, verifiedAt INTEGER, disabledAt INTEGER)');
  db.exec("INSERT INTO accounts VALUES ('old','p','h',1,1,NULL)");
  initAdminSchema(db); initAdminSchema(db);
  assert.equal((db.prepare('SELECT role FROM accounts WHERE username=?').get('old') as { role: string }).role, 'user');
});
