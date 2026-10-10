import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import express from 'express';

process.env.DATABASE_PATH = ':memory:';
const { db, session, createPlayer } = await import('../server/store');
const { mountAuth } = await import('../auth/routes');
const { createVerifiedGuard } = await import('../auth/guard');
const { mountAdmin } = await import('../admin/routes');
const { mountSubmissions } = await import('./routes');
const { uploadLimits } = await import('./files');
const { createSubmissionService } = await import('./service');

const PASSWORD = 'correct horse battery';
const outbox: { subject: string }[] = [];
const cookies = new Map<string, string>();
let server: Server, base: string, uploads: string, accounts: ReturnType<typeof mountAuth>, admin: ReturnType<typeof mountAdmin>, service: ReturnType<typeof mountSubmissions>;

const PDF = (n = 100) => Buffer.concat([Buffer.from('%PDF-1.7\n'), randomBytes(n)]);
const VTT = (cues = 5) => Buffer.from('WEBVTT\n\n' + Array.from({ length: cues }, (_, i) => `00:00:0${i}.000 --> 00:00:0${i + 1}.000\nline ${i} ${randomBytes(4).toString('hex')}\n`).join('\n'));
const MP4 = (size: number) => Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypisom'), randomBytes(size)]);

before(async () => {
  uploads = mkdtempSync(join(tmpdir(), 'uploads-'));
  const app = express();
  app.use(express.json());
  accounts = mountAuth(app, { db, playerFromCookie: session, createPlayer, mailer: { send: async m => { outbox.push(m); } }, verificationOptions: { resendCooldownSeconds: 0 } });
  app.use('/api', createVerifiedGuard({ db, playerFromCookie: session }).http);
  admin = mountAdmin(app, { db, playerFromCookie: session, accounts, rootAdmins: new Set(['riordache']) });
  const limits = uploadLimits({ UPLOAD_MAX_TRANSCRIPT_MB: '0.002', UPLOAD_MAX_PDF_MB: '1', UPLOAD_MAX_VIDEO_MB: '20', UPLOAD_MAX_PENDING_PER_USER: '5' });
  service = mountSubmissions(app, { db, playerFromCookie: session, admin, uploadsDir: uploads, limits });
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const name of ['riordache', 'anna', 'ben', 'cara', 'dave']) {
    const { profile } = createPlayer();
    await accounts.register({ identifier: name, password: PASSWORD, playerId: profile.id });
    accounts.confirm(name, outbox.at(-1)!.subject.match(/\d{6}/)![0]);
    cookies.set(name, `ba_session=${accounts.startSession(profile.id).token}`);
  }
  admin.createCourse('riordache', { name: 'Physics' });
  admin.grantCourseAdmin('riordache', 'physics', 'anna');
});
after(() => { server.close(); rmSync(uploads, { recursive: true, force: true }); });

async function call(as: string | null, method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(as ? { cookie: cookies.get(as)! } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) as any };
}
async function upload(as: string, id: string, slot: string, data: Buffer, name = 'file.bin') {
  const res = await fetch(`${base}/api/submissions/${id}/files/${slot}`, { method: 'PUT', headers: { cookie: cookies.get(as)!, 'content-type': 'application/octet-stream', 'x-filename': name }, body: new Uint8Array(data) });
  return { status: res.status, body: await res.json().catch(() => null) as any };
}
const newSubmission = async (as: string, course: string, input: object) => (await call(as, 'POST', `/api/courses/${course}/submissions`, input)).body.id as string;
/** A complete, pending lecture submission. */
async function pendingLecture(as: string, course: string, number: number, extra: { video?: Buffer } = {}) {
  const id = await newSubmission(as, course, { type: 'lecture', title: `Lecture ${number}`, number });
  assert.equal((await upload(as, id, 'transcript', VTT(), `lec${number}.vtt`)).status, 201);
  if (extra.video) assert.equal((await upload(as, id, 'video', extra.video, `lec${number}.mp4`)).status, 201);
  assert.equal((await call(as, 'POST', `/api/submissions/${id}/submit`)).status, 200);
  return id;
}
const rawPut = (path: string, as: string, headers: Record<string, string>, write: (req: import('node:http').ClientRequest) => void) => new Promise<{ status: number; body: string }>((resolve, reject) => {
  const req = request(base + path, { method: 'PUT', headers: { cookie: cookies.get(as)!, ...headers } }, res => { let body = ''; res.on('data', c => body += c); res.on('end', () => resolve({ status: res.statusCode ?? 0, body })); });
  req.on('error', reject); write(req);
});

