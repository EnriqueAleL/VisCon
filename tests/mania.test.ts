import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { applyRecall, createManiaService, decayedStrength, emptyMastery, maniaIdentityFromHeaders, progressView } from '../server/mania';
import { loadWorld, type WorldBundle } from '../server/world';
import type { LearningIdentity, RecallQuest } from '../shared/world';

const DAY = 86_400_000;
const origin = Date.parse('2026-10-10T12:00:00Z');
let bundle: WorldBundle;
before(async () => { bundle = await loadWorld(); });
const student: LearningIdentity = { id: 'test-student', name: 'Test Student', source: 'guest', demo: false };
function fixture() { let now = origin; const database = new DatabaseSync(':memory:'); return { service: createManiaService(bundle, database, () => now), advance: (days: number) => { now += days * DAY; }, database }; }
function solve(service: ReturnType<typeof createManiaService>, identity = student, cityId = 'pipelining', wrong = false) {
  const quest = service.quest(identity, cityId) as RecallQuest;
  const answers = Object.fromEntries(quest.questions.map(question => {
    const answer = bundle.bank.find(item => item.id === question.id)!.answer;
    return [question.id, wrong ? question.options.find(option => option.id !== answer)!.id : answer];
  }));
  return { quest, result: service.review(identity, cityId, quest.questId, answers), answers };
}

test('recall confidence halves at its half-life and same-day repeats do not create spaced mastery', () => {
  const first = applyRecall(emptyMastery(origin), 3, 3, origin);
  assert.equal(first.spacedReviews, 1); assert.equal(first.halfLifeDays, 3);
  assert.ok(Math.abs(decayedStrength(first, origin + 3 * DAY) - 0.475) < 1e-12);
  const repeat = applyRecall(first, 3, 3, origin + 60_000);
  assert.equal(repeat.spacedReviews, 1); assert.equal(repeat.halfLifeDays, 3);
  const spaced = applyRecall(repeat, 3, 3, origin + DAY);
  assert.equal(spaced.spacedReviews, 2); assert.equal(spaced.halfLifeDays, 5.4);
  const failed = applyRecall(spaced, 1, 3, origin + 2 * DAY);
  assert.ok(failed.strength <= 0.48); assert.ok(failed.halfLifeDays < spaced.halfLifeDays);
  assert.equal(failed.mistakes, 2); assert.equal(failed.spacedReviews, 2);
  assert.equal(progressView('pipelining', failed, 19, origin + 2 * DAY).status, 'dimming');
});

test('watching alone only produces dim exploration, while quests are answer-free and cannot be replayed', () => {
  const { service, database } = fixture();
  const city = bundle.world.cities.find(item => item.id === 'pipelining')!;
  for (const chapterId of city.chapterIds) service.explore(student, city.id, chapterId);
  const explored = service.snapshot(student).cities.find(item => item.cityId === city.id)!;
  assert.equal(explored.status, 'exploring'); assert.ok(explored.strength <= 0.28); assert.equal(service.snapshot(student).readiness, 0);
  assert.throws(() => service.explore(student, city.id, 'lec1-chapter-1-4'));
  const { quest, result, answers } = solve(service);
  assert.ok(quest.questions.every(question => !('answer' in question) && !('explanation' in question)));
  assert.equal(result.passed, true); assert.equal(result.snapshot.cities.find(item => item.cityId === city.id)!.status, 'claimed');
  assert.throws(() => service.review(student, city.id, quest.questId, answers));
  const other = { ...student, id: 'another-user' };
  const fresh = service.quest(student, city.id) as RecallQuest;
  assert.throws(() => service.review(other, city.id, fresh.questId, answers));
  database.close();
});

test('incorrect answers return the exact chapter that explains the concept; invalid partial submissions preserve the quest', () => {
  const { service, database } = fixture();
  const quest = service.quest(student, 'pipelining') as RecallQuest;
  assert.throws(() => service.review(student, 'pipelining', quest.questId, {}));
  const answers = Object.fromEntries(quest.questions.map(question => [question.id, question.options.find(option => option.id !== bundle.bank.find(item => item.id === question.id)!.answer)!.id]));
  const result = service.review(student, 'pipelining', quest.questId, answers);
  assert.equal(result.passed, false); assert.equal(result.score, 0);
  const loadUse = result.results.find(item => item.source.id === 'lec11-chapter-11-17')!;
  assert.equal(loadUse.source.lectureId, 'lec11'); assert.equal(loadUse.source.start, 4720.044); assert.equal(loadUse.source.end, 4929.981);
  assert.equal(loadUse.correct, false); assert.ok(loadUse.explanation.includes('bubble'));
  database.close();
});

