import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import { createAdminService } from '../admin/service';
import { AdminError } from '../admin/errors';
import { initSubmissionSchema } from '../submissions/schema';
import { receiveUpload, uploadLimits, type Slot } from '../submissions/files';
import { createSubmissionService } from '../submissions/service';
import { createIndexingService } from './service';
import { RunnerError, type DocumentJob, type IndexRunner, type JobKind, type LectureJob, type Readiness } from './runner';

class FakeRunner implements IndexRunner {
  calls: string[] = [];
  ready: Record<JobKind, Readiness> = { lecture: { ok: true }, document: { ok: true } };
  lecture: (job: LectureJob) => Promise<void> = async () => {};
  document: (job: DocumentJob) => Promise<{ pages: number }> = async () => ({ pages: 3 });
  async readiness(kind: JobKind) { return this.ready[kind]; }
  async indexLecture(job: LectureJob) { this.calls.push(`index:${job.number}`); await this.lecture(job); }
  summary: (job: LectureJob) => Promise<void> = async () => {};
  async summarizeLecture(job: LectureJob) { this.calls.push(`summary:${job.number}`); await this.summary(job); }
  async unindexLecture(job: { number: number }) { this.calls.push(`unindex:${job.number}`); }
  async extractDocument(job: DocumentJob) { this.calls.push(`extract:${job.pdfPath.split('/').pop()}`); return this.document(job); }
}

const PDF = () => Buffer.concat([Buffer.from('%PDF-1.7\n'), randomBytes(64)]);
const VTT = () => Buffer.from('WEBVTT\n\n' + [0, 1, 2, 3].map(i => `00:00:0${i}.000 --> 00:00:0${i + 1}.000\nline ${i} ${randomBytes(4).toString('hex')}\n`).join('\n'));
const MP4 = () => Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypisom'), randomBytes(64)]);

let db: DatabaseSync, uploads: string, courses: string, time: number, runner: FakeRunner;
let admin: ReturnType<typeof createAdminService>, submissions: ReturnType<typeof createSubmissionService>, indexing: ReturnType<typeof createIndexingService>;
const kicked: string[] = [], removedCalls: string[] = [];

beforeEach(() => {
  uploads = mkdtempSync(join(tmpdir(), 'idx-up-'));
  courses = mkdtempSync(join(tmpdir(), 'idx-co-'));
  db = new DatabaseSync(':memory:');
  initSubmissionSchema(db);
  time = 1_800_000_000_000;
  for (const name of ['riordache', 'anna', 'ben', 'cara']) db.prepare("INSERT INTO accounts (username,playerId,passwordHash,createdAt,verifiedAt) VALUES (?,?,'x',1,1)").run(name, `p-${name}`);
  const clock = () => time;
  admin = createAdminService(db, { rootAdmins: new Set(['riordache']), clock });
  admin.createCourse('riordache', { name: 'Physics' });
  admin.grantCourseAdmin('riordache', 'physics', 'anna');
  runner = new FakeRunner();
  kicked.length = 0; removedCalls.length = 0;
  submissions = createSubmissionService(db, admin, {
    uploadsDir: uploads, clock, limits: uploadLimits({}), isNumberReserved: (course, n) => course === 'computer-architecture' && n <= 24,
    onApproved: s => { kicked.push(s.id); }, onRemoved: async s => { removedCalls.push(s.id); await indexing.unpublish(s); },
  });
  indexing = createIndexingService(db, admin, { runner, submissions, coursesDir: courses, clock, maxAttempts: 3, retryBaseSeconds: 60, summaries: false });
});
const withSummaries = () => { indexing = createIndexingService(db, admin, { runner, submissions, coursesDir: courses, clock: () => time, maxAttempts: 3, retryBaseSeconds: 60, summaries: true }); };
const sstate = (id: string) => db.prepare('SELECT summaryState, summaryAttempts, summaryError, summaryAt FROM submissions WHERE id=?').get(id) as { summaryState: string; summaryAttempts: number; summaryError: string | null; summaryAt: number | null };
afterEach(() => { rmSync(uploads, { recursive: true, force: true }); rmSync(courses, { recursive: true, force: true }); });

