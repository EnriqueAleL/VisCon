import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadCatalog, validateCatalog } from '../src/catalog.mjs';
import { createAnswerService, createOllamaExplainer } from '../src/answers.mjs';
import { parseSubtitles, chunkCues } from '../src/transcripts.mjs';
import { pullUpVideo } from '../client/client.mjs';

const catalog = await loadCatalog(new URL('../data/demo-catalog.json', import.meta.url));
const ask = createAnswerService(catalog);

test('calculation question opens the computation section, with a cited explanation', async () => {
  const response = await ask({ question: 'Wie berechne ich Eigenwerte und Eigenvektoren?' });
  assert.equal(response.status, 'answered');
  assert.equal(response.sources[0].segmentId, 'eigenvalues-computation');
  assert.equal(response.playback.start, 30);
  assert.equal(response.playback.url, '/media/eigenvalues-introduction.mp4#t=30');
  assert.match(response.answer.text, /det\(A − λI\) = 0/);
  assert.deepEqual(response.answer.paragraphs[0].sourceIds, ['S1']);
  assert.equal(response.videos[0].segments[0].start, 30);
});

test('chain rule questions prefer the introduction over its later application', async () => {
  for (const question of ['Wie funktioniert die Kettenregel?', 'How do I use the chain rule?']) {
    const response = await ask({ question, courseId: 'analysis' });
    assert.equal(response.sources[0].segmentId, 'derivatives-chain-rule');
    assert.equal(response.playback.start, 30);
    assert.ok(response.sources.every(source => source.courseId === 'analysis'));
  }
});

test('recursion question links the explanation of a base case', async () => {
  const response = await ask({ question: 'Warum braucht Rekursion einen Basisfall?', lectureId: 'recursion' });
  assert.equal(response.sources[0].segmentId, 'recursion-base-case');
  assert.match(response.answer.text, /Basisfall/);
  assert.ok(response.sources.every(source => source.lectureId === 'recursion'));
});

test('missing topics, intent-only terms and an excluded lecture yield no fabricated answer', async () => {
  for (const request of [
    { question: 'Was sind Quantenfelder?' }, { question: 'Wie berechne ich Quantenfelder?' },
    { question: 'Wie berechne ich?' }, { question: 'Wie funktioniert die Kettenregel?', lectureId: 'recursion' },
    { question: 'Wie berechne ich Eigenwerte?', courseId: 'informatics' },
  ]) {
    const response = await ask(request);
    assert.equal(response.status, 'no_match');
    assert.equal(response.answer.text, '');
    assert.deepEqual(response.sources, []);
    assert.equal(response.playback, null);
  }
});

test('invalid input and inconsistent course/lecture scopes are rejected', async () => {
  for (const request of [null, [], { question: '' }, { question: 123 }, { question: 'a'.repeat(2001) },
    { question: 'Eigenwerte', limit: 100 }, { question: 'Eigenwerte', courseId: 'does-not-exist' },
    { question: 'Eigenwerte', lectureId: 'missing' }, { question: 'Eigenwerte', courseId: 'analysis', lectureId: 'recursion' }]) {
    await assert.rejects(() => ask(request));
  }
});

test('a broad shared term cannot claim an answer to an unsupported specific question', async () => {
  const integral = await ask({ question: 'Wie berechne ich das Integral von x²?' });
  assert.equal(integral.status, 'no_match');
  for (const question of ['Was ist die Ableitung von ln(x)?', 'Warum ist Rekursion schneller als Iteration?']) {
    const result = await ask({ question });
    assert.equal(result.status, 'insufficient_context');
    assert.equal(result.answer.text, '');
    assert.ok(result.sources.length);
  }
});

test('WebVTT import preserves millisecond timestamps, metadata, settings and overlapping cues', () => {
  const cues = parseSubtitles('\uFEFFWEBVTT\r\n\r\nNOTE sample\r\nignored\r\n\r\none\r\n00:01.500 --> 00:05.000 align:start\r\n<v Lecturer>Eigenwerte &amp; Eigenvektoren</v>\r\n\r\n00:04.000 --> 00:08.000\r\nÜberlappung erlaubt.');
  assert.deepEqual(cues, [
    { start: 1.5, end: 5, text: 'Eigenwerte & Eigenvektoren' },
    { start: 4, end: 8, text: 'Überlappung erlaubt.' },
  ]);
  assert.equal(parseSubtitles('1\n00:12:10,125 --> 00:12:20,250\nDie Kettenregel.')[0].start, 730.125);
});

test('invalid transcript timing and empty transcripts fail import', () => {
  for (const transcript of ['WEBVTT', '1\n00:00:05.000 --> 00:00:01.000\nText',
    '1\n00:61:00.000 --> 00:62:00.000\nText', 'Kein Zeitstempel',
    '00:02.000 --> 00:04.000\nText\n\n00:01.000 --> 00:03.000\nText']) {
    assert.throws(() => parseSubtitles(transcript));
  }
});

