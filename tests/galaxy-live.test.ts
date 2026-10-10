import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createGalaxyLive, difficultyOf, HERE_TTL, MIN_WEIGHT, type ChapterQuiz } from '../server/galaxy-live';

const chapters: Record<string, string[]> = { lec1: ['lec1-chapter-1-1', 'lec1-chapter-1-2'], lec2: ['lec2-chapter-2-1'] };
function fixture(quiz = new Map<string, ChapterQuiz>()) {
  let now = Date.parse('2026-10-10T12:00:00Z');
  const live = createGalaxyLive({
    db: new DatabaseSync(':memory:'), clock: () => now, quiz: () => quiz,
    knows: (lectureId, chapterId) => !!chapters[lectureId] && (chapterId === null || chapters[lectureId].includes(chapterId)),
  });
  return { live, advance: (ms: number) => { now += ms; } };
}

test('presence counts each student once, by lecture and chapter, and forgets the silent', async () => {
  const { live, advance } = fixture();
  await live.setHere('a', { lectureId: 'lec1', chapterId: 'lec1-chapter-1-2' });
  await live.setHere('b', { lectureId: 'lec1', chapterId: 'lec1-chapter-1-2' });
  await live.setHere('b', { lectureId: 'lec1', chapterId: 'lec1-chapter-1-2' });
  await live.setHere('c', { lectureId: 'lec2' });
  let view = live.snapshot('a');
  assert.deepEqual(view.online.lectures, { lec1: 2, lec2: 1 });
  assert.deepEqual(view.online.chapters, { 'lec1-chapter-1-2': 2 });

  await live.setHere('a', { lectureId: null });
  advance(HERE_TTL + 1);
  await live.setHere('c', { lectureId: 'lec2' });
  view = live.snapshot('c');
  assert.deepEqual(view.online.lectures, { lec2: 1 }, 'a left, b timed out');
});

test('presence and ratings refuse ids the catalogue does not know', async () => {
  const { live } = fixture();
  await assert.rejects(live.setHere('a', { lectureId: 'lec9' }), /Unknown lecture/);
  await assert.rejects(live.setHere('a', { lectureId: 'lec1', chapterId: 'lec2-chapter-2-1' }), /Unknown lecture/);
  await assert.rejects(live.setHere('a', { lectureId: '<script>' }), /Invalid lecture/);
  await assert.rejects(live.rate('a', { lectureId: 'lec1', chapterId: 'lec1-chapter-1-1', rating: 6 }), /1 \(easy\) to 5/);
  await assert.rejects(live.rate('a', { lectureId: 'lec1', chapterId: 'lec1-chapter-1-1', rating: 2.5 }), /1 \(easy\) to 5/);
});

test('a chapter has no weather until there is enough evidence, then ratings decide it', async () => {
  const { live } = fixture();
  const chapter = { lectureId: 'lec1', chapterId: 'lec1-chapter-1-1' };
  for (const [who, rating] of [['a', 5], ['b', 4]] as const) await live.rate(who, { ...chapter, rating });
  assert.equal(live.snapshot('a').difficulty.chapters['lec1-chapter-1-1'].score, null, `below ${MIN_WEIGHT} votes`);
  assert.equal(live.snapshot('a').difficulty.lectures.lec1, undefined);

  await live.rate('c', { ...chapter, rating: 3 });
  const view = live.snapshot('a');
  assert.equal(view.difficulty.chapters['lec1-chapter-1-1'].score, 4);
  assert.deepEqual(view.difficulty.lectures.lec1, { score: 4, weight: 3 });
  assert.deepEqual(view.mine, { 'lec1-chapter-1-1': 5 });

  await live.rate('a', { ...chapter, rating: 1 });   // changing your mind replaces your vote
  assert.equal(live.snapshot('a').difficulty.chapters['lec1-chapter-1-1'].votes, 3);
  assert.equal(live.snapshot('a').difficulty.chapters['lec1-chapter-1-1'].score, 2.7);
});

test('recall mistakes count as evidence alongside ratings', () => {
  assert.deepEqual(difficultyOf(0, 0, { answers: 25, wrongRate: 0.6 }), { score: 5, weight: 5, votes: 0 });
  assert.deepEqual(difficultyOf(0, 0, { answers: 25, wrongRate: 0 }), { score: 1, weight: 5, votes: 0 });
  assert.equal(difficultyOf(0, 0, { answers: 5, wrongRate: 0.9 }).score, null, 'five answers alone are not enough');
  assert.equal(difficultyOf(2 * 3, 3, { answers: 15, wrongRate: 0.6 }).score, 3.5);
});

test('quiz evidence reaches lectures the ratings never touched', () => {
  const { live } = fixture(new Map([['lec2-chapter-2-1', { answers: 40, wrongRate: 0.3 }]]));
  const view = live.snapshot('a');
  assert.equal(view.difficulty.chapters['lec2-chapter-2-1'].score, 3);
  assert.deepEqual(view.difficulty.lectures.lec2, { score: 3, weight: 5 });
});
