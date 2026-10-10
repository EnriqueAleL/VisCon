/** A byte-addressed, read-only cache with exact LRU replacement. */
export interface CacheConfig {
  capacityBytes: number;
  blockBytes: number;
  associativity: number | 'fully';
  addressBits?: number;
}

export interface CacheGeometry {
  capacityBytes: number;
  blockBytes: number;
  ways: number;
  setCount: number;
  lineCount: number;
  addressBits: number;
  tagBits: number;
  indexBits: number;
  offsetBits: number;
}

export interface CacheAddress {
  address: number;
  binary: string;
  blockNumber: number;
  blockAddress: number;
  tag: number;
  index: number;
  offset: number;
  tagBinary: string;
  indexBinary: string;
  offsetBinary: string;
}

export interface CacheLine {
  way: number;
  valid: boolean;
  tag: number | null;
  blockNumber: number | null;
  lastUsed: number;
}

export type CacheMissType = 'compulsory' | 'conflict' | 'capacity';

export interface CacheStep extends CacheAddress {
  access: number;
  hit: boolean;
  missType: CacheMissType | null;
  way: number;
  evictedBlock: number | null;
  hits: number;
  misses: number;
  /** Sets after this access. Each snapshot is independent of the others. */
  sets: CacheLine[][];
  /** Valid way indices in the selected set, most recently used first. */
  lruOrder: number[];
}

export interface CacheSimulation {
  geometry: CacheGeometry;
  steps: CacheStep[];
  hits: number;
  misses: number;
  missRate: number;
  finalSets: CacheLine[][];
}

export const CACHE_DEMO_CONFIG: CacheConfig = {
  capacityBytes: 64,
  blockBytes: 8,
  associativity: 2,
  addressBits: 8,
};

export const CACHE_LECTURE_ANCHORS = {
  decomposition: { lecture: 20, chapterId: '20.16', start: 4787.334, title: 'Direct-mapped organization and address decomposition' },
  associativity: { lecture: 20, chapterId: '20.17', start: 5147.734, title: 'Set-associative and fully associative caches' },
  replacement: { lecture: 21, chapterId: '21.5', start: 1077.408, title: 'Replacement policies, including LRU' },
  thrashing: { lecture: 21, chapterId: '21.7', start: 1647.288, title: 'Cyclic references and LRU thrashing' },
} as const;

export const CACHE_PRESETS = [
  {
    id: 'locality',
    title: 'Locality',
    description: 'Teaching example: nearby bytes share a block, and revisiting a block hits.',
    addresses: [0, 1, 7, 8, 9, 0, 16, 17, 8, 0],
    anchor: CACHE_LECTURE_ANCHORS.decomposition,
  },
  {
    id: 'conflicts',
    title: 'Set conflicts',
    description: 'Teaching example: three blocks compete for two ways in one set.',
    addresses: [0, 32, 64, 0, 32, 64, 0, 32, 64, 0, 32, 64],
    anchor: CACHE_LECTURE_ANCHORS.associativity,
  },
  {
    id: 'lru',
    title: 'Touch changes LRU',
    description: 'Teaching example: touching block 0 again protects it when block 64 arrives.',
    addresses: [0, 32, 0, 64, 0, 32, 64, 0],
    anchor: CACHE_LECTURE_ANCHORS.replacement,
  },
] as const;

function powerOfTwo(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && Number.isInteger(Math.log2(value));
}

export function cacheGeometry(config: CacheConfig): CacheGeometry {
  const { capacityBytes, blockBytes } = config;
  const addressBits = config.addressBits ?? 8;
  if (!Number.isInteger(addressBits) || addressBits < 1 || addressBits > 32) {
    throw new Error('Address width must be an integer from 1 to 32 bits.');
  }
  if (!powerOfTwo(capacityBytes) || !powerOfTwo(blockBytes) || capacityBytes < blockBytes || capacityBytes > 2 ** addressBits) {
    throw new Error('Capacity and block size must be powers of two; a cache must contain at least one block and fit the address space.');
  }
  const lineCount = capacityBytes / blockBytes;
  const ways = config.associativity === 'fully' ? lineCount : config.associativity;
  if (!powerOfTwo(ways) || ways > lineCount) {
    throw new Error('Associativity must be a power of two no larger than the number of cache lines.');
  }
  const setCount = lineCount / ways;
  const offsetBits = Math.log2(blockBytes);
  const indexBits = Math.log2(setCount);
  return { capacityBytes, blockBytes, ways, setCount, lineCount, addressBits, offsetBits, indexBits, tagBits: addressBits - offsetBits - indexBits };
}

function bits(value: number, length: number): string {
  return length ? value.toString(2).padStart(length, '0') : '';
}

export function decomposeCacheAddress(address: number, geometry: CacheGeometry): CacheAddress {
  if (!Number.isSafeInteger(address) || address < 0 || address >= 2 ** geometry.addressBits) {
    throw new Error(`Addresses must be integers from 0 to ${2 ** geometry.addressBits - 1}.`);
  }
  const blockNumber = Math.floor(address / geometry.blockBytes);
  const index = blockNumber % geometry.setCount;
  const tag = Math.floor(blockNumber / geometry.setCount);
  const offset = address % geometry.blockBytes;
  return {
    address, binary: bits(address, geometry.addressBits), blockNumber,
    blockAddress: blockNumber * geometry.blockBytes, index, tag, offset,
    tagBinary: bits(tag, geometry.tagBits), indexBinary: bits(index, geometry.indexBits), offsetBinary: bits(offset, geometry.offsetBits),
  };
}

