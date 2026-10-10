import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadWorld, excludedChapterIds, examInfo, type WorldBundle } from '../server/world';

let bundle: WorldBundle;
before(async () => { bundle = await loadWorld(); });

test('world covers each non-administrative real chapter exactly once at its original timestamp', async () => {
  const index = JSON.parse(await readFile('qa/data/index.json', 'utf8')) as { lectures: Record<string, { chapters: { id: string; start: number; end: number }[] }> };
  const originals = Object.values(index.lectures).flatMap(lecture => lecture.chapters);
  const moments = bundle.world.cities.flatMap(city => city.chapters);
  assert.equal(bundle.world.stats.lectures, 24);
  assert.equal(bundle.world.cities.length, 24);
  assert.equal(new Set(moments.map(moment => moment.id)).size, moments.length);
  assert.equal(moments.length, originals.filter(chapter => !excludedChapterIds.has(chapter.id)).length);
  assert.equal(bundle.world.stats.totalChapters, originals.length);
  for (const chapter of originals) {
    const moment = moments.find(item => item.id === `lec${chapter.id.split('.')[0]}-chapter-${chapter.id.replace('.', '-')}`);
    if (excludedChapterIds.has(chapter.id)) assert.equal(moment, undefined);
    else { assert.ok(moment); assert.equal(moment.start, chapter.start); assert.equal(moment.end, chapter.end); assert.ok(moment.end > moment.start); }
  }
  assert.ok(bundle.world.planets.filter(planet => !planet.available).every(planet => planet.description.includes('Coming soon')));
});

test('every city has three anchored recall questions and all prerequisite roads connect actual cities', () => {
  for (const city of bundle.world.cities) {
    assert.ok(city.chapters.length > 0);
    assert.ok(Math.abs(city.position.reduce((sum, value) => sum + value * value, 0) - 1) < 1e-9);
    const questions = bundle.bank.filter(question => question.cityId === city.id);
    assert.equal(questions.length, 3);
    for (const question of questions) {
      assert.ok(city.chapterIds.includes(question.source.id));
      assert.equal(question.options.length, 4);
      assert.ok(question.options.some(option => option.id === question.answer));
      assert.ok(question.explanation.length > 30);
    }
  }
  for (const road of bundle.world.roads) {
    assert.ok(bundle.world.cities.some(city => city.id === road.from));
    assert.ok(bundle.world.cities.some(city => city.id === road.to));
    assert.notEqual(road.from, road.to);
  }
});

test('exam countdown uses a configured real date and switches to mock exam in the final fortnight', () => {
  const now = Date.parse('2026-10-10T12:00:00Z');
  assert.equal(examInfo(now, '2026-10-20').daysRemaining, 10);
  assert.equal(examInfo(now, '2026-10-20').mockExamMode, true);
  assert.equal(examInfo(now, '2026-11-20').mockExamMode, false);
  assert.equal(examInfo(now, 'invalid').configured, false);
});

// These mixed announcement/Q&A chapters also contain substantive instruction.
// Guard against excluding them by title when maintaining the administrative list.
test('mixed openings retain instructional recaps and memory-layout Q&A', () => {
  const expected = { '5.1': 'hdl-fpga', '6.2': 'hdl-fpga', '7.1': 'timing', '8.4': 'isa', '11.1': 'pipelining' };
  for (const [rawId, cityId] of Object.entries(expected)) {
    const chapterId = `lec${rawId.split('.')[0]}-chapter-${rawId.replace('.', '-')}`;
    assert.equal(bundle.chapterCity.get(chapterId), cityId);
  }
  assert.equal(bundle.world.stats.contentChapters, 463);
  assert.equal(bundle.world.stats.excludedChapters, 49);
});