test('expeditions remain stable for a day and persist with independent demo progress', () => {
  const { service, database } = fixture();
  const real = service.snapshot(student), demo = { ...student, demo: true };
  assert.equal(real.expedition.stops.length, 3); assert.equal(new Set(real.expedition.stops.map(stop => stop.cityId)).size, 3);
  const preview = service.snapshot(demo); assert.ok(preview.demoNotice?.includes('simulated')); assert.ok(preview.readiness > 0);
  solve(service, demo); assert.equal(service.snapshot(student).readiness, 0);
  solve(service, student, real.expedition.stops[0].cityId);
  const after = service.snapshot(student); assert.deepEqual(after.expedition.stops, real.expedition.stops);
  assert.ok(after.expedition.completedCityIds.includes(real.expedition.stops[0].cityId));
  const reloaded = createManiaService(bundle, database, () => origin); assert.equal(reloaded.snapshot(student).readiness, after.readiness);
  service.resetDemo(demo); assert.equal(service.snapshot(student).readiness, after.readiness);
  database.close();
});

test('thriving needs spaced recalls and server-validated puzzle completion', () => {
  const { service, advance, database } = fixture();
  solve(service); advance(1); solve(service); advance(1); solve(service);
  assert.equal(service.snapshot(student).cities.find(item => item.cityId === 'pipelining')!.status, 'claimed');
  assert.equal(service.markLandmark(student, 'pipelining').cities.find(item => item.cityId === 'pipelining')!.status, 'thriving');
  advance(30); assert.equal(service.snapshot(student).cities.find(item => item.cityId === 'pipelining')!.status, 'dimming');
  database.close();
});

test('exam settings validate calendar dates and timed mixed exams cannot claim cities on one question', () => {
  const { service, advance, database } = fixture();
  assert.throws(() => service.setExam(student, '2026-02-30'));
  const configured = service.setExam(student, '2026-10-20'); assert.equal(configured.exam.daysRemaining, 10); assert.equal(configured.expedition.mode, 'mock-exam');
  const quest = service.quest(student); assert.ok('durationSeconds' in quest); assert.equal(quest.questions.length, 12);
  const answers = Object.fromEntries(quest.questions.map(question => [question.id, bundle.bank.find(item => item.id === question.id)!.answer]));
  const result = service.review(student, null, quest.questId, answers); assert.equal(result.score, 100); assert.equal(result.snapshot.readiness, 0);
  const expired = service.quest(student); advance(1); assert.throws(() => service.review(student, null, expired.questId, answers));
  assert.equal(service.setExam(student, null).exam.configured, false);
  database.close();
});

test('weather excludes simulated history and requires several actual students to show a storm', () => {
  const { service, database } = fixture();
  solve(service, { ...student, demo: true }, 'pipelining', true);
  assert.equal(service.cityWeather().find(item => item.cityId === 'pipelining')!.totalAnswers, 0);
  for (let i = 0; i < 3; i++) solve(service, { ...student, id: `actual-${i}` }, 'pipelining', true);
  const weather = service.cityWeather().find(item => item.cityId === 'pipelining')!;
  assert.equal(weather.students, 3); assert.equal(weather.totalAnswers, 9); assert.equal(weather.wrongRate, 1); assert.equal(weather.storm, true);
  database.close();
});

test('proxy identity headers are ignored unless trust is explicitly configured and optionally IP-scoped', () => {
  const previousTrust = process.env.MANIA_TRUST_PROXY, previousIps = process.env.MANIA_TRUSTED_PROXY_IPS;
  try {
    delete process.env.MANIA_TRUST_PROXY; delete process.env.MANIA_TRUSTED_PROXY_IPS;
    const headers = { 'x-user-id': 'student-42', 'x-user-name': 'ETH Student' };
    assert.equal(maniaIdentityFromHeaders(headers, '127.0.0.1'), null);
    process.env.MANIA_TRUST_PROXY = 'true'; process.env.MANIA_TRUSTED_PROXY_IPS = '127.0.0.1';
    assert.equal(maniaIdentityFromHeaders(headers, '192.0.2.1'), null);
    assert.deepEqual(maniaIdentityFromHeaders(headers, '::ffff:127.0.0.1'), { id: 'proxy:student-42', name: 'ETH Student', source: 'proxy', demo: false });
    assert.equal(maniaIdentityFromHeaders({ ...headers, 'x-user-id': '<bad>' }, '127.0.0.1'), null);
  } finally {
    if (previousTrust === undefined) delete process.env.MANIA_TRUST_PROXY; else process.env.MANIA_TRUST_PROXY = previousTrust;
    if (previousIps === undefined) delete process.env.MANIA_TRUSTED_PROXY_IPS; else process.env.MANIA_TRUSTED_PROXY_IPS = previousIps;
  }
});