test('anonymous visitors cannot touch any submission route', async () => {
  for (const [method, path] of [['POST', '/api/courses/computer-architecture/submissions'], ['GET', '/api/me/submissions'], ['GET', '/api/submissions/x'], ['POST', '/api/submissions/x/approve']])
    assert.equal((await call(null, method, path, method === 'GET' ? undefined : {})).status, 401, path);
  assert.equal((await fetch(`${base}/api/submissions/x/files/video`, { method: 'PUT', body: 'x' })).status, 401);
});

test('full flow: draft, upload with checks, submit, review, approve, download', async () => {
  const id = await newSubmission('ben', 'computer-architecture', { type: 'lecture', title: 'Lecture 7: Memory', number: 7, notes: 'From the 2026 recording' });
  let sub = (await call('ben', 'GET', `/api/submissions/${id}`)).body;
  assert.deepEqual([sub.status, sub.missing, sub.submitter, sub.number], ['draft', ['transcript'], 'ben', 7]);
  assert.equal((await call('ben', 'POST', `/api/submissions/${id}/submit`)).status, 400, 'cannot submit without the transcript');

  assert.equal((await upload('ben', id, 'transcript', PDF(), 'notes.pdf')).status, 415, 'a PDF is not a transcript');
  assert.equal((await upload('ben', id, 'transcript', Buffer.from('WEBVTT\n\nno timestamps here at all'), 'x.vtt')).status, 400);
  const video = MP4(3 * 1024 * 1024);
  const t = await upload('ben', id, 'transcript', VTT(), '../../etc/lec7.vtt');
  assert.equal(t.status, 201);
  assert.deepEqual(t.body.files.map((f: { slot: string; originalName: string; mime: string }) => [f.slot, f.originalName, f.mime]), [['transcript', 'lec7.vtt', 'text/vtt']]);
  assert.equal((await upload('ben', id, 'video', video, 'lec7.mp4')).status, 201, 'a 3 MB video streams through');
  assert.deepEqual((await call('ben', 'POST', `/api/submissions/${id}/submit`)).body.status, 'pending');
  assert.equal((await upload('ben', id, 'transcript', VTT(), 'again.vtt')).status, 409, 'no changes after submitting');

  assert.equal((await call('cara', 'GET', `/api/submissions/${id}`)).status, 404, 'other students cannot see it');
  assert.equal((await call('cara', 'GET', `/api/submissions/${id}/files/video`)).status, 404);
  assert.equal((await call('ben', 'POST', `/api/submissions/${id}/approve`, {})).status, 404, 'the submitter cannot review');
  assert.equal((await call('anna', 'GET', '/api/courses/computer-architecture/submissions')).status, 403, 'a course admin of another course cannot list it');
  const pending = (await call('riordache', 'GET', '/api/courses/computer-architecture/submissions')).body.submissions;
  assert.deepEqual(pending.map((s: { id: string }) => s.id), [id]);

  const dl = await fetch(`${base}/api/submissions/${id}/files/video`, { headers: { cookie: cookies.get('riordache')! } });
  assert.equal(dl.status, 200);
  assert.match(dl.headers.get('content-disposition') ?? '', /^attachment; filename="lec7\.mp4"$/);
  assert.equal(dl.headers.get('x-content-type-options'), 'nosniff');
  assert.match(dl.headers.get('content-security-policy') ?? '', /sandbox/);
  assert.equal(Buffer.compare(Buffer.from(await dl.arrayBuffer()), video), 0, 'the bytes come back unchanged');

  const approved = (await call('riordache', 'POST', `/api/submissions/${id}/approve`, { note: 'Looks good' })).body;
  assert.deepEqual([approved.status, approved.reviewedBy, approved.indexState, approved.reviewNote], ['approved', 'riordache', 'queued', 'Looks good']);
  assert.equal((await call('riordache', 'POST', `/api/submissions/${id}/approve`, {})).status, 409, 'approving twice');
  assert.ok((await call('riordache', 'GET', '/api/admin/audit')).body.entries.some((e: { action: string; target: string }) => e.action === 'submission.approve' && e.target === id));
});

