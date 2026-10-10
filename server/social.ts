import type express from 'express';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Server } from 'socket.io';
import { db } from './store';
import { maniaIdentity, maniaIdentityFromHeaders, getWorld, markLandmarkSolved, cityWeather } from './mania';
import { PIPELINE_PRESETS, PIPELINE_PUZZLES, parseInstructions, scorePipelinePuzzle, simulatePipeline } from '../shared/pipeline';
import { CACHE_DEMO_CONFIG, CACHE_PRESETS, CACHE_PUZZLE_RULES, cacheGeometry, scoreCachePuzzle } from '../shared/cache';
import type { LearningIdentity, WorldData } from '../shared/world';
import type { CityMayor, CityWeather, GlobalLeaderboardEntry, PuzzleCatalogItem, PuzzleId, PuzzleLeaderboardEntry, PuzzleSession, PuzzleSubmissionResponse, SharedVisualizerState, SocialSnapshot, StudyTable } from '../shared/social';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
export class SocialError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
function real(identity: LearningIdentity) {
  if (identity.demo) throw new SocialError('Leave the labelled demo profile to take part in live puzzles and study tables.', 403);
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SocialError('Send a valid request.');
  return value as Record<string, unknown>;
}
function textField(value: unknown, label: string, max = 120) {
  if (typeof value !== 'string' || value.trim().length < 2 || value.trim().length > max || /[\x00-\x1f<>]/.test(value)) throw new SocialError(`Use a ${label} between 2 and ${max} characters.`);
  return value.trim();
}
export function weekStart(now: number) {
  const date = new Date(now);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.getTime();
}
export const puzzleCatalog: PuzzleCatalogItem[] = [
  ...PIPELINE_PUZZLES.map(puzzle => ({ id: puzzle.id as PuzzleId, title: puzzle.title, description: puzzle.description,
    cityId: 'pipelining', kind: 'pipeline' as const, timeLimit: puzzle.timeLimit, maxScore: 10_000 - puzzle.optimumCycles * 100,
    instructions: puzzle.instructions.map(({ id, text }) => ({ id, text })), optimumCycles: puzzle.optimumCycles })),
  { id: CACHE_PUZZLE_RULES.id, title: CACHE_PUZZLE_RULES.title, description: CACHE_PUZZLE_RULES.description,
    cityId: 'caches', kind: 'cache', timeLimit: 60, maxScore: CACHE_PUZZLE_RULES.accessCount,
    accessCount: CACHE_PUZZLE_RULES.accessCount, allowedAddresses: [...CACHE_PUZZLE_RULES.allowedAddresses] },
];
function puzzleById(id: unknown): PuzzleCatalogItem {
  const puzzle = puzzleCatalog.find(item => item.id === id);
  if (!puzzle) throw new SocialError('This puzzle does not exist.', 404);
  return puzzle;
}