async function addFile(who: string, id: string, slot: Slot, data: Buffer) {
  const prepared = submissions.prepareUpload(who, id, slot, data.length);
  await submissions.ensureDir(id);
  const stored = await receiveUpload(Readable.from([data]), prepared.tmpPath, slot, prepared.max, data.length);
  await submissions.commitFile(who, id, slot, stored, `${slot}.bin`, prepared.tmpPath);
}
/** An approved submission, ready for the indexer. */
async function approved(kind: 'lecture' | 'slides' | 'script', opts: { who?: string; course?: string; number?: number; video?: boolean; reviewer?: string } = {}) {
  const who = opts.who ?? 'ben', course = opts.course ?? 'physics';
  const sub = submissions.create(who, course, { type: kind, title: `${kind} ${opts.number ?? ''} test`, number: opts.number });
  if (kind === 'lecture') { await addFile(who, sub.id, 'transcript', VTT()); if (opts.video) await addFile(who, sub.id, 'video', MP4()); }
  else await addFile(who, sub.id, kind === 'slides' ? 'slides' : 'script', PDF());
  submissions.submit(who, sub.id);
  time += 1000;
  submissions.approve(opts.reviewer ?? 'riordache', sub.id);
  return sub.id;
}
const state = (id: string) => db.prepare('SELECT indexState, indexAttempts, indexError, indexedAt, indexNextAt FROM submissions WHERE id=?').get(id) as { indexState: string; indexAttempts: number; indexError: string | null; indexedAt: number | null; indexNextAt: number | null };

test('an approved lecture is published into its course folder and indexed with that course\'s own paths', async () => {
  const id = await approved('lecture', { number: 7, video: true });
  assert.equal(kicked.length, 1, 'approval tells the worker');
  assert.equal(state(id).indexState, 'queued');
  let seen: LectureJob | undefined;
  runner.lecture = async job => { seen = job; };
  assert.equal(await indexing.tick(), true);
  assert.deepEqual(runner.calls, ['index:7']);
  assert.equal(seen!.lecturesDir, join(courses, 'physics', 'lectures'));
  assert.equal(seen!.indexPath, join(courses, 'physics', 'qa', 'index.json'));
  assert.deepEqual(readdirSync(join(courses, 'physics', 'lectures')).sort(), ['lec7.mp4', 'lec7.vtt']);
  const stored = submissions.internalFiles(id);
  for (const f of stored) assert.equal(statSync(join(courses, 'physics', 'lectures', `lec7.${f.ext}`)).size, f.size, 'the published file is the uploaded file');
  const s = state(id);
  assert.deepEqual([s.indexState, s.indexError, s.indexAttempts], ['done', null, 1]);
  assert.ok(s.indexedAt);
  assert.ok(db.prepare("SELECT 1 FROM audit_log WHERE action='index.done' AND target=?").get(id));
  assert.equal(await indexing.tick(), false, 'nothing left to do');
});

test('indexing the same material again leaves no temporary files behind (regression)', async () => {
  const id = await approved('lecture', { number: 12, video: true });
  await indexing.tick();
  assert.equal(indexing.retry('riordache', id).indexState, 'queued');
  await indexing.tick();
  indexing.retry('riordache', id);
  await indexing.tick();
  assert.deepEqual(readdirSync(join(courses, 'physics', 'lectures')).sort(), ['lec12.mp4', 'lec12.vtt']);
  assert.equal(state(id).indexState, 'done');
});

test('slides and scripts get their text extracted into the course\'s documents folder', async () => {
  const slides = await approved('slides', { number: 3 });
  const script = await approved('script');
  let out: DocumentJob | undefined;
  runner.document = async job => { out = job; return { pages: 12 }; };
  while (await indexing.tick());
  assert.equal(runner.calls.length, 2);
  assert.ok(existsSync(join(courses, 'physics', 'documents', `${slides}.pdf`)));
  assert.ok(existsSync(join(courses, 'physics', 'documents', `${script}.pdf`)));
  assert.equal(out!.outPath, join(courses, 'physics', 'qa', 'documents', `${script}.json`));
  assert.deepEqual([state(slides).indexState, state(script).indexState], ['done', 'done']);
});

