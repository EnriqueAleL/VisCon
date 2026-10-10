import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import express from 'express';
import { fixture, type Fixture, vtt, srt } from './catalog-fixtures';

process.env.DATABASE_PATH = ':memory:';
process.env.LECTURE_QA_PROVIDER = 'local';
const { db, session, createPlayer } = await import('../server/store');
const { mountAuth } = await import('../auth/routes');
const { createVerifiedGuard } = await import('../auth/guard');
const { mountLectures } = await import('../server/lectures');

const PASSWORD = 'correct horse battery';
let server: Server, base: string, f: Fixture, cookie = '';
const outbox: { subject: string }[] = [];

before(async () => {
  f = fixture(db);
  f.lecture('physics', 3, { title: 'Lecture 3: Energy', transcript: vtt(12, 'zebracorn') });
  f.lecture('physics', 4, { title: 'Lecture 4 (subtitles as SRT)', ext: 'srt', transcript: srt(8, 'quokkawave'), video: false });
  const app = express();
  app.use(express.json());
  const accounts = mountAuth(app, { db, playerFromCookie: session, createPlayer, mailer: { send: async m => { outbox.push(m); } }, verificationOptions: { resendCooldownSeconds: 0 } });
  app.use(['/api', '/media'], createVerifiedGuard({ db, playerFromCookie: session }).http);
  await mountLectures(app, { db, coursesDir: f.coursesDir });
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const { profile } = createPlayer();
  await accounts.register({ identifier: 'student1', password: PASSWORD, playerId: profile.id });
  accounts.confirm('student1', outbox.at(-1)!.subject.match(/\d{6}/)![0]);
  cookie = `ba_session=${accounts.startSession(profile.id).token}`;
});
after(() => { server.close(); rmSync(f.coursesDir, { recursive: true, force: true }); });

const get = (path: string, headers: Record<string, string> = {}, as: string | null = cookie) => fetch(base + path, { headers: { ...(as ? { cookie: as } : {}), ...headers } });
const json = async (path: string, headers: Record<string, string> = {}) => { const r = await get(path, headers); return { status: r.status, body: await r.json() as any, headers: r.headers }; };
const raw = (path: string) => new Promise<{ status: number; text: string }>((resolve, reject) => {
  const { port } = new URL(base);
  const req = request({ host: '127.0.0.1', port, path, headers: { cookie } }, res => { let text = ''; res.on('data', c => text += c); res.on('end', () => resolve({ status: res.statusCode ?? 0, text })); });
  req.on('error', reject); req.end();
});
const ask = async (question: string, courseId: string | null) => (await fetch(base + '/api/ask', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ question, courseId }) })).json() as Promise<any>;

test('nothing of the catalogue or its media is reachable without a verified login', async () => {
  for (const path of ['/api/courses', '/api/lectures', '/api/lectures/physics-lec3', '/api/lectures/physics-lec3/summary', '/media/courses/physics/lectures/lec3.mp4', '/media/courses/physics/captions/lec3.vtt', '/media/courses/physics/chapters/lec3.chapters.vtt'])
    assert.equal((await get(path, {}, null)).status, 401, path);
  assert.equal((await fetch(base + '/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"question":"zebracorn"}' })).status, 401);
});

test('the course list keeps the shape the lecture app expects and now includes published courses', async () => {
  const { status, body } = await json('/api/courses');
  assert.equal(status, 200);
  const ddca = body.courses.find((c: { id: string }) => c.id === 'computer-architecture');
  assert.equal(ddca.videoCount, 24, 'the original recordings are unchanged');
  const physics = body.courses.find((c: { id: string }) => c.id === 'physics');
  for (const key of ['id', 'name', 'shortName', 'color', 'videoCount', 'degree', 'studyYear']) assert.ok(key in physics, key);
  assert.deepEqual([physics.videoCount, physics.degree, physics.studyYear], [2, 'unspecified', 0]);
  assert.ok(!body.courses.some((c: { id: string }) => c.id.startsWith('linear-algebra-vectors')), 'a course without lectures is not listed');
});