/** Accept only an immutable teaching configuration, never client-supplied computed results. */
export function validateSharedState(value: unknown): SharedVisualizerState {
  const input = record(value);
  if (!Number.isInteger(input.step) || (input.step as number) < 0) throw new SocialError('Choose a non-negative integer step.');
  const step = input.step as number;
  if (input.kind === 'pipeline') {
    const preset = PIPELINE_PRESETS.find(item => item.id === input.preset);
    if (!preset || typeof input.forwarding !== 'boolean') throw new SocialError('Choose a pipeline preset and forwarding setting.');
    const source = input.source === undefined ? preset.source : input.source;
    if (typeof source !== 'string') throw new SocialError('Use an instruction program.');
    const parsed = parseInstructions(source);
    if (!parsed.length || step > simulatePipeline(parsed, { forwarding: input.forwarding }).totalCycles) throw new SocialError('This step is outside the pipeline program.');
    return { kind: 'pipeline', step, preset: preset.id, forwarding: input.forwarding, ...(input.source !== undefined ? { source } : {}) };
  }
  if (input.kind === 'cache') {
    const preset = CACHE_PRESETS.find(item => item.id === input.preset);
    if (!preset || !['direct', 'twoWay', 'fully'].includes(String(input.design))) throw new SocialError('Choose a cache preset and design.');
    const design = input.design as 'direct' | 'twoWay' | 'fully';
    const addresses = input.addresses === undefined ? [...preset.addresses] : input.addresses;
    if (!Array.isArray(addresses) || !addresses.length || addresses.length > 128 || addresses.some(address => !Number.isInteger(address) || address < 0 || address > 255) || step > addresses.length) throw new SocialError('Use 1–128 byte addresses between 0 and 255, and a step inside the trace.');
    let config = { ...CACHE_DEMO_CONFIG, associativity: design === 'direct' ? 1 : design === 'twoWay' ? 2 : 'fully' as const };
    if (input.config !== undefined) {
      const custom = record(input.config);
      const supplied = { capacityBytes: Number(custom.capacityBytes), blockBytes: Number(custom.blockBytes), associativity: config.associativity, addressBits: 8 };
      if (typeof custom.capacityBytes !== 'number' || typeof custom.blockBytes !== 'number' || supplied.capacityBytes > 4096 || supplied.blockBytes > 128) throw new SocialError('Choose a small teaching cache.');
      const geometry = cacheGeometry(supplied);
      if (geometry.lineCount > 64 || geometry.ways > 64) throw new SocialError('Use at most 64 cache lines.');
      config = supplied;
    }
    return { kind: 'cache', step, preset: preset.id, design,
      ...(input.addresses !== undefined ? { addresses: [...addresses] } : {}), ...(input.config !== undefined ? { config } : {}) };
  }
  if (input.kind === 'virtual-memory') {
    if (input.preset !== 'page-walk' || step > 4 || (input.virtualAddress !== undefined && (!Number.isInteger(input.virtualAddress) || (input.virtualAddress as number) < 0 || (input.virtualAddress as number) > 65535))) throw new SocialError('Use a 16-bit page-walk address and step 0–4.');
    return { kind: 'virtual-memory', step, preset: 'page-walk', ...(input.virtualAddress !== undefined ? { virtualAddress: input.virtualAddress as number } : {}) };
  }
  throw new SocialError('Choose a supported visualizer.');
}

interface ScoreRow {
  id: string; userId: string; name: string; puzzleId: PuzzleId; cityId: string; score: number;
  normalizedScore: number; cycles: number | null; stalls: number | null; misses: number | null;
  hits: number | null; elapsedMs: number; achievedAt: number;
}
interface TableRow {
  id: string; cityId: string; topic: string; place: string; time: number; hostId: string;
  createdAt: number; updatedAt: number; state: string; version: number;
}
interface SocialServiceOptions {
  database?: DatabaseSync; clock?: () => number; world: () => WorldData;
  weather?: () => CityWeather[]; landmarkSolved?: (userId: string, cityId: string) => unknown;
}