test('a lecture number can exist once; duplicates of the same file are caught', async () => {
  const other = await newSubmission('cara', 'computer-architecture', { type: 'lecture', title: 'Lecture 7 again', number: 7 });
  await upload('cara', other, 'transcript', VTT(), 'a.vtt');
  assert.equal((await call('cara', 'POST', `/api/submissions/${other}/submit`)).status, 409, 'lecture 7 is already approved');

  const pdf = PDF(500);
  const first = await newSubmission('cara', 'computer-architecture', { type: 'slides', title: 'Slides 3', number: 3 });
  await upload('cara', first, 'slides', pdf, 's.pdf');
  assert.equal((await call('cara', 'POST', `/api/submissions/${first}/submit`)).status, 200);
  const copy = await newSubmission('dave', 'computer-architecture', { type: 'slides', title: 'Same slides', number: 3 });
  await upload('dave', copy, 'slides', pdf, 'other-name.pdf');
  const res = await call('dave', 'POST', `/api/submissions/${copy}/submit`);
  assert.deepEqual([res.status, res.body.code], [409, 'conflict']);
});

test('a course admin reviews only their course, never their own submission; an administrator may', async () => {
  const mine = await newSubmission('anna', 'physics', { type: 'script', title: 'Physics script' });
  await upload('anna', mine, 'script', PDF(), 'script.pdf');
  await call('anna', 'POST', `/api/submissions/${mine}/submit`);
  assert.equal((await call('anna', 'POST', `/api/submissions/${mine}/approve`, {})).status, 403, 'no self-approval for a course admin');

  const bens = await newSubmission('ben', 'physics', { type: 'slides', title: 'Physics slides', number: 1 });
  await upload('ben', bens, 'slides', PDF(), 's.pdf');
  await call('ben', 'POST', `/api/submissions/${bens}/submit`);
  assert.equal((await call('anna', 'GET', '/api/courses/physics/submissions')).body.submissions.length, 2);
  assert.equal((await call('anna', 'POST', `/api/submissions/${bens}/approve`, {})).body.status, 'approved', 'the physics course admin reviews physics');
  assert.equal((await call('riordache', 'POST', `/api/submissions/${mine}/approve`, {})).body.status, 'approved', 'an administrator can approve a course admin\'s own');

  const ca = await pendingLecture('dave', 'computer-architecture', 11);
  assert.equal((await call('anna', 'POST', `/api/submissions/${ca}/approve`, {})).status, 404, 'anna cannot review a course she does not administer');
});

test('rejecting needs a reason and deletes the files; withdrawing does too', async () => {
  const id = await pendingLecture('ben', 'computer-architecture', 12, { video: MP4(2000) });
  assert.ok(existsSync(join(uploads, id)));
  assert.equal((await call('riordache', 'POST', `/api/submissions/${id}/reject`, {})).status, 400, 'a reason is required');
  const rejected = (await call('riordache', 'POST', `/api/submissions/${id}/reject`, { note: 'Transcript is for a different lecture' })).body;
  assert.deepEqual([rejected.status, rejected.reviewNote], ['rejected', 'Transcript is for a different lecture']);
  assert.ok(!existsSync(join(uploads, id)), 'files are gone');
  assert.equal((await call('ben', 'GET', `/api/submissions/${id}/files/video`)).status, 404);
  assert.equal((await call('ben', 'GET', `/api/submissions/${id}`)).body.reviewNote, 'Transcript is for a different lecture', 'the submitter sees the reason');

  const w = await pendingLecture('ben', 'computer-architecture', 13);
  assert.equal((await call('ben', 'POST', `/api/submissions/${w}/withdraw`)).body.status, 'withdrawn');
  assert.ok(!existsSync(join(uploads, w)));
  assert.equal((await call('ben', 'POST', `/api/submissions/${w}/withdraw`)).status, 409);
});

