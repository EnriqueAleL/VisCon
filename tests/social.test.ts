import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import type { LearningIdentity, WorldData } from '../shared/world';
import { PIPELINE_PUZZLES } from '../shared/pipeline';

process.env.DATABASE_PATH = ':memory:';
const { createSocialService, validateSharedState, weekStart } = await import('../server/social');
const student = (id: string, demo = false): LearningIdentity => ({ id, name: `Student ${id}`, source: 'guest', demo });
const world = { cities: [{ id: 'pipelining', visualizer: 'pipeline' }, { id: 'caches', visualizer: 'cache' }, { id: 'virtual-memory', visualizer: 'virtual-memory' }] } as unknown as WorldData;
function fixture() {
  const database = new DatabaseSync(':memory:');
  let now = Date.parse('2026-10-10T12:00:00Z');
  const solved: string[] = [];
  const make = () => createSocialService({ database, world: () => world, clock: () => now, landmarkSolved: (userId, cityId) => solved.push(`${userId}:${cityId}`) });
  return { database, service: make(), make, solved, advance: (ms: number) => { now += ms; }, now: () => now };
}
const optimumOrder = ['i1', 'i3', 'i5', 'i2', 'i4', 'i6', 'i7', 'i8'];
const perfectCache = Array.from({ length: 16 }, (_, index) => [0, 32, 64][index % 3]);

test('server computes puzzle scores, consumes attempts once and marks only optimum landmarks', () => {
  const { service, database, advance, solved } = fixture();
  try {
    const ada = student('ada');
    const session = service.startPuzzle(ada, 'pipeline-reorder');
    advance(12_000);
    const result = service.submitPuzzle(ada, 'pipeline-reorder', { sessionId: session.sessionId, orderIds: optimumOrder, score: 999_999, cycles: 1 });
    assert.equal(result.score.cycles, PIPELINE_PUZZLES[0].optimumCycles);
    assert.equal(result.score.score, 8800);
    assert.equal(result.personalBest.elapsedMs, 12_000);
    assert.equal(result.mayor?.userId, 'ada');
    assert.deepEqual(solved, ['ada:pipelining']);
    assert.throws(() => service.submitPuzzle(ada, 'pipeline-reorder', { sessionId: session.sessionId, orderIds: optimumOrder }), /already submitted/);
    const cache = service.startPuzzle(ada, 'cache-conflict');
    const cacheResult = service.submitPuzzle(ada, 'cache-conflict', { sessionId: cache.sessionId, addresses: perfectCache, score: 1_000_000 });
    assert.equal(cacheResult.score.score, 16);
    assert.equal(cacheResult.score.hits, 0);
    assert.equal(service.globalBoard()[0].normalizedScore, 2000);
    assert.deepEqual(solved, ['ada:pipelining', 'ada:caches']);
  } finally { database.close(); }
});

test('ownership, expiry, superseded attempts and dependency violations cannot reach a leaderboard', () => {
  const { service, database, advance } = fixture();
  try {
    const ada = student('ada'), bob = student('bob');
    const original = service.startPuzzle(ada, 'pipeline-reorder');
    assert.throws(() => service.submitPuzzle(bob, 'pipeline-reorder', { sessionId: original.sessionId, orderIds: optimumOrder }), /does not belong/);
    assert.throws(() => service.submitPuzzle(ada, 'pipeline-reorder', { sessionId: original.sessionId, orderIds: [...optimumOrder].reverse() }), /must precede/);
    assert.equal(service.board('pipeline-reorder').length, 0);
    const replacement = service.startPuzzle(ada, 'pipeline-reorder');
    assert.throws(() => service.submitPuzzle(ada, 'pipeline-reorder', { sessionId: original.sessionId, orderIds: optimumOrder }), /already submitted/);
    advance(60_001);
    assert.throws(() => service.submitPuzzle(ada, 'pipeline-reorder', { sessionId: replacement.sessionId, orderIds: optimumOrder }), /Time is up/);
    assert.equal(service.board('pipeline-reorder').length, 0);
    assert.throws(() => service.startPuzzle(student('demo', true), 'cache-conflict'), /demo profile/);
  } finally { database.close(); }
});