/** Persistent scores/tables and ephemeral, per-user presence are separate on purpose. */
export function createSocialService(options: SocialServiceOptions) {
  const database = options.database ?? db;
  const clock = options.clock ?? Date.now;
  database.exec(`CREATE TABLE IF NOT EXISTS social_people (userId TEXT PRIMARY KEY,name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS puzzle_sessions (id TEXT PRIMARY KEY,userId TEXT NOT NULL,puzzleId TEXT NOT NULL,startedAt INTEGER NOT NULL,expiresAt INTEGER NOT NULL,submittedAt INTEGER);
    CREATE TABLE IF NOT EXISTS puzzle_scores (id TEXT PRIMARY KEY,userId TEXT NOT NULL,puzzleId TEXT NOT NULL,cityId TEXT NOT NULL,score INTEGER NOT NULL,normalizedScore INTEGER NOT NULL,cycles INTEGER,stalls INTEGER,misses INTEGER,hits INTEGER,elapsedMs INTEGER NOT NULL,achievedAt INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS puzzle_scores_board ON puzzle_scores(puzzleId,score DESC,elapsedMs,achievedAt);
    CREATE TABLE IF NOT EXISTS study_tables (id TEXT PRIMARY KEY,cityId TEXT NOT NULL,topic TEXT NOT NULL,place TEXT NOT NULL,time INTEGER NOT NULL,hostId TEXT NOT NULL,createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL,state TEXT NOT NULL,version INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS study_table_members (tableId TEXT NOT NULL,userId TEXT NOT NULL,joinedAt INTEGER NOT NULL,PRIMARY KEY(tableId,userId));`);
  const connections = new Map<string, { identity: LearningIdentity; cityId: string | null }>();
  const limits = new Map<string, { at: number; count: number }>();
  function limit(identity: LearningIdentity, action = 'requests', max = 120) {
    const key = `${identity.id}:${action}`, now = clock();
    const current = limits.get(key);
    const value = current && now - current.at < MINUTE ? current : { at: now, count: 0 };
    if (++value.count > max) throw new SocialError('Too many requests. Wait a moment and try again.', 429);
    limits.set(key, value);
    if (limits.size > 10_000) for (const [id, item] of limits) if (now - item.at >= MINUTE) limits.delete(id);
  }
  function remember(identity: LearningIdentity) {
    database.prepare('INSERT INTO social_people VALUES (?,?) ON CONFLICT(userId) DO UPDATE SET name=excluded.name').run(identity.id, identity.name);
  }
  function city(id: unknown) {
    const found = options.world().cities.find(item => item.id === id);
    if (!found) throw new SocialError('That study city does not exist.', 404);
    return found;
  }
  function connection(socketId: string) {
    const found = connections.get(socketId);
    if (!found) throw new SocialError('Open the app to create your study profile.', 401);
    return found;
  }
  function connect(socketId: string, identity: LearningIdentity) { remember(identity); connections.set(socketId, { identity, cityId: null }); }
  function disconnect(socketId: string) { connections.delete(socketId); }
  function enterCity(socketId: string, id: unknown) {
    const current = connection(socketId);
    limit(current.identity);
    current.cityId = id === null ? null : city(id).id;
  }
  function presence() {
    const active = new Map<string, Set<string>>();
    for (const { identity, cityId } of connections.values()) if (!identity.demo && cityId) {
      const users = active.get(cityId) ?? new Set<string>(); users.add(identity.id); active.set(cityId, users);
    }
    return options.world().cities.map(item => ({ cityId: item.id, count: active.get(item.id)?.size ?? 0 }));
  }
  function board(puzzleId: PuzzleId, period: 'all' | 'week' = 'all'): PuzzleLeaderboardEntry[] {
    puzzleById(puzzleId);
    const rows = database.prepare(`SELECT s.*,p.name FROM puzzle_scores s JOIN social_people p ON p.userId=s.userId
      WHERE s.puzzleId=? AND s.achievedAt>=? ORDER BY s.score DESC,s.elapsedMs ASC,s.achievedAt ASC,s.id ASC`).all(puzzleId, period === 'week' ? weekStart(clock()) : 0) as unknown as ScoreRow[];
    const seen = new Set<string>();
    const winners = rows.filter(row => { if (seen.has(row.userId)) return false; seen.add(row.userId); return true; });
    return winners.slice(0, 100).map((row, index) => ({ rank: index + 1, userId: row.userId, name: row.name, puzzleId: row.puzzleId, cityId: row.cityId,
      score: row.score, normalizedScore: row.normalizedScore, cycles: row.cycles, stalls: row.stalls, misses: row.misses, hits: row.hits, elapsedMs: row.elapsedMs, achievedAt: new Date(row.achievedAt).toISOString() }));
  }
  function mayor(puzzleId: PuzzleId): CityMayor | null {
    const top = board(puzzleId)[0];
    return top ? { cityId: top.cityId, puzzleId: top.puzzleId, userId: top.userId, name: top.name, score: top.score, cycles: top.cycles, misses: top.misses } : null;
  }
  function globalBoard(period: 'all' | 'week' = 'week'): GlobalLeaderboardEntry[] {
    const people = new Map<string, GlobalLeaderboardEntry>();
    for (const puzzle of puzzleCatalog) for (const entry of board(puzzle.id, period)) {
      const row = people.get(entry.userId) ?? { rank: 0, userId: entry.userId, name: entry.name, normalizedScore: 0, puzzlesSolved: 0, achievedAt: entry.achievedAt, scores: [] };
      row.scores.push(entry); row.normalizedScore += entry.normalizedScore; row.puzzlesSolved++;
      row.achievedAt = row.achievedAt > entry.achievedAt ? row.achievedAt : entry.achievedAt;
      people.set(entry.userId, row);
    }
    return [...people.values()].sort((a, b) => b.normalizedScore - a.normalizedScore || b.puzzlesSolved - a.puzzlesSolved || a.achievedAt.localeCompare(b.achievedAt)).slice(0, 100).map((entry, index) => ({ ...entry, rank: index + 1 }));
  }
  function startPuzzle(identity: LearningIdentity, puzzleId: PuzzleId): PuzzleSession {
    real(identity); limit(identity, 'puzzle-start', 12); remember(identity);
    const puzzle = puzzleById(puzzleId), now = clock(), id = randomUUID(), expiresAt = now + puzzle.timeLimit * 1000;
    // One active attempt per puzzle/user. Starting again ends the old clock.
    database.prepare('UPDATE puzzle_sessions SET submittedAt=? WHERE userId=? AND puzzleId=? AND submittedAt IS NULL').run(now, identity.id, puzzle.id);
    database.prepare('INSERT INTO puzzle_sessions VALUES (?,?,?,?,?,NULL)').run(id, identity.id, puzzle.id, now, expiresAt);
    database.prepare('DELETE FROM puzzle_sessions WHERE expiresAt<?').run(now - 24 * HOUR);
    return { sessionId: id, puzzleId: puzzle.id, startedAt: new Date(now).toISOString(), expiresAt: new Date(expiresAt).toISOString(), timeLimit: puzzle.timeLimit, serverTime: now };
  }
  function submitPuzzle(identity: LearningIdentity, puzzleId: PuzzleId, body: unknown): PuzzleSubmissionResponse {
    real(identity); limit(identity, 'puzzle-submit', 30); remember(identity);
    const puzzle = puzzleById(puzzleId), input = record(body), now = clock();
    if (typeof input.sessionId !== 'string' || input.sessionId.length > 80) throw new SocialError('Start a timed attempt before submitting.');
    const attempt = database.prepare('SELECT * FROM puzzle_sessions WHERE id=?').get(input.sessionId) as { userId: string; puzzleId: string; startedAt: number; expiresAt: number; submittedAt: number | null } | undefined;
    if (!attempt || attempt.userId !== identity.id || attempt.puzzleId !== puzzle.id) throw new SocialError('This timed attempt does not belong to your profile.', 403);
    if (attempt.submittedAt !== null) throw new SocialError('This attempt was already submitted. Start a new one.', 409);
    if (now > attempt.expiresAt) throw new SocialError('Time is up. Start another 60-second attempt.', 410);
    let score: PuzzleSubmissionResponse['score'];
    let cycles: number | null = null, stalls: number | null = null, misses: number | null = null, hits: number | null = null;
    if (puzzle.kind === 'pipeline') {
      if (!Array.isArray(input.orderIds) || input.orderIds.length > 32 || input.orderIds.some(id => typeof id !== 'string')) throw new SocialError('Submit an instruction order.');
      const result = scorePipelinePuzzle(input.orderIds, puzzle.id);
      if (!result.valid) throw new SocialError(result.reason);
      score = result; cycles = result.cycles; stalls = result.stalls;
    } else {
      if (!Array.isArray(input.addresses) || input.addresses.length > 128 || input.addresses.some(address => typeof address !== 'number' || !Number.isInteger(address))) throw new SocialError('Submit integer cache addresses.');
      const result = scoreCachePuzzle(input.addresses);
      if (!result.valid) throw new SocialError(result.message);
      score = { ...result, valid: true }; misses = result.misses; hits = result.hits;
    }
    const normalizedScore = Math.min(1000, Math.max(0, Math.round(score.score / puzzle.maxScore * 1000)));
    database.exec('BEGIN IMMEDIATE');
    try {
      const consumed = database.prepare('UPDATE puzzle_sessions SET submittedAt=? WHERE id=? AND submittedAt IS NULL').run(now, input.sessionId);
      if (Number(consumed.changes) !== 1) throw new SocialError('This attempt was already submitted.', 409);
      database.prepare('INSERT INTO puzzle_scores VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(randomUUID(), identity.id, puzzle.id, puzzle.cityId, score.score, normalizedScore, cycles, stalls, misses, hits, now - attempt.startedAt, now);
      database.exec('COMMIT');
    } catch (error) { database.exec('ROLLBACK'); throw error; }
    if (normalizedScore === 1000) options.landmarkSolved?.(identity.id, puzzle.cityId);
    const leaderboard = board(puzzle.id), personalBest = leaderboard.find(entry => entry.userId === identity.id);
    // A student outside the displayed top 100 still receives their own actual best.
    const personal = personalBest ?? personalScore(identity.id, puzzle.id);
    return { score, personalBest: personal!, leaderboard, weekLeaderboard: board(puzzle.id, 'week'), mayor: mayor(puzzle.id) };
  }
  function personalScore(userId: string, puzzleId: PuzzleId): PuzzleLeaderboardEntry | null {
    const row = database.prepare(`SELECT s.*,p.name FROM puzzle_scores s JOIN social_people p ON p.userId=s.userId WHERE s.userId=? AND s.puzzleId=? ORDER BY s.score DESC,s.elapsedMs,s.achievedAt LIMIT 1`).get(userId, puzzleId) as unknown as ScoreRow | undefined;
    return row ? { rank: 0, userId: row.userId, name: row.name, puzzleId: row.puzzleId, cityId: row.cityId, score: row.score, normalizedScore: row.normalizedScore,
      cycles: row.cycles, stalls: row.stalls, misses: row.misses, hits: row.hits, elapsedMs: row.elapsedMs, achievedAt: new Date(row.achievedAt).toISOString() } : null;
  }
  function tableRow(id: unknown) {
    if (typeof id !== 'string' || id.length > 80) throw new SocialError('Use a study-table ID.');
    const row = database.prepare('SELECT * FROM study_tables WHERE id=?').get(id) as unknown as TableRow | undefined;
    if (!row || Math.max(row.time + 4 * HOUR, row.createdAt + 6 * HOUR) < clock()) throw new SocialError('This study table has ended.', 404);
    return row;
  }
  function tableView(row: TableRow): StudyTable {
    const members = database.prepare('SELECT m.userId,m.joinedAt,p.name FROM study_table_members m JOIN social_people p ON p.userId=m.userId WHERE m.tableId=? ORDER BY m.joinedAt,m.userId').all(row.id) as unknown as { userId: string; joinedAt: number; name: string }[];
    const online = new Set([...connections.values()].filter(item => !item.identity.demo).map(item => item.identity.id));
    return { id: row.id, cityId: row.cityId, topic: row.topic, place: row.place, time: new Date(row.time).toISOString(), hostId: row.hostId,
      hostName: members.find(item => item.userId === row.hostId)?.name ?? 'Student', createdAt: new Date(row.createdAt).toISOString(), updatedAt: new Date(row.updatedAt).toISOString(),
      members: members.map(item => ({ ...item, joinedAt: new Date(item.joinedAt).toISOString(), online: online.has(item.userId) })), state: JSON.parse(row.state), version: row.version };
  }
  function tables() {
    const rows = database.prepare('SELECT * FROM study_tables WHERE MAX(time+?,createdAt+?)>=? ORDER BY time,createdAt LIMIT 100').all(4 * HOUR, 6 * HOUR, clock()) as unknown as TableRow[];
    return rows.map(tableView);
  }
  function createTable(identity: LearningIdentity, body: unknown) {
    real(identity); limit(identity, 'table-create', 6); remember(identity);
    const input = record(body), found = city(input.cityId), topic = textField(input.topic, 'topic'), place = textField(input.place, 'meeting place');
    const now = clock(), time = typeof input.time === 'string' ? Date.parse(input.time) : NaN;
    if (!Number.isFinite(time) || time < now - 10 * MINUTE || time > now + 90 * 24 * HOUR) throw new SocialError('Choose a meeting time from now to the next 90 days.');
    const owned = tables().filter(table => table.hostId === identity.id).length;
    if (owned >= 3) throw new SocialError('You already host three upcoming tables. Join or leave one first.');
    const initial: SharedVisualizerState = found.visualizer === 'cache' ? { kind: 'cache', step: 0, preset: 'locality', design: 'twoWay' }
      : found.visualizer === 'virtual-memory' ? { kind: 'virtual-memory', step: 0, preset: 'page-walk' }
      : { kind: 'pipeline', step: 0, preset: 'load-use', forwarding: true };
    const state = input.state === undefined ? initial : validateSharedState(input.state), id = randomUUID();
    database.prepare('INSERT INTO study_tables VALUES (?,?,?,?,?,?,?,?,?,?)').run(id, found.id, topic, place, time, identity.id, now, now, JSON.stringify(state), 0);
    database.prepare('INSERT INTO study_table_members VALUES (?,?,?)').run(id, identity.id, now);
    return tableView(tableRow(id));
  }
  function joinTable(identity: LearningIdentity, tableId: unknown) {
    real(identity); limit(identity); remember(identity);
    const row = tableRow(tableId), existing = database.prepare('SELECT userId FROM study_table_members WHERE tableId=? AND userId=?').get(row.id, identity.id);
    if (!existing && Number((database.prepare('SELECT COUNT(*) AS count FROM study_table_members WHERE tableId=?').get(row.id) as { count: number }).count) >= 16) throw new SocialError('This table is full (16 students).');
    database.prepare('INSERT OR IGNORE INTO study_table_members VALUES (?,?,?)').run(row.id, identity.id, clock());
    return tableView(row);
  }
  function leaveTable(identity: LearningIdentity, tableId: unknown) {
    real(identity); limit(identity);
    const row = tableRow(tableId);
    database.prepare('DELETE FROM study_table_members WHERE tableId=? AND userId=?').run(row.id, identity.id);
    const next = database.prepare('SELECT userId FROM study_table_members WHERE tableId=? ORDER BY joinedAt,userId LIMIT 1').get(row.id) as { userId: string } | undefined;
    if (!next) { database.prepare('DELETE FROM study_tables WHERE id=?').run(row.id); return null; }
    if (row.hostId === identity.id) database.prepare('UPDATE study_tables SET hostId=?,updatedAt=?,version=version+1 WHERE id=?').run(next.userId, clock(), row.id);
    return tableView(tableRow(row.id));
  }
  function tableMember(identity: LearningIdentity, id: unknown) {
    const row = tableRow(id);
    if (!database.prepare('SELECT userId FROM study_table_members WHERE tableId=? AND userId=?').get(row.id, identity.id)) throw new SocialError('Join this table before following its visualizer.', 403);
    return tableView(row);
  }
  function updateTable(identity: LearningIdentity, tableId: unknown, body: unknown) {
    real(identity); limit(identity, 'table-step', 180);
    const row = tableRow(tableId), input = record(body);
    if (row.hostId !== identity.id) throw new SocialError('Only the table host can step the shared visualizer.', 403);
    tableMember(identity, row.id);
    if (input.version !== undefined && input.version !== row.version) throw new SocialError('The table changed. Reload its latest state and try again.', 409);
    const state = validateSharedState(input.state);
    database.prepare('UPDATE study_tables SET state=?,updatedAt=?,version=version+1 WHERE id=?').run(JSON.stringify(state), clock(), row.id);
    return tableView(tableRow(row.id));
  }
  function snapshotData(): Omit<SocialSnapshot, 'identity'> {
    return { presence: presence(), weather: options.weather?.() ?? [], tables: tables(), mayors: puzzleCatalog.map(item => mayor(item.id)).filter((value): value is CityMayor => value !== null), serverTime: clock() };
  }
  function snapshot(identity: LearningIdentity): SocialSnapshot {
    remember(identity);
    return { identity, ...snapshotData() };
  }
  return { limit, connect, disconnect, enterCity, presence, board, globalBoard, mayor, startPuzzle, submitPuzzle, personalScore,
    tables, createTable, joinTable, leaveTable, tableMember, updateTable, snapshot, snapshotData };
}

export function mountSocial(app: express.Express, io: Server) {
  const service = createSocialService({ world: getWorld, weather: cityWeather, landmarkSolved: markLandmarkSolved });
  const study = io.of('/study');
  function broadcast() {
    const data = service.snapshotData();
    study.emit('world:live', { cities: getWorld().cities.map(city => ({ cityId: city.id, population: data.presence.find(item => item.cityId === city.id)?.count ?? 0,
      storm: data.weather.find(item => item.cityId === city.id)?.storm ?? false, mayor: data.mayors.find(item => item.cityId === city.id) ?? null })), serverTime: data.serverTime });
    for (const socket of study.sockets.values()) socket.emit('social:snapshot', { ...data, identity: socket.data.identity });
  }
  const route = (handler: (req: express.Request, res: express.Response, identity: LearningIdentity) => unknown) => (req: express.Request, res: express.Response) => {
    try { const identity = maniaIdentity(req, res); service.limit(identity); handler(req, res, identity); }
    catch (error) { res.status(error instanceof SocialError ? error.status : 400).json({ error: error instanceof Error ? error.message : 'Try again in a moment.' }); }
  };
  app.get('/api/social', route((_req, res, identity) => res.json(service.snapshot(identity))));
  app.get('/api/puzzles', route((_req, res) => res.json({ puzzles: puzzleCatalog, serverTime: Date.now() })));
  app.get('/api/puzzles/leaderboard', route((req, res) => res.json({ entries: service.globalBoard(req.query.period === 'all' ? 'all' : 'week'), period: req.query.period === 'all' ? 'all' : 'week', serverTime: Date.now() })));
  app.get('/api/puzzles/:id/leaderboard', route((req, res, identity) => {
    const puzzle = puzzleById(req.params.id);
    res.json({ entries: service.board(puzzle.id, req.query.period === 'week' ? 'week' : 'all'), mayor: service.mayor(puzzle.id), personalBest: service.personalScore(identity.id, puzzle.id), serverTime: Date.now() });
  }));
  app.post('/api/puzzles/:id/start', route((req, res, identity) => res.status(201).json(service.startPuzzle(identity, puzzleById(req.params.id).id))));
  app.post('/api/puzzles/:id/submit', route((req, res, identity) => { const result = service.submitPuzzle(identity, puzzleById(req.params.id).id, req.body); res.json(result); broadcast(); }));
  app.get('/api/study/tables', route((_req, res) => res.json({ tables: service.tables(), serverTime: Date.now() })));
  app.get('/api/study/tables/:id', route((req, res, identity) => res.json({ table: service.tableMember(identity, req.params.id), serverTime: Date.now() })));
  app.post('/api/study/tables', route((req, res, identity) => { const table = service.createTable(identity, req.body); res.status(201).json({ table }); broadcast(); }));
  app.post('/api/study/tables/:id/join', route((req, res, identity) => { const table = service.joinTable(identity, req.params.id); res.json({ table }); study.to(`table:${table.id}`).emit('table:update', table); broadcast(); }));
  app.post('/api/study/tables/:id/leave', route((req, res, identity) => { const table = service.leaveTable(identity, req.params.id); res.json({ table }); study.to(`table:${req.params.id}`).emit(table ? 'table:update' : 'table:ended', table ?? { tableId: req.params.id }); broadcast(); }));
  app.put('/api/study/tables/:id/state', route((req, res, identity) => { const table = service.updateTable(identity, req.params.id, req.body); res.json({ table }); study.to(`table:${table.id}`).emit('table:update', table); }));
  study.use((socket, next) => {
    const identity = maniaIdentityFromHeaders(socket.handshake.headers, socket.handshake.address);
    if (!identity) return next(new Error('Open the app first to create your study profile.'));
    socket.data.identity = { ...identity, demo: socket.handshake.auth?.demo === true || socket.handshake.auth?.demo === '1' };
    next();
  });
  study.on('connection', socket => {
    const identity = socket.data.identity as LearningIdentity;
    service.connect(socket.id, identity);
    const ack = (callback: unknown, action: () => unknown) => {
      try { const data = action(); if (typeof callback === 'function') callback({ ok: true, data }); }
      catch (error) { const message = error instanceof Error ? error.message : 'Try again.'; if (typeof callback === 'function') callback({ ok: false, error: message }); else socket.emit('study:error', { error: message }); }
    };
    socket.on('city:enter', (body: unknown, callback: unknown) => ack(callback, () => { service.enterCity(socket.id, record(body).cityId); broadcast(); return service.presence(); }));
    socket.on('city:leave', (callback: unknown) => ack(callback, () => { service.enterCity(socket.id, null); broadcast(); return service.presence(); }));
    socket.on('table:join', (body: unknown, callback: unknown) => ack(callback, () => { const table = service.joinTable(identity, record(body).tableId); void socket.join(`table:${table.id}`); socket.emit('table:update', table); broadcast(); return table; }));
    socket.on('table:leave', (body: unknown, callback: unknown) => ack(callback, () => { const id = record(body).tableId; const table = service.leaveTable(identity, id); void socket.leave(`table:${id}`); study.to(`table:${id}`).emit(table ? 'table:update' : 'table:ended', table ?? { tableId: id }); broadcast(); return table; }));
    socket.on('table:state', (body: unknown, callback: unknown) => ack(callback, () => { const input = record(body); const table = service.updateTable(identity, input.tableId, input); study.to(`table:${table.id}`).emit('table:update', table); return table; }));
    // Membership survives browser reconnects and server restarts; reconnect automatically follows the table.
    for (const table of service.tables()) if (table.members.some(member => member.userId === identity.id) && !identity.demo) void socket.join(`table:${table.id}`);
    broadcast();
    socket.on('disconnect', () => { service.disconnect(socket.id); broadcast(); });
  });
  // Recall submissions happen in the learning service; refresh aggregate weather from actual answers.
  const weatherRefresh = setInterval(() => { if (study.sockets.size) broadcast(); }, 15_000);
  weatherRefresh.unref();
  io.httpServer?.once('close', () => clearInterval(weatherRefresh));
  return service;
}