test('an administrator can take approved material down again', async () => {
  const id = await pendingLecture('cara', 'computer-architecture', 14);
  await call('riordache', 'POST', `/api/submissions/${id}/approve`, {});
  assert.equal((await call('anna', 'POST', `/api/admin/submissions/${id}/remove`, { reason: 'x' })).status, 403);
  assert.equal((await call('riordache', 'POST', `/api/admin/submissions/${id}/remove`, {})).status, 400, 'a reason is required');
  const removed = (await call('riordache', 'POST', `/api/admin/submissions/${id}/remove`, { reason: 'Takedown request from the lecturer' })).body;
  assert.deepEqual([removed.status, removed.indexState], ['removed', 'none']);
  assert.ok(!existsSync(join(uploads, id)));
  assert.equal((await call('riordache', 'POST', `/api/admin/submissions/${id}/remove`, { reason: 'again' })).status, 404);
});

test('bad uploads are stopped early, answered properly, and leave nothing behind', async () => {
  const id = await newSubmission('dave', 'computer-architecture', { type: 'lecture', title: 'Lecture 20', number: 20 });
  const tooBig = await upload('dave', id, 'transcript', Buffer.concat([VTT(), Buffer.alloc(5000, 'a')]));
  assert.deepEqual([tooBig.status, tooBig.body.code], [413, 'too_large']);
  const chunked = await rawPut(`/api/submissions/${id}/files/transcript`, 'dave', { 'transfer-encoding': 'chunked' }, req => { req.write(VTT()); req.end(); });
  assert.equal(chunked.status, 411, 'a Content-Length is required so the size can be checked up front');
  const truncated = await rawPut(`/api/submissions/${id}/files/transcript`, 'dave', { 'content-length': '1000' }, req => { req.write(VTT().subarray(0, 100)); setTimeout(() => req.destroy(), 50); }).catch(() => ({ status: 0, body: '' }));
  assert.equal(truncated.status, 0, 'the client went away');
  await new Promise(r => setTimeout(r, 200));
  assert.deepEqual(readdirSync(join(uploads, id)).filter(n => n.endsWith('.part')), [], 'no half-written file is left');
  assert.equal((await upload('dave', id, 'transcript', VTT())).status, 201, 'a normal upload still works afterwards');
  assert.equal((await upload('dave', id, 'video', Buffer.from('not a video at all, just text'))).status, 415);
  assert.equal((await upload('dave', id, 'slides', PDF())).status, 400, 'a lecture has no slides slot');
  assert.equal((await upload('dave', id, 'passwd', PDF())).status, 400);
  assert.equal((await upload('dave', id, '..%2F..%2Fetc%2Fpasswd', PDF())).status, 400);
  assert.equal((await upload('dave', '..%2F..%2Fetc', 'video', MP4(10))).status, 404);
  assert.equal((await upload('cara', id, 'video', MP4(10))).status, 404, 'only the owner can upload');
  assert.deepEqual(readdirSync(uploads).filter(n => !/^[0-9a-f-]{36}$/.test(n)), [], 'only submission folders exist in the upload directory');
});

test('quotas, limits per student, other students\' drafts and stale drafts', async () => {
  const ids = [];
  for (let i = 0; i < 5; i++) ids.push(await newSubmission('ben', 'computer-architecture', { type: 'script', title: `Draft ${i}` }));
  const sixth = await call('ben', 'POST', '/api/courses/computer-architecture/submissions', { type: 'script', title: 'Draft six' });
  assert.deepEqual([sixth.status, sixth.body.code], [429, 'rate_limited']);
  assert.equal((await call('riordache', 'GET', `/api/submissions/${ids[0]}`)).status, 404, 'even administrators do not see other people\'s drafts');
  assert.equal((await call('ben', 'GET', '/api/me/submissions')).body.submissions.filter((s: { status: string }) => s.status === 'draft').length, 5);
  await upload('ben', ids[0], 'script', PDF());
  assert.ok(existsSync(join(uploads, ids[0])));
  assert.ok(service.purgeStaleDrafts(-5) >= 5, 'every stale draft is removed');
  assert.ok(!existsSync(join(uploads, ids[0])), 'with its files');
  assert.equal((await call('ben', 'GET', `/api/submissions/${ids[0]}`)).status, 404);

  const small = createSubmissionService(db, admin, { uploadsDir: uploads, limits: { ...uploadLimits({}), userPerDay: 50 } });
  const d = small.create('cara', 'computer-architecture', { type: 'script', title: 'Quota test' });
  assert.throws(() => small.prepareUpload('cara', d.id, 'script', 51), (e: { code: string }) => e.code === 'rate_limited');
  const tiny = createSubmissionService(db, admin, { uploadsDir: uploads, limits: { ...uploadLimits({}), total: 50 } });
  assert.throws(() => tiny.prepareUpload('cara', d.id, 'script', 51), (e: { code: string }) => e.code === 'rate_limited');
});