test('imported windows jump to the matching original subtitle, rather than the window start', async () => {
  const cues = parseSubtitles(await readFile(new URL('../examples/lecture.vtt', import.meta.url), 'utf8'));
  const segments = chunkCues(cues, 'analysis-week-1');
  assert.equal(segments.length, 2);
  assert.equal(segments[0].start, 720);
  const imported = structuredClone(catalog);
  imported.lectures = [{ id: 'analysis-week-1', courseId: 'analysis', title: 'Analysis', duration: 3600,
    mediaUrl: 'https://media.example.edu/lecture.mp4?token=example', segments }];
  validateCatalog(imported);
  const response = await createAnswerService(imported)({ question: 'Kettenregel' });
  assert.equal(response.sources[0].contextStart, 720);
  assert.equal(response.playback.start, 730);
  assert.equal(response.playback.url, 'https://media.example.edu/lecture.mp4?token=example#t=730');
});

test('bad catalog timings, duplicate IDs and executable media URLs are rejected', () => {
  for (const mutate of [
    value => { value.lectures[0].segments[0].end = 9999; },
    value => { value.lectures[0].segments[0].start = -1; },
    value => { value.lectures[0].segments[1].id = value.lectures[0].segments[0].id; },
    value => { delete value.lectures[0].id; },
    value => { value.courses[0].id = 123; },
    value => { value.lectures[0].mediaUrl = 'javascript:alert(1)'; },
    value => { value.lectures[0].mediaUrl = '/media/../secret'; },
  ]) {
    const value = structuredClone(catalog); mutate(value); assert.throws(() => validateCatalog(value));
  }
});

test('a missing video preserves cited transcript explanations but returns no playback URL', async () => {
  const value = structuredClone(catalog); value.lectures[0].mediaUrl = null;
  const response = await createAnswerService(value)({ question: 'Eigenwerte berechnen' });
  assert.equal(response.status, 'answered');
  assert.ok(response.answer.text);
  assert.equal(response.playback, null);
  assert.equal(response.sources[0].playbackUrl, null);
});

function mockProvider(answer, options = {}) {
  return createOllamaExplainer({ model: 'test-model', fetchImpl: async (url, request) => {
    assert.equal(String(url), 'http://127.0.0.1:11434/api/chat');
    const body = JSON.parse(request.body);
    assert.equal(body.stream, false);
    assert.equal(body.format.type, 'object');
    assert.match(body.messages[1].content, /Transkript|det\(A/);
    return { ok: true, json: async () => ({ message: { content: JSON.stringify(answer) } }), ...options };
  } });
}

test('local model returns a cited explanation and invalid citations fall back to transcripts', async () => {
  const generated = await createAnswerService(catalog, { explain: mockProvider({ supported: true,
    paragraphs: [{ text: 'Bestimme zuerst die Nullstellen des charakteristischen Polynoms.', sourceIds: ['S1'] }] }) })({ question: 'Eigenwerte berechnen' });
  assert.equal(generated.answer.mode, 'generated');
  assert.deepEqual(generated.answer.paragraphs[0].sourceIds, ['S1']);
  const invalid = await createAnswerService(catalog, { explain: mockProvider({ supported: true,
    paragraphs: [{ text: 'Erfundene Quelle', sourceIds: ['S999'] }] }) })({ question: 'Eigenwerte berechnen' });
  assert.equal(invalid.answer.mode, 'extractive_fallback');
  assert.doesNotMatch(invalid.answer.text, /Erfundene Quelle/);
  assert.match(invalid.answer.text, /det\(A/);
});

test('model outage falls back and insufficient evidence is explicitly reported', async () => {
  const unavailable = await createAnswerService(catalog, { explain: async () => { throw new Error('timeout'); } })({ question: 'Eigenwerte berechnen' });
  assert.equal(unavailable.answer.mode, 'extractive_fallback');
  const abstained = await createAnswerService(catalog, { explain: mockProvider({ supported: false, paragraphs: [] }) })({ question: 'Eigenwerte berechnen' });
  assert.equal(abstained.status, 'insufficient_context');
  assert.equal(abstained.answer.text, '');
  assert.ok(abstained.sources.length);
});

class FakeVideo extends EventTarget {
  src = ''; readyState = 0; duration = 90; currentTime = 0; paused = true;
  pause() { this.paused = true; }
  load() { this.readyState = 0; }
  async play() { this.paused = false; }
  metadata() { this.readyState = 1; this.dispatchEvent(new Event('loadedmetadata')); }
}

test('player waits for metadata, cancels stale selections and preserves exact start', async () => {
  const video = new FakeVideo();
  const first = pullUpVideo(video, { mediaUrl: '/media/a.mp4', start: 30 });
  assert.equal(video.currentTime, 0);
  const second = pullUpVideo(video, { mediaUrl: '/media/b.mp4', start: 60 });
  assert.equal((await first).cancelled, true);
  video.metadata();
  assert.deepEqual(await second, { cancelled: false, playing: false });
  assert.equal(video.currentTime, 60);
  await assert.rejects(() => pullUpVideo(video, { mediaUrl: '/media/b.mp4', start: 91 }), /ausserhalb/);
});

test('autoplay rejection leaves the video at the correct time with native controls usable', async () => {
  const video = new FakeVideo(); video.readyState = 1; video.src = 'http://localhost/media/a.mp4';
  video.play = async () => { throw new Error('NotAllowedError'); };
  const result = await pullUpVideo(video, { mediaUrl: '/media/a.mp4', start: 30 }, { autoplay: true });
  assert.deepEqual(result, { cancelled: false, playing: false });
  assert.equal(video.currentTime, 30);
});
