import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { validateCatalog } from '../video-pull-up/src/catalog.mjs';
import { parseSubtitles } from '../video-pull-up/src/transcripts.mjs';
import { createCatalogStore } from '../server/catalog-store';
import { catalogFingerprint, loadPublishedCourse, mergeCatalog, renderCaptions, shortName } from '../server/course-catalog';
import { loadLectureCatalog } from '../server/lecture-catalog';
import { fixture, srt, vtt } from './catalog-fixtures';

const legacy = await loadLectureCatalog();
const row = (id: string, name: string) => ({ id, name });
const quiet = async <T>(fn: () => Promise<T>) => { const w = console.warn, e = console.error; console.warn = console.error = () => {}; try { return await fn(); } finally { console.warn = w; console.error = e; } };

test('a published lecture becomes a catalog entry with media, captions, chapters and its own ids', async () => {
  const f = fixture();
  try {
    f.lecture('physics', 3, { title: 'Lecture 3: Energy' });
    const { course, lectures, skipped } = await loadPublishedCourse(f.db, f.coursesDir, row('physics', 'Physics'));
    assert.deepEqual(skipped, []);
    assert.deepEqual([course.id, course.name, course.shortName, course.videoCount, course.degree, course.studyYear], ['physics', 'Physics', 'Physics', 1, 'unspecified', 0]);
    assert.match(course.color, /^#[0-9a-f]{6}$/);
    const [lecture] = lectures;
    assert.deepEqual([lecture.id, lecture.courseId, lecture.episode, lecture.title, lecture.demo], ['physics-lec3', 'physics', 3, 'Lecture 3: Energy', false]);
    assert.deepEqual([lecture.mediaUrl, lecture.captionsUrl, lecture.chaptersUrl], ['/media/courses/physics/lectures/lec3.mp4', '/media/courses/physics/captions/lec3.vtt', '/media/courses/physics/chapters/lec3.chapters.vtt']);
    assert.deepEqual(lecture.chapters!.map(c => [c.id, c.title]), [['physics-lec3-chapter-3-1', 'Introduction'], ['physics-lec3-chapter-3-2', 'The main idea']]);
    assert.deepEqual(lecture.keywords.sort(), ['hazard', 'overview', 'pipelining']);
    assert.ok(lecture.segments.length > 0 && lecture.segments.every(s => s.id.startsWith('physics-lec3') && s.transcript));
    assert.ok(lecture.segments.some(s => s.title === 'The main idea'), 'segments carry the chapter titles');
    assert.ok(lecture.duration >= 198, 'duration covers the last cue');
    assert.doesNotThrow(() => validateCatalog({ courses: [course], lectures }));
  } finally { rmSync(f.coursesDir, { recursive: true, force: true }); }
});

test('without a video there is no media link; SRT transcripts work; long names get a short name', async () => {
  const f = fixture();
  try {
    f.lecture('physics', 1, { video: false, chapters: false, ext: 'srt' });
    const { lectures } = await loadPublishedCourse(f.db, f.coursesDir, row('physics', 'Physics'));
    assert.deepEqual([lectures[0].mediaUrl, lectures[0].chaptersUrl], [null, undefined]);
    assert.ok(lectures[0].segments.length > 0);
    assert.equal(shortName('Linear Algebra: Vectors, Matrices and Eigenvalues').length <= 28, true);
    assert.match(shortName('Linear Algebra: Vectors, Matrices and Eigenvalues'), /^Linear Algebra: Vectors,.*…$/);
    assert.equal(shortName('Physics'), 'Physics');
  } finally { rmSync(f.coursesDir, { recursive: true, force: true }); }
});

test('only approved, indexed lectures of active courses appear', async () => {
  const f = fixture();
  try {
    f.lecture('physics', 1);
    f.lecture('physics', 2, { status: 'removed' });
    f.lecture('physics', 3, { status: 'rejected' });
    f.lecture('physics', 4, { indexState: 'failed' });
    f.lecture('physics', 5, { indexState: 'queued' });
    f.lecture('physics', 6, { type: 'slides' });
    const { lectures } = await loadPublishedCourse(f.db, f.coursesDir, row('physics', 'Physics'));
    assert.deepEqual(lectures.map(l => l.episode), [1]);
  } finally { rmSync(f.coursesDir, { recursive: true, force: true }); }
});

test('a damaged lecture is skipped and reported; it never breaks the others or the catalog', async () => {
  const f = fixture();
  try {
    f.lecture('physics', 1);
    f.lecture('physics', 2, { transcript: 'WEBVTT\n\n00:00:10.000 --> 00:00:12.000\nlate\n\n00:00:01.000 --> 00:00:02.000\nearlier than before\n' }); // decreasing starts
    f.lecture('physics', 3, { transcript: 'WEBVTT\n\nnot a cue at all\n' });
    f.lecture('physics', 4, { index: false });                // approved, but its index entry is missing
    f.lecture('physics', 5, { duration: 0 });
    rmSync(join(f.coursesDir, 'physics', 'lectures', 'lec5.vtt'));  // transcript file gone
    const { lectures, skipped } = await loadPublishedCourse(f.db, f.coursesDir, row('physics', 'Physics'));
    assert.deepEqual(lectures.map(l => l.episode), [1]);
    assert.equal(skipped.length, 4);
    assert.ok(skipped.every(line => line.startsWith('physics lecture ')));
    assert.doesNotThrow(() => mergeCatalog(legacy, [{ course: { id: 'physics', name: 'Physics', shortName: 'Physics', color: '#000000', videoCount: 1, degree: 'unspecified', studyYear: 0 }, lectures, skipped }]));
  } finally { rmSync(f.coursesDir, { recursive: true, force: true }); }
});

test('merging keeps the original course and its lectures intact and adds published courses', async () => {
  const f = fixture();
  try {
    f.lecture('physics', 1);
    f.lecture('computer-architecture', 25);
    const published = await Promise.all([row('computer-architecture', 'Digital Design & Computer Architecture'), row('physics', 'Physics')].map(r => loadPublishedCourse(f.db, f.coursesDir, r)));
    const merged = mergeCatalog(legacy, published);
    const ddca = merged.courses.find(c => c.id === 'computer-architecture')!;
    const before = legacy.courses.find(c => c.id === 'computer-architecture')!;
    assert.equal(ddca.videoCount, before.videoCount + 1);
    assert.equal(merged.courses.filter(c => c.id === 'computer-architecture').length, 1, 'no duplicate course');
    assert.ok(merged.courses.some(c => c.id === 'physics'));
    assert.equal(legacy.courses.find(c => c.id === 'computer-architecture')!.videoCount, before.videoCount, 'the input is not modified');
    for (const original of legacy.lectures) assert.ok(merged.lectures.some(l => l.id === original.id), `${original.id} still present`);
    assert.ok(merged.lectures.some(l => l.id === 'computer-architecture-lec25' && l.episode === 25));
    assert.ok(merged.lectures.some(l => l.id === 'lec7'), 'the original ids are unchanged');
    assert.deepEqual(mergeCatalog(legacy, []).lectures.length, legacy.lectures.length);
  } finally { rmSync(f.coursesDir, { recursive: true, force: true }); }
});

test('captions are generated as WebVTT from either format, with markup characters escaped', () => {
  for (const source of [vtt(3), srt(3)]) {
    const out = renderCaptions(parseSubtitles(source));
    assert.match(out, /^WEBVTT\n\n00:00:00\.000 --> 00:00:18\.000\nSentence 0 about pipelining/);
    assert.ok(!out.includes(','), 'SRT commas became dots');
  }
  const cues = parseSubtitles('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n&lt;script&gt; &amp; more\n');
  assert.match(renderCaptions(cues), /&lt;script> &amp;amp; more|&lt;script>/);
  assert.ok(!renderCaptions(cues).includes('<script'));
});

test('the store rebuilds by itself when something changes, reuses what did not, and never builds twice at once', async () => {
  const f = fixture();
  try {
    f.lecture('physics', 1);
    const store = createCatalogStore({ legacy, db: f.db, coursesDir: f.coursesDir, provider: 'local' });
    const first = await store.snapshot();
    assert.equal(first.catalog.lectures.filter(l => l.courseId === 'physics').length, 1);
    assert.equal(await store.snapshot(), first, 'unchanged: the very same snapshot');
    assert.equal(first.catalog.courses.find(c => c.id === 'linear-algebra-vectors-matrices-and-eigenvalues'), undefined, 'a course without lectures is not listed');

    f.lecture('physics', 2);
    const [a, b, c] = await Promise.all([store.snapshot(), store.snapshot(), store.snapshot()]);
    assert.ok(a === b && b === c && a !== first, 'concurrent requests share one rebuild');
    assert.deepEqual(a.catalog.lectures.filter(l => l.courseId === 'physics').map(l => l.episode), [1, 2]);

    f.lecture('linear-algebra-vectors-matrices-and-eigenvalues', 1);
    const second = await store.snapshot();
    const reused = (id: string) => (x: typeof second) => x.catalog.lectures.find(l => l.id === id);
    assert.equal(reused('physics-lec1')(second), reused('physics-lec1')(a), 'a course that did not change is not parsed again');
    assert.equal(second.catalog.courses.find(c => c.id === 'linear-algebra-vectors-matrices-and-eigenvalues')?.shortName.endsWith('…'), true);

    f.db.prepare("UPDATE courses SET status='archived' WHERE id='physics'").run();
    assert.ok(!(await store.snapshot()).catalog.courses.some(c => c.id === 'physics'), 'archiving hides the course');
    f.db.prepare("UPDATE courses SET status='active' WHERE id='physics'").run();
    f.db.prepare("UPDATE submissions SET status='removed' WHERE courseId='physics' AND number=2").run();
    assert.deepEqual((await store.snapshot()).catalog.lectures.filter(l => l.courseId === 'physics').map(l => l.episode), [1], 'removal hides the lecture');
  } finally { rmSync(f.coursesDir, { recursive: true, force: true }); }
});

test('a damaged course never freezes the others: it keeps its last good state, or is left out', async () => {
  const f = fixture();
  try {
    f.lecture('physics', 1);
    const store = createCatalogStore({ legacy, db: f.db, coursesDir: f.coursesDir, provider: 'local' });
    await store.snapshot();
    // corrupt physics' index and add a lecture to another course at the same time
    writeFileSync(join(f.coursesDir, 'physics', 'qa', 'index.json'), '{ this is not json');
    utimesSync(join(f.coursesDir, 'physics', 'qa', 'index.json'), new Date(), new Date(Date.now() + 5000));
    f.lecture('linear-algebra-vectors-matrices-and-eigenvalues', 1);
    const snap = await quiet(() => store.snapshot());
    assert.ok(snap.catalog.lectures.some(l => l.id === 'physics-lec1'), 'physics keeps its last good state');
    assert.ok(snap.catalog.lectures.some(l => l.courseId === 'linear-algebra-vectors-matrices-and-eigenvalues'), 'the other course still updated');
    assert.ok(snap.catalog.lectures.some(l => l.id === 'lec7'), 'the original course is untouched');
  } finally { rmSync(f.coursesDir, { recursive: true, force: true }); }
});

test('the lecture list keeps its shape, compresses, and gets a new ETag only when it changes', async () => {
  const f = fixture();
  try {
    f.lecture('physics', 1);
    const store = createCatalogStore({ legacy, db: f.db, coursesDir: f.coursesDir, provider: 'local' });
    const snap = await store.snapshot();
    const all = snap.list(null), physics = snap.list('physics');
    const parsed = JSON.parse(all.body.toString());
    assert.equal(parsed.provider, 'local');
    assert.equal(parsed.lectures.length, snap.catalog.lectures.length);
    assert.ok(parsed.lectures.every((l: { segments: { transcript: string }[] }) => l.segments.every(s => s.transcript === '')), 'the list carries no transcripts');
    assert.deepEqual(JSON.parse(physics.body.toString()).lectures.map((l: { id: string }) => l.id), ['physics-lec1']);
    assert.equal(gunzipSync(all.gzip).toString(), all.body.toString());
    assert.ok(all.gzip.length < all.body.length / 3, 'compression pays off');
    assert.equal(snap.list(null), all, 'serialised once per version');
    assert.notEqual(all.etag, physics.etag);
    f.lecture('physics', 2);
    assert.notEqual((await store.snapshot()).list(null).etag, all.etag);
  } finally { rmSync(f.coursesDir, { recursive: true, force: true }); }
});

test('the Q&A workspace points the tool at the right folders for each course', async () => {
  const f = fixture();
  try {
    f.lecture('physics', 1);
    const store = createCatalogStore({ legacy, db: f.db, coursesDir: f.coursesDir, provider: 'python' });
    const snap = await store.snapshot();
    assert.deepEqual(snap.workspace('physics')!.env, { QA_LECTURES_DIR: join(f.coursesDir, 'physics', 'lectures'), QA_INDEX_PATH: join(f.coursesDir, 'physics', 'qa', 'index.json') });
    assert.deepEqual(snap.workspace('computer-architecture'), { env: {} }, 'the original recordings use the tool\'s own defaults');
    assert.equal(snap.workspace('no-such-course'), null);
    assert.equal(snap.workspace('linear-algebra-vectors-matrices-and-eigenvalues'), null, 'unpublished course');
    f.lecture('computer-architecture', 25);
    const withExtra = (await store.snapshot()).workspace('computer-architecture')!;
    assert.deepEqual(Object.keys(withExtra.env).sort(), ['QA_EXTRA_INDEX_PATH', 'QA_EXTRA_LECTURES_DIR'], 'submitted DDCA lectures are added to the originals');
    const demo = legacy.courses.find(c => c.id !== 'computer-architecture')!;
    assert.deepEqual([(await store.snapshot()).workspace(demo.id)], [null], 'demo courses have no index');
  } finally { rmSync(f.coursesDir, { recursive: true, force: true }); }
});

test('the fingerprint reacts to approvals, titles and renames, not to nothing', () => {
  const f = fixture();
  try {
    const empty = catalogFingerprint(f.db);
    assert.equal(catalogFingerprint(f.db), empty);
    f.lecture('physics', 1);
    const one = catalogFingerprint(f.db);
    assert.notEqual(one, empty);
    f.db.prepare("UPDATE submissions SET title='Renamed' WHERE courseId='physics'").run();
    assert.notEqual(catalogFingerprint(f.db), one);
    f.db.prepare("UPDATE courses SET name='Physics 101' WHERE id='physics'").run();
    assert.notEqual(catalogFingerprint(f.db), one);
  } finally { rmSync(f.coursesDir, { recursive: true, force: true }); }
});