test("a draft is purged a day after its last activity, never while an upload is running; lists show each draft's own files", () => {
  let time = 1_900_000_000_000;
  const clocked = createSubmissionService(db, admin, { uploadsDir: uploads, clock: () => time });
  const busy = clocked.create('cara', 'computer-architecture', { type: 'script', title: 'Uploading' });
  const active = clocked.create('cara', 'computer-architecture', { type: 'lecture', title: 'Recently touched', number: 90 });
  const addRow = (id: string, slot: string) => db.prepare("INSERT INTO submission_files (submissionId,slot,size,sha256,originalName,mime,ext,createdAt) VALUES (?,?,1,'x','f','application/pdf','pdf',?)").run(id, slot, Math.floor(time / 1000));
  addRow(busy.id, 'script');
  time += 20 * 3600_000;
  addRow(active.id, 'transcript');
  const mine = clocked.listMine('cara').filter(x => x.id === busy.id || x.id === active.id);
  assert.deepEqual(mine.map(x => [x.id, x.files.map(f => f.slot), x.missing]).sort(),
    [[busy.id, ['script'], []], [active.id, ['transcript'], []]].sort(), 'files are matched to their own submission');
  const release = clocked.holdDraft(busy.id);
  time += 10 * 3600_000; // busy: 30 h old with an upload running; active: last file 10 h ago
  // The database is shared with the other tests, so check these two drafts rather than how many were purged.
  const exists = (id: string) => !!db.prepare('SELECT 1 FROM submissions WHERE id=?').get(id);
  clocked.purgeStaleDrafts();
  assert.deepEqual([exists(busy.id), exists(active.id)], [true, true], 'nothing goes while an upload runs or within a day of the last file');
  release();
  clocked.purgeStaleDrafts();
  assert.deepEqual([exists(busy.id), exists(active.id)], [false, true], 'once the upload ends, the old draft goes');
  time += 15 * 3600_000;
  clocked.purgeStaleDrafts();
  assert.equal(exists(active.id), false, 'a day after its last file, the other one goes too');
});

test('input is validated: types, titles, numbers, courses that are not active', async () => {
  const bad = (input: object, course = 'computer-architecture') => call('cara', 'POST', `/api/courses/${course}/submissions`, input);
  assert.equal((await bad({ type: 'exam', title: 'Nope' })).status, 400);
  assert.equal((await bad({ type: 'lecture', title: 'No number' })).status, 400);
  assert.equal((await bad({ type: 'lecture', title: 'Bad number', number: 0 })).status, 400);
  assert.equal((await bad({ type: 'lecture', title: 'Bad number', number: 1000 })).status, 400);
  assert.equal((await bad({ type: 'script', title: 'Numbered', number: 3 })).status, 400);
  assert.equal((await bad({ type: 'slides', title: '<script>alert(1)</script>' })).status, 400);
  assert.equal((await bad({ type: 'slides', title: 'ab' })).status, 400);
  assert.equal((await bad({ type: 'slides', title: 'Fine title', notes: 'n'.repeat(1001) })).status, 400);
  assert.equal((await bad({ type: 'slides', title: 'Fine title' }, 'no-such-course')).status, 404);
  const proposed = (await call('ben', 'POST', '/api/courses/propose', { name: 'Chemistry' })).body;
  assert.equal(proposed.status, 'proposed');
  assert.equal((await call('ben', 'POST', '/api/courses/chemistry/submissions', { type: 'script', title: 'Early script' })).status, 409, 'not before the course is approved');
});