test('the lecture list: same shape, compressed when asked, revalidated with an ETag, filterable by course', async () => {
  const plain = await get('/api/lectures', { 'accept-encoding': 'identity' });
  assert.equal(plain.headers.get('content-encoding'), null);
  const body = await plain.json() as { lectures: { id: string; courseId: string; segments: { transcript: string }[] }[]; provider: string };
  assert.equal(body.provider, 'local');
  assert.ok(body.lectures.some(l => l.id === 'lec7') && body.lectures.some(l => l.id === 'physics-lec3'));
  assert.ok(body.lectures.every(l => l.segments.every(s => s.transcript === '')));

  // fetch() would decompress for us, so read the bytes exactly as they travel.
  const wire = await new Promise<{ encoding: string | undefined; bytes: Buffer }>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: new URL(base).port, path: '/api/lectures', headers: { cookie, 'accept-encoding': 'gzip' } }, res => {
      const chunks: Buffer[] = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve({ encoding: res.headers['content-encoding'], bytes: Buffer.concat(chunks) }));
    });
    req.on('error', reject); req.end();
  });
  assert.equal(wire.encoding, 'gzip');
  assert.deepEqual(JSON.parse(gunzipSync(wire.bytes).toString()), body);
  assert.ok(wire.bytes.length < JSON.stringify(body).length / 3, 'far fewer bytes travel than the list contains');

  const etag = plain.headers.get('etag')!;
  assert.match(etag, /^W\//);
  const again = await get('/api/lectures', { 'if-none-match': etag });
  assert.equal(again.status, 304);
  assert.equal((await again.text()), '');
  assert.match(plain.headers.get('cache-control') ?? '', /private/);

  const only = await json('/api/lectures?courseId=physics');
  assert.deepEqual(only.body.lectures.map((l: { id: string }) => l.id), ['physics-lec3', 'physics-lec4']);
  assert.equal((await get('/api/lectures?courseId=nope')).status, 404);
  assert.equal((await json('/api/lectures?courseId=all')).body.lectures.length, body.lectures.length);
});

test('opening a published lecture returns its full transcript, chapters and working media links', async () => {
  const { status, body } = await json('/api/lectures/physics-lec3');
  assert.equal(status, 200);
  const lecture = body.lecture;
  assert.deepEqual([lecture.id, lecture.title, lecture.episode], ['physics-lec3', 'Lecture 3: Energy', 3]);
  assert.ok(lecture.segments.length > 0 && lecture.segments.every((s: { transcript: string }) => s.transcript.length > 0));
  assert.ok(lecture.segments.some((s: { transcript: string }) => s.transcript.includes('zebracorn')));
  for (const url of [lecture.mediaUrl, lecture.captionsUrl, lecture.chaptersUrl]) assert.equal((await get(url)).status, 200, url);
  assert.equal((await get('/api/lectures/physics-lec99')).status, 404);
  assert.equal((await json('/api/lectures/physics-lec3/summary')).body.summary, null, 'no summary generated yet');
  mkdirSync(join(f.coursesDir, 'physics', 'qa', 'summaries'), { recursive: true });
  writeFileSync(join(f.coursesDir, 'physics', 'qa', 'summaries', 'lec3.json'), JSON.stringify({ overview: 'About energy.', sections: [], takeaways: ['Energy is conserved.'] }));
  assert.equal((await json('/api/lectures/physics-lec3/summary')).body.summary.overview, 'About energy.');
});

test('video is streamed in pieces, never sent whole unless asked: ranges, HEAD and headers', async () => {
  const url = '/media/courses/physics/lectures/lec3.mp4';
  const whole = await get(url);
  assert.deepEqual([whole.status, whole.headers.get('content-type'), whole.headers.get('x-content-type-options'), whole.headers.get('accept-ranges')], [200, 'video/mp4', 'nosniff', 'bytes']);
  const size = (await whole.arrayBuffer()).byteLength;
  assert.equal(size, 5012);
  const part = await get(url, { range: 'bytes=0-9' });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), `bytes 0-9/${size}`);
  assert.equal((await part.arrayBuffer()).byteLength, 10, 'only the requested bytes travel');
  const tail = await get(url, { range: 'bytes=5000-' });
  assert.equal((await tail.arrayBuffer()).byteLength, size - 5000);
  const head = await fetch(base + url, { method: 'HEAD', headers: { cookie } });
  assert.deepEqual([head.status, head.headers.get('content-length')], [200, String(size)]);
  assert.equal((await get(url, { range: 'bytes=99999-' })).status, 416);
});

test('captions come out as WebVTT even from an SRT transcript, and chapter markers are served', async () => {
  const captions = await get('/media/courses/physics/captions/lec4.vtt');
  assert.deepEqual([captions.status, captions.headers.get('content-type')], [200, 'text/vtt; charset=utf-8']);
  const text = await captions.text();
  assert.match(text, /^WEBVTT\n\n00:00:00\.000 --> 00:00:18\.000\nSentence 0 about quokkawave\./);
  assert.ok(!text.includes(','));
  const chapters = await get('/media/courses/physics/chapters/lec3.chapters.vtt');
  assert.match(await chapters.text(), /^WEBVTT/);
  assert.equal((await get('/media/courses/physics/lectures/lec4.mp4')).status, 404, 'lecture 4 has no video');
});