test('jobs run one at a time, oldest approval first', async () => {
  const first = await approved('lecture', { number: 1 }), second = await approved('lecture', { number: 2 }), third = await approved('lecture', { number: 3 });
  let release!: () => void;
  let started!: () => void;
  const hasStarted = new Promise<void>(resolve => { started = resolve; });
  runner.lecture = job => job.number === 1 ? new Promise<void>(r => { release = r; started(); }) : Promise.resolve();
  const running = indexing.tick();
  await hasStarted;
  assert.equal(state(first).indexState, 'indexing');
  assert.equal(await indexing.tick(), false, 'a second worker pass does not start while one job runs');
  assert.deepEqual(runner.calls, ['index:1']);
  release();
  await running;
  while (await indexing.tick());
  assert.deepEqual(runner.calls, ['index:1', 'index:2', 'index:3']);
  assert.deepEqual([first, second, third].map(id => state(id).indexState), ['done', 'done', 'done']);
});

test('a transient failure is retried with growing delays, then marked failed with a readable reason', async () => {
  const id = await approved('lecture', { number: 5 });
  runner.lecture = async () => { throw new RunnerError('RateLimitError: slow down', true); };
  await indexing.tick();
  let s = state(id);
  assert.deepEqual([s.indexState, s.indexAttempts, s.indexError, s.indexNextAt], ['queued', 1, 'RateLimitError: slow down', time / 1000 + 60]);
  assert.equal(await indexing.tick(), false, 'not due yet');
  time += 61_000;
  await indexing.tick();
  s = state(id);
  assert.deepEqual([s.indexState, s.indexAttempts, s.indexNextAt], ['queued', 2, time / 1000 + 120]);
  time += 121_000;
  await indexing.tick();
  s = state(id);
  assert.deepEqual([s.indexState, s.indexAttempts, s.indexError, s.indexNextAt], ['failed', 3, 'RateLimitError: slow down', null]);
  assert.equal(await indexing.tick(), false);
  assert.ok(db.prepare("SELECT 1 FROM audit_log WHERE action='index.failed' AND target=?").get(id));
});

test('a file that can never work fails at once, without retries', async () => {
  const id = await approved('script');
  runner.document = async () => { throw new RunnerError('Error: The PDF has no extractable text.', false); };
  await indexing.tick();
  assert.deepEqual([state(id).indexState, state(id).indexAttempts, state(id).indexError], ['failed', 1, 'Error: The PDF has no extractable text.']);
});

test('without an API key lectures wait (and are not counted as failed), while documents still run', async () => {
  runner.ready.lecture = { ok: false, reason: 'OPENAI_API_KEY is not set.' };
  const lecture = await approved('lecture', { number: 9 });
  const script = await approved('script');
  while (await indexing.tick());
  assert.deepEqual(runner.calls.map(c => c.split(':')[0]), ['extract']);
  assert.deepEqual([state(lecture).indexState, state(lecture).indexAttempts], ['queued', 0]);
  assert.equal(state(script).indexState, 'done');
  const status = await indexing.status('riordache', 'physics');
  assert.deepEqual([status.lectureIndexing, status.documentExtraction.ok, status.counts.queued, status.counts.done], [{ ok: false, reason: 'OPENAI_API_KEY is not set.' }, true, 1, 1]);
  runner.ready.lecture = { ok: true };
  await indexing.tick();
  assert.equal(state(lecture).indexState, 'done', 'once configured the waiting lecture is indexed');
});

test('a crash while indexing is recovered: the job is queued again', async () => {
  const id = await approved('lecture', { number: 4 });
  db.prepare("UPDATE submissions SET indexState='indexing' WHERE id=?").run(id);
  assert.equal(await indexing.tick(), false, 'an interrupted job is not picked up by chance');
  assert.equal(indexing.recover(), 1);
  assert.equal(state(id).indexState, 'queued');
  await indexing.tick();
  assert.equal(state(id).indexState, 'done');
});

