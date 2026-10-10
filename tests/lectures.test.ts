import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadLectureCatalog, lecturePreview, readSummary, type LectureCatalog } from '../server/lecture-catalog';
import { createAnswerService } from '../video-pull-up/src/answers.mjs';
import { qaAnswer } from '../server/lecture-qa';

let catalog: LectureCatalog;
before(async () => { catalog = await loadLectureCatalog(); });

test('repository index, VTTs and demo videos coexist with original timestamps', async () => {
  const index = JSON.parse(await readFile('qa/data/index.json', 'utf8'));
  const recordings = catalog.lectures.filter(lecture => !lecture.demo);
  assert.equal(recordings.length, Object.keys(index.lectures).length);
  assert.equal(catalog.lectures.filter(lecture => lecture.demo).length, 3);
  for (const lecture of recordings) {
    assert.deepEqual(lecture.chapters?.map(chapter => chapter.start), index.lectures[String(lecture.episode)].chapters.map((chapter: { start: number }) => chapter.start));
    assert.ok(lecture.segments.every(segment => segment.cues?.length && segment.transcript.length));
    assert.ok(lecturePreview(lecture).segments.every(segment => !segment.transcript && !('cues' in segment)));
  }
});

test('search finds grounded real and demo moments, scopes courses, and returns honest misses', async () => {
  const ask = createAnswerService(catalog);
  const real = await ask({ question: 'MIPS byte addressable' });
  assert.equal(real.status, 'answered');
  assert.equal(real.sources[0].lectureId, 'lec7');
  assert.ok(real.sources[0].start > 1700 && real.sources[0].start < 2100);
  assert.equal(real.sources[0].demo, false);
  const pipeline = await ask({ question: 'pipelining hazards' });
  assert.ok(pipeline.sources.length);
  assert.ok(pipeline.sources[0].transcript.toLowerCase().includes('hazard'));
  assert.equal(pipeline.sources[0].lectureId, 'lec11');
  const demo = await ask({ question: 'Eigenwerte und Eigenvektoren', courseId: 'linear-algebra' });
  assert.ok(demo.sources.length);
  assert.ok(demo.sources.every(source => source.demo && source.start < 90));
  const scoped = await ask({ question: 'MIPS', lectureId: 'lec7' });
  assert.ok(scoped.sources.every(source => source.lectureId === 'lec7'));
  assert.equal((await ask({ question: 'quasar xylophone' })).status, 'no_match');
  await assert.rejects(ask({ question: 'MIPS', lectureId: 'lec7', courseId: 'analysis' }));
});

test('cached lecture notes are available without starting a model', async () => {
  assert.ok((await readSummary('lec1'))?.sections.length);
  assert.equal(await readSummary('lec2'), null);
  assert.equal(await readSummary('../../.env'), null);
});

test('Python Q&A adapter rejects out-of-range or cross-lecture answers', () => {
  const request = { question: 'MIPS', courseId: 'computer-architecture', lectureId: 'lec7' };
  const raw = { found: true, answer: 'Transcript-grounded answer.', lecture: 7, start: 1790.721, end: 1830, chapter: 'Addressability' };
  const answer = qaAnswer(raw, request, catalog);
  assert.equal(answer.sources[0].start, raw.start);
  assert.equal(answer.sources[0].mediaUrl, catalog.lectures.find(item => item.id === 'lec7')!.mediaUrl);
  assert.ok(!JSON.stringify(answer).includes('/Users/'));
  assert.throws(() => qaAnswer({ ...raw, start: -1 }, request, catalog));
  assert.throws(() => qaAnswer({ ...raw, end: 999999 }, request, catalog));
  assert.throws(() => qaAnswer({ ...raw, lecture: 8 }, request, catalog));
  assert.equal(qaAnswer({ ...raw, found: false }, request, catalog).sources.length, 0);

  // An explanation adds a separate, unlinked and labelled paragraph; a plain lookup never does.
  const explained = qaAnswer({ ...raw, intent: 'explain', background: 'MIPS is a RISC instruction set.' }, request, catalog);
  assert.equal(explained.answer.paragraphs.length, 2);
  assert.deepEqual(explained.answer.paragraphs[0].sourceIds, ['S1']);
  assert.deepEqual(explained.answer.paragraphs[1].sourceIds, []);
  assert.match(explained.answer.paragraphs[1].text, /allgemeinem Wissen/);
  assert.equal(qaAnswer({ ...raw, intent: 'find', background: 'ignored' }, request, catalog).answer.paragraphs.length, 1);
  // Labels follow the language the answer was written in, so English answers do not carry a German label.
  const english = qaAnswer({ ...raw, intent: 'explain', background: 'MIPS is a RISC instruction set.', language: 'en' }, request, catalog);
  assert.match(english.answer.paragraphs[1].text, /^In addition, from general knowledge/);
  assert.match(english.answer.notice, /^AI answer/);
  assert.match(explained.answer.paragraphs[1].text, /^Zusätzlich/);
});