test('only exact, published, approved files are served: traversal, odd names, other courses and removed lectures all give 404', async () => {
  const bad = [
    '/media/courses/physics/lectures/lec3.mp4.bak', '/media/courses/physics/lectures/lec03.mp4', '/media/courses/physics/lectures/LEC3.mp4',
    '/media/courses/physics/lectures/lec3.vtt', '/media/courses/physics/lectures/index.json', '/media/courses/physics/qa/index.json',
    '/media/courses/physics/captions/lec3.srt', '/media/courses/physics/captions/lec99.vtt', '/media/courses/physics/chapters/lec3.json',
    '/media/courses/Physics/lectures/lec3.mp4', '/media/courses/..%2fphysics/lectures/lec3.mp4', '/media/courses/%2e%2e/lectures/lec3.mp4',
    '/media/courses/physics/..%2fqa%2findex.json', '/media/courses/physics/lectures/..%2f..%2fqa%2findex.json', '/media/courses/physics/lectures/%2e%2e%2f%2e%2e%2fqa%2findex.json',
    '/media/courses/linear-algebra-vectors-matrices-and-eigenvalues/lectures/lec1.mp4', '/media/courses/computer-architecture/lectures/lec3.mp4',
    '/media/courses/physics/lectures', '/media/courses/physics', '/media/courses/physics/lectures/%00lec3.mp4',
  ];
  for (const path of bad) { const res = await raw(path); assert.notEqual(res.status, 200, path); assert.ok(!/"version"|"chapters"/.test(res.text), `${path} leaked the index`); }
  f.db.prepare("UPDATE submissions SET status='removed' WHERE courseId='physics' AND number=4").run();
  assert.equal((await get('/media/courses/physics/captions/lec4.vtt')).status, 404, 'a removed lecture is gone at once');
  f.db.prepare("UPDATE submissions SET status='approved' WHERE courseId='physics' AND number=4").run();
  f.db.prepare("UPDATE courses SET status='archived' WHERE id='physics'").run();
  assert.equal((await get('/media/courses/physics/lectures/lec3.mp4')).status, 404, 'an archived course is hidden');
  assert.ok(!(await json('/api/courses')).body.courses.some((c: { id: string }) => c.id === 'physics'));
  f.db.prepare("UPDATE courses SET status='active' WHERE id='physics'").run();
});

test('search covers published courses, and stays inside the course it was asked about', async () => {
  const hit = await ask('zebracorn', 'physics');
  assert.ok(hit.sources.length > 0, 'the new lecture is searchable');
  assert.ok(hit.sources.every((s: { courseId: string }) => s.courseId === 'physics'));
  assert.equal(hit.sources[0].lectureId, 'physics-lec3');
  assert.match(hit.sources[0].mediaUrl, /^\/media\/courses\/physics\/lectures\/lec3\.mp4$/);
  assert.ok(hit.sources[0].playbackUrl.includes('#t='));
  const srtHit = await ask('quokkawave', 'physics');
  assert.equal(srtHit.sources[0].lectureId, 'physics-lec4');
  assert.equal((await ask('zebracorn', 'computer-architecture')).sources.length, 0, 'not in the other course');
  const all = await ask('zebracorn', null);
  assert.ok(all.sources.some((s: { lectureId: string }) => s.lectureId === 'physics-lec3'), 'searching every course finds it too');
  assert.equal((await fetch(base + '/api/ask', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ question: 'x', courseId: 'nope' }) })).status, 404);
});

test('a lecture approved later shows up without a restart', async () => {
  const before = (await get('/api/lectures?courseId=physics', { 'accept-encoding': 'identity' })).headers.get('etag');
  f.lecture('physics', 5, { title: 'Lecture 5: Waves', transcript: vtt(6, 'narwhalpulse') });
  const after = await get('/api/lectures?courseId=physics', { 'accept-encoding': 'identity' });
  assert.notEqual(after.headers.get('etag'), before, 'the ETag moved on, so browsers reload the list');
  assert.deepEqual((await after.json() as any).lectures.map((l: { id: string }) => l.id), ['physics-lec3', 'physics-lec4', 'physics-lec5']);
  assert.equal((await json('/api/courses')).body.courses.find((c: { id: string }) => c.id === 'physics').videoCount, 3);
  assert.equal((await ask('narwhalpulse', 'physics')).sources[0].lectureId, 'physics-lec5');
  assert.equal((await get('/media/courses/physics/lectures/lec5.mp4')).status, 200);
});