test('administrators and the course\'s own admins can retry; nobody else', async () => {
  const id = await approved('lecture', { number: 6 });
  runner.lecture = async () => { throw new RunnerError('boom', false); };
  await indexing.tick();
  assert.equal(state(id).indexState, 'failed');
  assert.throws(() => indexing.retry('cara', id), (e: AdminError) => e.code === 'not_found');
  assert.throws(() => indexing.retry('ben', id), (e: AdminError) => e.code === 'not_found', 'the submitter cannot');
  const other = admin.createCourse('riordache', { name: 'Chemistry' });
  admin.grantCourseAdmin('riordache', other.id, 'cara');
  assert.throws(() => indexing.retry('cara', id), (e: AdminError) => e.code === 'not_found', 'a course admin of another course cannot');
  runner.lecture = async () => {};
  assert.equal(indexing.retry('anna', id).indexState, 'queued');
  assert.deepEqual([state(id).indexAttempts, state(id).indexError], [0, null]);
  assert.throws(() => indexing.retry('anna', id), (e: AdminError) => e.code === 'conflict', 'already queued');
  await indexing.tick();
  assert.equal(state(id).indexState, 'done');
  assert.equal(indexing.retry('riordache', id).indexState, 'queued', 'a finished item can be indexed again');
});

test('removing approved material takes it out of the index and the course folder', async () => {
  const lecture = await approved('lecture', { number: 8, video: true });
  const doc = await approved('slides');
  while (await indexing.tick());
  assert.ok(existsSync(join(courses, 'physics', 'lectures', 'lec8.mp4')));
  await submissions.remove('riordache', lecture, 'Takedown request');
  await submissions.remove('riordache', doc, 'Wrong course');
  assert.deepEqual(removedCalls, [lecture, doc]);
  assert.ok(runner.calls.includes('unindex:8'));
  assert.ok(!existsSync(join(courses, 'physics', 'lectures', 'lec8.vtt')) && !existsSync(join(courses, 'physics', 'lectures', 'lec8.mp4')));
  assert.ok(!existsSync(join(courses, 'physics', 'documents', `${doc}.pdf`)));
});

test('removal while a job is running leaves nothing behind and is never marked done', async () => {
  const id = await approved('lecture', { number: 10, video: true });
  let release!: () => void;
  runner.lecture = () => new Promise<void>(r => { release = r; });
  const running = indexing.tick();
  await new Promise(r => setTimeout(r, 20));
  assert.equal(state(id).indexState, 'indexing');
  db.prepare("UPDATE submissions SET status='removed' WHERE id=?").run(id);
  release();
  await running;
  assert.notEqual(state(id).indexState, 'done');
  assert.ok(runner.calls.includes('unindex:10'));
  assert.ok(!existsSync(join(courses, 'physics', 'lectures', 'lec10.vtt')));
});

test('the original recordings keep their lecture numbers: a submission cannot take lecture 7 of DDCA', async () => {
  const sub = submissions.create('ben', 'computer-architecture', { type: 'lecture', title: 'Lecture 7 again', number: 7 });
  await addFile('ben', sub.id, 'transcript', VTT());
  assert.throws(() => submissions.submit('ben', sub.id), (e: AdminError) => e.code === 'conflict' && /original recordings/.test(e.message));
  const fresh = submissions.create('ben', 'computer-architecture', { type: 'lecture', title: 'Lecture 25', number: 25 });
  await addFile('ben', fresh.id, 'transcript', VTT());
  assert.equal(submissions.submit('ben', fresh.id).status, 'pending');
});

test('only administrators and the course\'s admins can see a course\'s indexing status', async () => {
  const id = await approved('lecture', { number: 11 });
  runner.lecture = async () => { throw new RunnerError('model said no', false); };
  await indexing.tick();
  const status = await indexing.status('anna', 'physics');
  assert.deepEqual(status.items.map(i => [i.id, i.indexState, i.indexError]), [[id, 'failed', 'model said no']]);
  await assert.rejects(indexing.status('ben', 'physics'), (e: AdminError) => e.code === 'forbidden');
  await assert.rejects(indexing.status('anna', 'computer-architecture'), (e: AdminError) => e.code === 'forbidden');
  await assert.rejects(indexing.status('riordache', 'nope'), (e: AdminError) => e.code === 'not_found');
});

test('a disabled worker leaves everything queued', async () => {
  const id = await approved('script');
  indexing.setEnabled(false);
  assert.equal(await indexing.tick(), false);
  assert.equal(state(id).indexState, 'queued');
  indexing.setEnabled(true);
  assert.equal(await indexing.tick(), true);
});