export function emptyCacheSets(geometry: CacheGeometry): CacheLine[][] {
  return Array.from({ length: geometry.setCount }, () => Array.from({ length: geometry.ways }, (_, way) => ({ way, valid: false, tag: null, blockNumber: null, lastUsed: -1 })));
}

function snapshot(sets: CacheLine[][]): CacheLine[][] {
  return sets.map(set => set.map(line => ({ ...line })));
}

export function simulateCache(addresses: readonly number[], config: CacheConfig = CACHE_DEMO_CONFIG): CacheSimulation {
  const geometry = cacheGeometry(config);
  const sets = emptyCacheSets(geometry);
  const seen = new Set<number>();
  // A same-capacity fully associative shadow distinguishes conflict and capacity misses.
  const shadow = new Map<number, number>();
  let hits = 0;
  let misses = 0;
  const steps = addresses.map((address, access): CacheStep => {
    const decoded = decomposeCacheAddress(address, geometry);
    const set = sets[decoded.index];
    const matching = set.find(line => line.valid && line.tag === decoded.tag);
    const hit = !!matching;
    const missType = hit ? null : !seen.has(decoded.blockNumber) ? 'compulsory' : shadow.has(decoded.blockNumber) ? 'conflict' : 'capacity';
    const target = matching ?? set.find(line => !line.valid) ?? set.reduce((oldest, line) => line.lastUsed < oldest.lastUsed ? line : oldest);
    const evictedBlock = !hit && target.valid ? target.blockNumber : null;
    target.valid = true;
    target.tag = decoded.tag;
    target.blockNumber = decoded.blockNumber;
    target.lastUsed = access;
    if (hit) hits++; else misses++;
    seen.add(decoded.blockNumber);
    shadow.delete(decoded.blockNumber);
    shadow.set(decoded.blockNumber, access);
    if (shadow.size > geometry.lineCount) shadow.delete(shadow.keys().next().value!);
    return {
      ...decoded, access, hit, missType, way: target.way, evictedBlock, hits, misses,
      sets: snapshot(sets),
      lruOrder: set.filter(line => line.valid).sort((a, b) => b.lastUsed - a.lastUsed).map(line => line.way),
    };
  });
  return { geometry, steps, hits, misses, missRate: addresses.length ? misses / addresses.length : 0, finalSets: snapshot(sets) };
}

export function compareCaches(addresses: readonly number[], capacityBytes = 64, blockBytes = 8, addressBits = 8) {
  const base = { capacityBytes, blockBytes, addressBits };
  return {
    direct: simulateCache(addresses, { ...base, associativity: 1 }),
    twoWay: simulateCache(addresses, { ...base, associativity: 2 }),
    fully: simulateCache(addresses, { ...base, associativity: 'fully' }),
  };
}

/** Accept decimal and hexadecimal byte addresses, never JS expressions or coercions. */
export function parseCacheAddresses(input: string, addressBits = 8): number[] {
  const tokens = input.trim().split(/[\s,;]+/).filter(Boolean);
  if (!tokens.length) throw new Error('Enter at least one byte address.');
  if (tokens.length > 128) throw new Error('Use at most 128 accesses so each step stays readable.');
  return tokens.map(token => {
    if (!/^(?:\d+|0x[0-9a-f]+)$/i.test(token)) throw new Error(`“${token}” is not a decimal or hexadecimal address.`);
    const address = Number(token);
    if (!Number.isSafeInteger(address) || address < 0 || address >= 2 ** addressBits) throw new Error(`Use addresses between 0 and ${2 ** addressBits - 1}.`);
    return address;
  });
}

export const CACHE_PUZZLE_RULES = {
  id: 'cache-conflict',
  title: 'Storm the cache',
  accessCount: 16,
  allowedAddresses: [0, 32, 64] as readonly number[],
  config: { capacityBytes: 64, blockBytes: 8, associativity: 2, addressBits: 8 } as CacheConfig,
  description: 'Make a 2-way LRU cache miss as often as possible. Use exactly 16 reads, choosing only byte addresses 0, 32 and 64.',
} as const;

export interface CachePuzzleScore {
  valid: boolean;
  puzzleId: 'cache-conflict';
  score: number;
  maxScore: number;
  misses: number;
  hits: number;
  missRate: number;
  message: string;
}

/** Objective score for the leaderboard: more misses is better, maximum 16. */
export function scoreCachePuzzle(addresses: readonly number[]): CachePuzzleScore {
  const invalid = (message: string): CachePuzzleScore => ({ valid: false, puzzleId: 'cache-conflict', score: 0, maxScore: CACHE_PUZZLE_RULES.accessCount, misses: 0, hits: 0, missRate: 0, message });
  if (addresses.length !== CACHE_PUZZLE_RULES.accessCount) return invalid(`Use exactly ${CACHE_PUZZLE_RULES.accessCount} reads.`);
  if (addresses.some(address => !CACHE_PUZZLE_RULES.allowedAddresses.includes(address))) return invalid('Only addresses 0, 32 and 64 are allowed.');
  const result = simulateCache(addresses, CACHE_PUZZLE_RULES.config);
  return {
    valid: true, puzzleId: 'cache-conflict', score: result.misses, maxScore: CACHE_PUZZLE_RULES.accessCount,
    misses: result.misses, hits: result.hits, missRate: result.missRate,
    message: result.misses === CACHE_PUZZLE_RULES.accessCount ? 'Perfect storm. Every access misses: three competing blocks keep evicting the next one.' : `${result.misses} of ${CACHE_PUZZLE_RULES.accessCount} reads miss. Can you keep the next block out of the set?`,
  };
}