test('leaderboard keeps one best score per person, resolves equal scores by server time and uses UTC weeks', () => {
  const { service, database, advance, now } = fixture();
  try {
    const ada = student('ada'), bob = student('bob');
    const first = service.startPuzzle(ada, 'cache-conflict'); advance(20_000);
    service.submitPuzzle(ada, 'cache-conflict', { sessionId: first.sessionId, addresses: perfectCache });
    const slow = service.startPuzzle(ada, 'cache-conflict'); advance(40_000);
    service.submitPuzzle(ada, 'cache-conflict', { sessionId: slow.sessionId, addresses: perfectCache });
    const faster = service.startPuzzle(bob, 'cache-conflict'); advance(10_000);
    service.submitPuzzle(bob, 'cache-conflict', { sessionId: faster.sessionId, addresses: perfectCache });
    assert.equal(service.board('cache-conflict').length, 2);
    assert.equal(service.mayor('cache-conflict')?.userId, 'bob');
    assert.equal(service.personalScore('ada', 'cache-conflict')?.elapsedMs, 20_000);
    assert.equal(new Date(weekStart(now())).toISOString(), '2026-10-05T00:00:00.000Z');
    advance(8 * 86_400_000);
    assert.equal(service.board('cache-conflict', 'week').length, 0);
    assert.equal(service.board('cache-conflict', 'all').length, 2);
  } finally { database.close(); }
});

test('presence deduplicates tabs and excludes explicitly labelled demo connections', () => {
  const { service, database } = fixture();
  try {
    service.connect('tab-1', student('ada')); service.connect('tab-2', student('ada'));
    service.connect('tab-3', student('bob')); service.connect('demo-tab', student('demo', true));
    for (const tab of ['tab-1', 'tab-2', 'tab-3', 'demo-tab']) service.enterCity(tab, 'caches');
    assert.equal(service.presence().find(item => item.cityId === 'caches')?.count, 2);
    service.disconnect('tab-1');
    assert.equal(service.presence().find(item => item.cityId === 'caches')?.count, 2);
    service.enterCity('tab-2', null);
    assert.equal(service.presence().find(item => item.cityId === 'caches')?.count, 1);
    assert.throws(() => service.enterCity('tab-3', 'invented-city'), /does not exist/);
  } finally { database.close(); }
});

test('study membership and validated host state survive reconnects and service recreation', () => {
  const { service, database, make, now } = fixture();
  try {
    const ada = student('ada'), bob = student('bob'), stranger = student('eve');
    const table = service.createTable(ada, { cityId: 'pipelining', topic: 'Load-use hazards', place: 'HG library', time: new Date(now() + 20_000).toISOString() });
    service.joinTable(bob, table.id);
    assert.throws(() => service.updateTable(bob, table.id, { state: { kind: 'pipeline', step: 1, preset: 'load-use', forwarding: true } }), /Only the table host/);
    assert.throws(() => service.tableMember(stranger, table.id), /Join this table/);
    const advanced = service.updateTable(ada, table.id, { version: 0, state: { kind: 'pipeline', step: 3, preset: 'load-use', forwarding: true } });
    assert.equal(advanced.version, 1);
    assert.throws(() => service.updateTable(ada, table.id, { version: 0, state: advanced.state }), /table changed/);
    const recreated = make();
    assert.equal(recreated.tableMember(bob, table.id).state.step, 3);
    assert.equal(recreated.tables()[0].members.length, 2);
    recreated.connect('bob-new-tab', bob);
    assert.equal(recreated.tables()[0].members.find(item => item.userId === 'bob')?.online, true);
    const transferred = recreated.leaveTable(ada, table.id)!;
    assert.equal(transferred.hostId, 'bob');
    assert.equal(recreated.updateTable(bob, table.id, { state: { kind: 'pipeline', step: 4, preset: 'load-use', forwarding: true } }).state.step, 4);
    assert.equal(recreated.leaveTable(bob, table.id), null);
    assert.equal(recreated.tables().length, 0);
  } finally { database.close(); }
});

test('shared states reject spoofed results, oversize caches and steps outside actual simulations', () => {
  assert.deepEqual(validateSharedState({ kind: 'pipeline', step: 1, preset: 'load-use', forwarding: false, totalCycles: 0 }), { kind: 'pipeline', step: 1, preset: 'load-use', forwarding: false });
  assert.throws(() => validateSharedState({ kind: 'pipeline', step: 999, preset: 'load-use', forwarding: true }), /outside/);
  assert.throws(() => validateSharedState({ kind: 'pipeline', step: 0, preset: 'load-use', forwarding: true, source: 'process.exit()' }), /Unsupported|Expected/);
  assert.throws(() => validateSharedState({ kind: 'cache', step: 0, preset: 'locality', design: 'twoWay', addresses: [256] }), /between 0 and 255/);
  assert.throws(() => validateSharedState({ kind: 'cache', step: 0, preset: 'locality', design: 'twoWay', config: { capacityBytes: 65536, blockBytes: 1 } }), /small teaching cache/);
  assert.throws(() => validateSharedState({ kind: 'virtual-memory', step: 5, preset: 'page-walk' }), /step 0–4/);
});