test('a shared budget caps paid lecture runs across courses; retries count, PDFs stay free', async () => {
  indexing = createIndexingService(db, admin, { runner, submissions, coursesDir: courses, clock: () => time, maxAttempts: 3, retryBaseSeconds: 60, maxPaidRuns: 2 });
  const chemistry = admin.createCourse('riordache', { name: 'Chemistry' }).id;
  const first = await approved('lecture', { number: 1 });
  await indexing.tick();
  assert.equal(indexing.retry('riordache', first).indexState, 'queued', 're-indexing is allowed while budget is left');
  await indexing.tick();
  assert.deepEqual(indexing.budget(), { used: 2, limit: 2, remaining: 0 });
  const other = await approved('lecture', { number: 2, course: chemistry });
  const slides = await approved('slides');
  while (await indexing.tick());
  assert.equal(state(other).indexState, 'queued', 'a lecture in another course waits once the shared budget is used up');
  assert.equal(state(slides).indexState, 'done', 'free PDF extraction goes on');
  assert.deepEqual(runner.calls.filter(c => c.startsWith('index:')), ['index:1', 'index:1']);
  assert.throws(() => indexing.retry('riordache', first), (e: AdminError) => e.code === 'conflict' && /budget/.test(e.message));
  const status = await indexing.status('riordache', chemistry);
  assert.equal(status.lectureIndexing.ok, false);
  assert.equal(status.budget.remaining, 0);
});

test('summaries: after indexing a lecture, notes are made from the index, and index jobs always go first', async () => {
  withSummaries();
  const a = await approved('lecture', { number: 1 }), b = await approved('lecture', { number: 2 });
  assert.equal(sstate(a).summaryState, 'none');
  await indexing.tick();
  assert.deepEqual([state(a).indexState, sstate(a).summaryState], ['done', 'queued']);
  while (await indexing.tick());
  assert.deepEqual(runner.calls, ['index:1', 'index:2', 'summary:1', 'summary:2']);
  assert.deepEqual([sstate(a).summaryState, sstate(b).summaryState], ['done', 'done']);
  assert.ok(sstate(a).summaryAt);
  assert.ok(db.prepare("SELECT 1 FROM audit_log WHERE action='summary.done' AND target=?").get(a));
  assert.equal((await indexing.status('riordache', 'physics')).summariesEnabled, true);
});

test('summaries: a failing summary is retried and never touches the index state', async () => {
  withSummaries();
  const id = await approved('lecture', { number: 4 });
  runner.summary = async () => { throw new RunnerError('RateLimitError: slow down', true); };
  await indexing.tick(); await indexing.tick();
  assert.deepEqual([state(id).indexState, sstate(id).summaryState, sstate(id).summaryAttempts], ['done', 'queued', 1]);
  assert.equal(await indexing.tick(), false, 'not due yet');
  time += 61_000; await indexing.tick();
  time += 121_000; await indexing.tick();
  assert.deepEqual([state(id).indexState, sstate(id).summaryState, sstate(id).summaryError], ['done', 'failed', 'RateLimitError: slow down']);
  // retry only redoes the summary, not the index
  runner.summary = async () => {};
  runner.calls.length = 0;
  indexing.retry('riordache', id);
  while (await indexing.tick());
  assert.deepEqual(runner.calls, ['summary:4']);
  assert.equal(sstate(id).summaryState, 'done');
});

test('summaries: switched off, nothing is queued; indexing again queues fresh notes', async () => {
  const id = await approved('lecture', { number: 6 });
  while (await indexing.tick());
  assert.equal(sstate(id).summaryState, 'none');
  assert.equal((await indexing.status('riordache', 'physics')).summariesEnabled, false);
  withSummaries();
  indexing.retry('riordache', id);
  while (await indexing.tick());
  assert.deepEqual(runner.calls.filter(c => c.startsWith('summary')), ['summary:6']);
  indexing.retry('riordache', id);
  assert.equal(state(id).indexState, 'queued', 'a done lecture is re-indexed in full');
  while (await indexing.tick());
  assert.equal(runner.calls.filter(c => c.startsWith('summary')).length, 2, 'new index, new notes');
});

test('summaries: a crash while summarizing is recovered', async () => {
  withSummaries();
  const id = await approved('lecture', { number: 8 });
  await indexing.tick();
  db.prepare("UPDATE submissions SET summaryState='summarizing' WHERE id=?").run(id);
  withSummaries();
  indexing.recover();
  assert.equal(sstate(id).summaryState, 'queued');
});
