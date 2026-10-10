import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LECTURE_VISUALIZER_LINKS, lectureVisualizerAt, lectureVisualizerForMoment } from '../shared/lecture-visualizers';
import { explorationThreshold, isPlaybackAdvance, mergeWatchedInterval, watchedSeconds } from '../shared/lecture-viewing';
import { CACHE_PRESETS } from '../shared/cache';
import { PIPELINE_PRESETS } from '../shared/pipeline';

test('every visualization link matches a real chapter interval and an available teaching preset', async () => {
  const index = JSON.parse(await readFile(new URL('../qa/data/index.json', import.meta.url), 'utf8')) as {
    lectures: Record<string, { lecture: number; chapters: { id: string; start: number; end: number }[] }>;
  };
  const lectures = Object.values(index.lectures);
  for (const link of LECTURE_VISUALIZER_LINKS) {
    const lecture = lectures.find(item => `lec${item.lecture}` === link.lectureId);
    assert.ok(lecture, `missing lecture: ${link.lectureId}`);
    const chapter = lecture.chapters.find(item => `lec${lecture.lecture}-chapter-${item.id.replaceAll('.', '-')}` === link.chapterId);
    assert.ok(chapter, `missing chapter: ${link.chapterId}`);
    assert.equal(link.start, chapter.start);
    assert.equal(link.end, chapter.end);
    if (link.kind === 'pipeline') assert.ok(PIPELINE_PRESETS.some(preset => preset.id === link.presetId));
    if (link.kind === 'cache') assert.ok(CACHE_PRESETS.some(preset => preset.id === link.presetId));
    assert.equal(lectureVisualizerAt(link.lectureId, link.start)?.chapterId, link.chapterId);
    assert.equal(lectureVisualizerAt(link.lectureId, link.end - .001)?.chapterId, link.chapterId);
  }
});

test('chapter boundaries show the right concept, and advanced pipeline topics get no misleading five-stage link', () => {
  assert.equal(lectureVisualizerAt('lec11', 4720.043)?.presetId, 'forwarding');
  assert.equal(lectureVisualizerAt('lec11', 4720.044)?.presetId, 'load-use');
  assert.equal(lectureVisualizerAt('lec12', 2733.366), null); // ROB is not the five-stage model.
  assert.equal(lectureVisualizerAt('lec22', 2340.145), null); // A single read-only cache is not coherence.
  assert.equal(lectureVisualizerAt('lec99', 0), null);
  const load = LECTURE_VISUALIZER_LINKS.find(link => link.chapterId === 'lec11-chapter-11-17')!;
  assert.equal(lectureVisualizerForMoment({ lectureId: load.lectureId, chapterId: load.chapterId, start: load.start + 8 })?.presetId, 'load-use');
});

test('replaying the same seconds does not increase explored coverage', () => {
  let intervals = mergeWatchedInterval([], 50, 55);
  intervals = mergeWatchedInterval(intervals, 52, 54);
  assert.equal(watchedSeconds(intervals), 5);
  intervals = mergeWatchedInterval(intervals, 53, 60);
  assert.deepEqual(intervals, [[50, 60]]);
  assert.equal(watchedSeconds(intervals), 10);
  intervals = mergeWatchedInterval(intervals, 70, 75);
  assert.equal(watchedSeconds(intervals), 15);
  assert.deepEqual(mergeWatchedInterval(intervals, NaN, 100), intervals);
});

test('seeks, rewinds, suspended tabs and invalid rates cannot generate watch credit', () => {
  assert.equal(isPlaybackAdvance(.25, .25, 1), true);
  assert.equal(isPlaybackAdvance(.5, .25, 2), true);
  for (const [media, wall, rate] of [[15, .25, 1], [-1, .25, 1], [0, .25, 1], [5, 5, 1], [.25, 0, 1], [.25, .25, 0], [NaN, .25, 1]]) {
    assert.equal(isPlaybackAdvance(media, wall, rate), false);
  }
});

test('watch thresholds require substantive unique viewing and handle short chapters fairly', () => {
  assert.equal(explorationThreshold(0, 100), 15);
  assert.equal(explorationThreshold(100, 340), 24);
  assert.equal(explorationThreshold(0, 1200), 30);
  assert.equal(explorationThreshold(0, 10), 8);
  assert.equal(explorationThreshold(10, 10), 0);
});
