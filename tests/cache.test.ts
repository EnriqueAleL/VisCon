import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CACHE_DEMO_CONFIG, CACHE_PRESETS, cacheGeometry, compareCaches,
  decomposeCacheAddress, parseCacheAddresses, scoreCachePuzzle, simulateCache,
} from '../shared/cache';

test('byte address partitions reconstruct the address and fully associative caches have no index bits', () => {
  for (const associativity of [1, 2, 'fully'] as const) {
    const geometry = cacheGeometry({ ...CACHE_DEMO_CONFIG, associativity });
    assert.equal(geometry.lineCount, 8);
    assert.equal(geometry.capacityBytes, 64);
    for (let address = 0; address < 256; address++) {
      const decoded = decomposeCacheAddress(address, geometry);
      assert.equal((decoded.tag * geometry.setCount + decoded.index) * geometry.blockBytes + decoded.offset, address);
      assert.equal(decoded.tagBinary + decoded.indexBinary + decoded.offsetBinary, decoded.binary);
      assert.equal(decoded.binary.length, 8);
    }
  }
  const geometry = cacheGeometry({ ...CACHE_DEMO_CONFIG, associativity: 'fully' });
  assert.equal(geometry.indexBits, 0);
  assert.equal(decomposeCacheAddress(255, geometry).indexBinary, '');
  assert.deepEqual({ tag: decomposeCacheAddress(255, geometry).tag, offset: decomposeCacheAddress(255, geometry).offset }, { tag: 31, offset: 7 });
});

test('a miss brings in a whole block and touching neighboring bytes is a hit', () => {
  const simulation = simulateCache([0, 1, 7, 8, 15, 0]);
  assert.deepEqual(simulation.steps.map(step => step.hit), [false, true, true, false, true, true]);
  assert.equal(simulation.misses, 2);
  assert.equal(simulation.hits, 4);
  assert.equal(simulation.steps[0].missType, 'compulsory');
  assert.equal(simulation.steps[1].missType, null);
});

test('direct mapped cache replaces the only way even while other sets are empty', () => {
  const result = simulateCache([0, 64, 0], { ...CACHE_DEMO_CONFIG, associativity: 1 });
  assert.equal(result.misses, 3);
  assert.equal(result.steps[1].evictedBlock, 0);
  assert.equal(result.steps[2].missType, 'conflict');
  assert.ok(result.finalSets.slice(1).every(set => !set[0].valid));
});

test('a hit promotes a line and exact LRU evicts the other way', () => {
  const result = simulateCache([0, 32, 0, 64, 0, 32]);
  assert.deepEqual(result.steps.map(step => step.hit), [false, false, true, false, true, false]);
  assert.equal(result.steps[3].evictedBlock, 4); // byte address 32 / 8
  assert.deepEqual(result.steps[2].lruOrder, [0, 1]);
  assert.deepEqual(result.steps[3].lruOrder, [1, 0]);
  assert.equal(result.steps[5].evictedBlock, 8); // byte address 64 / 8
});

test('three equal-capacity designs produce different miss rates for the same three-block trace', () => {
  const result = compareCaches(CACHE_PRESETS[1].addresses);
  assert.equal(result.direct.misses, 9);
  assert.equal(result.twoWay.misses, 12);
  assert.equal(result.fully.misses, 3);
  assert.equal(result.fully.missRate, .25);
  // Greater associativity at fixed capacity is not guaranteed to help a particular LRU trace.
  assert.equal(result.twoWay.steps[3].missType, 'conflict');
  assert.deepEqual(Object.values(result).map(cache => cache.geometry.capacityBytes), [64, 64, 64]);
});

test('fully associative eviction after nine unique blocks is a capacity miss', () => {
  const result = simulateCache([0, 8, 16, 24, 32, 40, 48, 56, 64, 0], { ...CACHE_DEMO_CONFIG, associativity: 'fully' });
  assert.equal(result.steps[8].evictedBlock, 0);
  assert.equal(result.steps[9].missType, 'capacity');
  assert.equal(result.misses, 10);
});

test('step snapshots stay independent, so stepping backwards shows the actual earlier state', () => {
  const result = simulateCache([0, 32, 64]);
  assert.equal(result.steps[0].sets[0][0].blockNumber, 0);
  assert.equal(result.steps[0].sets[0][1].valid, false);
  assert.equal(result.steps[2].sets[0][0].blockNumber, 8);
  result.finalSets[0][0].blockNumber = 99;
  assert.equal(result.steps[2].sets[0][0].blockNumber, 8);
});

test('unsigned 32-bit addresses do not overflow signed JavaScript bitwise arithmetic', () => {
  const geometry = cacheGeometry({ capacityBytes: 64, blockBytes: 8, associativity: 2, addressBits: 32 });
  const address = decomposeCacheAddress(0xFFFFFFFF, geometry);
  assert.equal(address.binary, '1'.repeat(32));
  assert.equal(address.offset, 7);
  assert.equal(address.index, 3);
  assert.equal(address.tag, 134217727);
});

test('cache validation rejects fractional addresses and invalid geometry', () => {
  for (const address of [-1, 256, .5, NaN, Infinity]) assert.throws(() => simulateCache([address]));
  for (const config of [
    { ...CACHE_DEMO_CONFIG, capacityBytes: 48 },
    { ...CACHE_DEMO_CONFIG, blockBytes: 128 },
    { ...CACHE_DEMO_CONFIG, associativity: 3 },
    { ...CACHE_DEMO_CONFIG, associativity: 16 },
    { ...CACHE_DEMO_CONFIG, addressBits: 0 },
  ]) assert.throws(() => simulateCache([], config));
  const empty = simulateCache([]);
  assert.equal(empty.misses, 0);
  assert.equal(empty.missRate, 0);
});

test('address parser accepts decimal and hex, rejects coercion and executable expressions', () => {
  assert.deepEqual(parseCacheAddresses('0, 0x20; 64\n0Xff'), [0, 32, 64, 255]);
  for (const text of ['', 'true', '1+2', '-1', '2.5', '0b10', '1e2', '256']) assert.throws(() => parseCacheAddresses(text));
});

test('cache puzzle scorer enforces constraints and scores objective misses', () => {
  const thrash = Array.from({ length: 16 }, (_, index) => [0, 32, 64][index % 3]);
  const perfect = scoreCachePuzzle(thrash);
  assert.equal(perfect.valid, true);
  assert.equal(perfect.score, 16);
  assert.equal(perfect.missRate, 1);
  assert.equal(scoreCachePuzzle(Array(16).fill(0)).score, 1);
  assert.equal(scoreCachePuzzle([0, 32, 64]).valid, false);
  assert.equal(scoreCachePuzzle([...thrash.slice(0, 15), 8]).valid, false);
});
