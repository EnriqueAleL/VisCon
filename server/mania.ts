import express from 'express';
import { randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import type { Server } from 'socket.io';
import type { DatabaseSync } from 'node:sqlite';
import { db, session, createPlayer } from './store';
import { examInfo, loadWorld, type BankRecallQuestion, type WorldBundle } from './world';
import type { CityProgress, DailyExpedition, LearningIdentity, LearningSnapshot, MockExamQuest, RecallQuest, RecallResult, ReviewResponse, WorldData } from '../shared/world';

const DAY = 86_400_000;
export const MODEL_NOTICE = 'A simple spaced-review estimate based on your recall answers. Map readiness is not a prediction of your exam grade.';
export interface StoredMastery {
  exploredChapterIds: string[]; strength: number; updatedAt: number; halfLifeDays: number;
  reviewCount: number; spacedReviews: number; reviewDays: string[]; mistakes: number;
  correctAnswers: number; totalAnswers: number; lastReviewedAt: number | null;
  lastSuccessAt: number | null; puzzleSolved: boolean;
}
export function emptyMastery(now: number): StoredMastery {
  return { exploredChapterIds: [], strength: 0, updatedAt: now, halfLifeDays: 3, reviewCount: 0, spacedReviews: 0, reviewDays: [], mistakes: 0, correctAnswers: 0, totalAnswers: 0, lastReviewedAt: null, lastSuccessAt: null, puzzleSolved: false };
}
export function decayedStrength(progress: StoredMastery, now: number): number {
  return Math.max(0, Math.min(1, progress.strength * Math.pow(0.5, Math.max(0, now - progress.updatedAt) / (Math.max(1, progress.halfLifeDays) * DAY))));
}
export function applyRecall(progress: StoredMastery, correct: number, total: number, now: number): StoredMastery {
  if (!Number.isInteger(correct) || !Number.isInteger(total) || total < 1 || correct < 0 || correct > total) throw new Error('Invalid recall result.');
  const passed = correct / total >= 0.8;
  const day = new Date(now).toISOString().slice(0, 10);
  const spaced = passed && !progress.reviewDays.includes(day);
  return { ...progress, strength: passed ? 0.95 : Math.min(0.48, decayedStrength(progress, now) * 0.6), updatedAt: now,
    halfLifeDays: passed ? Math.min(90, progress.halfLifeDays * (spaced && progress.spacedReviews > 0 ? 1.8 : 1)) : Math.max(1, progress.halfLifeDays * 0.65),
    reviewCount: progress.reviewCount + 1, spacedReviews: progress.spacedReviews + (spaced ? 1 : 0),
    reviewDays: spaced ? [...progress.reviewDays, day] : [...progress.reviewDays],
    mistakes: progress.mistakes + total - correct, correctAnswers: progress.correctAnswers + correct, totalAnswers: progress.totalAnswers + total,
    lastReviewedAt: now, lastSuccessAt: passed ? now : progress.lastSuccessAt,
  };
}
export function progressView(cityId: string, state: StoredMastery, chapterCount: number, now: number): CityProgress {
  const strength = decayedStrength(state, now);
  const status = state.spacedReviews === 0 ? state.exploredChapterIds.length || state.reviewCount ? 'exploring' : 'dark'
    : strength < 0.58 ? 'dimming' : state.spacedReviews >= 3 && state.puzzleSolved ? 'thriving' : 'claimed';
  const nextReviewAt = state.lastSuccessAt !== null && state.strength > 0.58
    ? new Date(state.updatedAt + state.halfLifeDays * DAY * Math.log2(state.strength / 0.58)).toISOString() : null;
  return { cityId, strength, halfLifeDays: state.halfLifeDays, status, exploredChapterIds: [...state.exploredChapterIds], exploredCount: state.exploredChapterIds.length,
    chapterCount, reviewCount: state.reviewCount, spacedReviews: state.spacedReviews, mistakes: state.mistakes, correctAnswers: state.correctAnswers, totalAnswers: state.totalAnswers,
    lastReviewedAt: state.lastReviewedAt !== null ? new Date(state.lastReviewedAt).toISOString() : null, nextReviewAt, puzzleSolved: state.puzzleSolved };
}

function headerValue(headers: IncomingHttpHeaders, key: string): string | undefined {
  const value = headers[key]; return typeof value === 'string' ? value : undefined;
}
function trustedProxy(remoteAddress?: string): boolean {
  if (process.env.MANIA_TRUST_PROXY !== 'true') return false;
  const configuredIps = (process.env.MANIA_TRUSTED_PROXY_IPS || '').split(',').map(value => value.trim()).filter(Boolean);
  return !configuredIps.length || configuredIps.includes(remoteAddress || '') || configuredIps.includes((remoteAddress || '').replace(/^::ffff:/, ''));
}
/** Only honor proxy identity after the operator explicitly enables the managed proxy. */
export function maniaIdentityFromHeaders(headers: IncomingHttpHeaders, remoteAddress?: string): LearningIdentity | null {
  if (trustedProxy(remoteAddress)) {
    const id = headerValue(headers, 'x-user-id')?.trim();
    const name = headerValue(headers, 'x-user-name')?.trim();
    if (id && id.length <= 128 && !/[\x00-\x1f<>]/.test(id)) return { id: `proxy:${id}`, name: name && name.length <= 80 && !/[\x00-\x1f<>]/.test(name) ? name : 'ETH student', source: 'proxy', demo: false };
  }
  const player = session(headerValue(headers, 'cookie'));
  return player ? { id: player.id, name: player.name, source: 'guest', demo: false } : null;
}
export function maniaIdentity(req: express.Request, res?: express.Response): LearningIdentity {
  let identity = maniaIdentityFromHeaders(req.headers, req.socket?.remoteAddress);
  if (!identity && res) {
    const created = createPlayer();
    res.cookie('ba_session', created.token, { httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE === 'true', maxAge: 365 * DAY, path: '/' });
    identity = { id: created.profile.id, name: created.profile.name, source: 'guest', demo: false };
  }
  if (!identity) throw new Error('Open the app first to create your study profile.');
  return { ...identity, demo: req.query?.demo === '1' };
}

interface Settings { examDate?: string | null; demoSeeded?: boolean }
interface PendingQuest { identityId: string; namespace: string; cityId: string | null; questions: BankRecallQuestion[]; expiresAt: number; createdAt: number }
export function createManiaService(bundle: WorldBundle, database: DatabaseSync = db, clock = Date.now) {
  database.exec(`CREATE TABLE IF NOT EXISTS mania_progress (userId TEXT NOT NULL, namespace TEXT NOT NULL, cityId TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(userId,namespace,cityId));
    CREATE TABLE IF NOT EXISTS mania_settings (userId TEXT NOT NULL, namespace TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(userId,namespace));
    CREATE TABLE IF NOT EXISTS mania_expeditions (userId TEXT NOT NULL, namespace TEXT NOT NULL, date TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(userId,namespace,date));`);
  const pending = new Map<string, PendingQuest>();
  const namespace = (identity: LearningIdentity) => identity.demo ? 'demo' : 'real';
  const settings = (identity: LearningIdentity): Settings => {
    const row = database.prepare('SELECT data FROM mania_settings WHERE userId=? AND namespace=?').get(identity.id, namespace(identity));
    return row ? JSON.parse(String(row.data)) as Settings : {};
  };
  const saveSettings = (identity: LearningIdentity, value: Settings) => database.prepare('INSERT INTO mania_settings VALUES (?,?,?) ON CONFLICT(userId,namespace) DO UPDATE SET data=excluded.data').run(identity.id, namespace(identity), JSON.stringify(value));
  const readState = (identity: LearningIdentity, cityId: string): StoredMastery => {
    const row = database.prepare('SELECT data FROM mania_progress WHERE userId=? AND namespace=? AND cityId=?').get(identity.id, namespace(identity), cityId);
    return row ? JSON.parse(String(row.data)) as StoredMastery : emptyMastery(clock());
  };
  const saveState = (identity: LearningIdentity, cityId: string, value: StoredMastery) => database.prepare('INSERT INTO mania_progress VALUES (?,?,?,?) ON CONFLICT(userId,namespace,cityId) DO UPDATE SET data=excluded.data').run(identity.id, namespace(identity), cityId, JSON.stringify(value));
  const city = (cityId: string) => {
    const item = bundle.world.cities.find(value => value.id === cityId);
    if (!item) throw new Error('That study city was not found.');
    return item;
  };
  function ensureDemo(identity: LearningIdentity) {
    if (!identity.demo || settings(identity).demoSeeded) return;
    const now = clock();
    for (const item of bundle.world.cities) {
      let state = emptyMastery(now);
      if (item.order < 15) {
        const age = item.order % 5 === 0 ? 6 : item.order % 3 === 0 ? 2 : 0.5;
        state = { ...state, exploredChapterIds: item.chapterIds.slice(0, Math.min(item.chapterIds.length, 8)), strength: 0.95,
          updatedAt: now - age * DAY, halfLifeDays: item.order % 5 === 0 ? 3 : 8, reviewCount: 3, spacedReviews: 3,
          reviewDays: [7, 4, age].map(days => new Date(now - days * DAY).toISOString().slice(0, 10)), mistakes: item.order % 4 === 0 ? 2 : 0,
          correctAnswers: 9, totalAnswers: 9 + (item.order % 4 === 0 ? 2 : 0), lastReviewedAt: now - age * DAY, lastSuccessAt: now - age * DAY,
          puzzleSolved: ['pipelining', 'caches'].includes(item.id) };
      } else if (item.order === 21) {
        state = { ...state, exploredChapterIds: item.chapterIds.slice(0, 3), strength: 0.95, updatedAt: now - DAY / 2, halfLifeDays: 8,
          reviewCount: 2, spacedReviews: 2, reviewDays: [4, 0.5].map(days => new Date(now - days * DAY).toISOString().slice(0, 10)), correctAnswers: 6, totalAnswers: 6,
          lastReviewedAt: now - DAY / 2, lastSuccessAt: now - DAY / 2, puzzleSolved: true };
      } else if (item.order === 15 || item.order === 23) state = { ...state, exploredChapterIds: item.chapterIds.slice(0, 2), strength: 0.22, mistakes: 3, totalAnswers: 3, reviewCount: 1, lastReviewedAt: now - DAY };
      saveState(identity, item.id, state);
    }
    saveSettings(identity, { ...settings(identity), demoSeeded: true });
  }
  function snapshot(identity: LearningIdentity): LearningSnapshot {
    ensureDemo(identity);
    const now = clock(), config = settings(identity);
    const exam = Object.hasOwn(config, 'examDate') ? examInfo(now, config.examDate || undefined) : examInfo(now);
    // Explicitly clearing a per-user date should also clear a deployment default.
    if (config.examDate === null) Object.assign(exam, { date: null, configured: false, daysRemaining: null, mockExamMode: false });
    const cities = bundle.world.cities.map(item => progressView(item.id, readState(identity, item.id), item.chapters.length, now));
    const day = new Date(now).toISOString().slice(0, 10);
    const stored = database.prepare('SELECT data FROM mania_expeditions WHERE userId=? AND namespace=? AND date=?').get(identity.id, namespace(identity), day);
    let expedition: DailyExpedition;
    if (stored) expedition = JSON.parse(String(stored.data)) as DailyExpedition;
    else {
      const chosen = new Set<string>();
      const pick = (items: CityProgress[]) => items.find(item => !chosen.has(item.cityId)) || cities.find(item => !chosen.has(item.cityId))!;
      const due = pick([...cities].filter(item => item.spacedReviews > 0).sort((a, b) => a.strength - b.strength)); chosen.add(due.cityId);
      const next = pick(cities.filter(item => item.spacedReviews === 0 && !item.exploredCount)); chosen.add(next.cityId);
      const weak = pick([...cities].sort((a, b) => (b.mistakes / Math.max(1, b.totalAnswers)) - (a.mistakes / Math.max(1, a.totalAnswers)) || a.strength - b.strength)); chosen.add(weak.cityId);
      expedition = { id: `${day}-${namespace(identity)}`, date: day, mode: exam.mockExamMode ? 'mock-exam' : 'daily', minutes: 25, questionCount: exam.mockExamMode ? 12 : 9,
        stops: [{ cityId: due.cityId, reason: 'review', minutes: 8, label: due.spacedReviews ? 'Refresh a fading memory' : 'Start with a foundation' },
          { cityId: next.cityId, reason: 'new', minutes: 9, label: next.spacedReviews ? 'Keep your knowledge connected' : 'Explore the next city' },
          { cityId: weak.cityId, reason: 'weak', minutes: 8, label: weak.mistakes ? 'Practice your trickiest concept' : 'Strengthen a connection' }], completedCityIds: [] };
      database.prepare('INSERT INTO mania_expeditions VALUES (?,?,?,?)').run(identity.id, namespace(identity), day, JSON.stringify(expedition));
    }
    expedition.mode = exam.mockExamMode ? 'mock-exam' : 'daily'; expedition.questionCount = exam.mockExamMode ? 12 : 9;
    expedition.completedCityIds = expedition.stops.filter(stop => {
      const success = readState(identity, stop.cityId).lastSuccessAt;
      return success !== null && new Date(success).toISOString().slice(0, 10) === day;
    }).map(stop => stop.cityId);
    const litCityCount = cities.filter(item => item.status === 'claimed' || item.status === 'thriving').length;
    return { profile: identity, cities, readiness: Math.round(litCityCount / cities.length * 100), litCityCount, totalCityCount: cities.length,
      thrivingCityCount: cities.filter(item => item.status === 'thriving').length, expedition, exam, serverTime: new Date(now).toISOString(),
      modelNotice: MODEL_NOTICE, demoNotice: identity.demo ? 'Demo profile · simulated study history from the past week. Your real progress is separate.' : null };
  }
  function explore(identity: LearningIdentity, cityId: string, chapterId: string) {
    ensureDemo(identity);
    const item = city(cityId);
    if (!item.chapterIds.includes(chapterId)) throw new Error('Choose a lecture moment from this city.');
    const state = readState(identity, cityId);
    if (!state.exploredChapterIds.includes(chapterId)) state.exploredChapterIds.push(chapterId);
    if (!state.spacedReviews) { state.strength = Math.min(0.28, 0.12 + 0.16 * state.exploredChapterIds.length / item.chapterIds.length); state.updatedAt = clock(); }
    saveState(identity, cityId, state); return snapshot(identity);
  }
  const publicQuestion = ({ answer: _answer, explanation: _explanation, ...question }: BankRecallQuestion) => question;
  function quest(identity: LearningIdentity, cityId?: string): RecallQuest | MockExamQuest {
    ensureDemo(identity);
    const now = clock();
    for (const [id, value] of pending) if (value.expiresAt < now) pending.delete(id);
    if (pending.size >= 10_000) throw new Error('Study sessions are busy. Please try again shortly.');
    if ([...pending.values()].filter(value => value.identityId === identity.id && value.namespace === namespace(identity)).length >= 20) throw new Error('Finish one of your open quests before opening more.');
    if (cityId) city(cityId);
    const questions = cityId ? bundle.bank.filter(question => question.cityId === cityId) : bundle.world.cities
      .filter((_, index) => index % 2 === Math.floor(now / DAY) % 2).map(item => bundle.bank.find(question => question.cityId === item.id)!);
    const questId = randomUUID(), expiresAt = now + (cityId ? 30 * 60_000 : 15 * 60_000);
    pending.set(questId, { identityId: identity.id, namespace: namespace(identity), cityId: cityId || null, questions, expiresAt, createdAt: now });
    return cityId ? { questId, cityId, questions: questions.map(publicQuestion), expiresAt: new Date(expiresAt).toISOString(), demo: identity.demo }
      : { questId, questions: questions.map(publicQuestion).sort((a, b) => a.id.localeCompare(b.id)), expiresAt: new Date(expiresAt).toISOString(), durationSeconds: 900, demo: identity.demo };
  }
  function review(identity: LearningIdentity, cityId: string | null, questId: string, answers: unknown): ReviewResponse {
    const value = pending.get(questId), now = clock();
    if (!value || value.identityId !== identity.id || value.namespace !== namespace(identity) || value.cityId !== cityId) throw new Error('Open a fresh recall quest for this city.');
    if (value.expiresAt < now) { pending.delete(questId); throw new Error('This quest expired. Open a fresh one.'); }
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new Error('Submit an answer for every question.');
    const submitted = answers as Record<string, unknown>;
    if (Object.keys(submitted).length !== value.questions.length || value.questions.some(question => typeof submitted[question.id] !== 'string' || !question.options.some(option => option.id === submitted[question.id]))) throw new Error('Choose one valid answer for every question.');
    const results: RecallResult[] = value.questions.map(question => ({ questionId: question.id, correct: submitted[question.id] === question.answer, answer: question.answer, explanation: question.explanation, source: question.source }));
    const correctCount = results.filter(result => result.correct).length, total = results.length, passed = correctCount / total >= 0.8;
    database.exec('BEGIN IMMEDIATE');
    try {
      if (cityId) saveState(identity, cityId, applyRecall(readState(identity, cityId), correctCount, total, now));
      else for (const question of value.questions) {
        const state = readState(identity, question.cityId), correct = submitted[question.id] === question.answer;
        // A single mixed-exam answer informs weaknesses, but cannot claim a whole city.
        saveState(identity, question.cityId, { ...state, mistakes: state.mistakes + (correct ? 0 : 1), totalAnswers: state.totalAnswers + 1, correctAnswers: state.correctAnswers + (correct ? 1 : 0) });
      }
      database.exec('COMMIT');
    } catch (error) { database.exec('ROLLBACK'); throw error; }
    pending.delete(questId);
    return { passed, score: Math.round(correctCount / total * 100), correctCount, total, results, snapshot: snapshot(identity) };
  }
  function setExam(identity: LearningIdentity, date: unknown) {
    if (date !== null && (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw new Error('Choose a valid exam date in YYYY-MM-DD format.');
    saveSettings(identity, { ...settings(identity), examDate: date as string | null }); return snapshot(identity);
  }
  function markLandmark(identity: LearningIdentity, cityId: string) {
    ensureDemo(identity); city(cityId); const state = readState(identity, cityId); state.puzzleSolved = true; saveState(identity, cityId, state); return snapshot(identity);
  }
  function resetDemo(identity: LearningIdentity) {
    if (!identity.demo) throw new Error('Only the demo profile can be reset.');
    database.prepare('DELETE FROM mania_progress WHERE userId=? AND namespace=?').run(identity.id, 'demo');
    database.prepare('DELETE FROM mania_settings WHERE userId=? AND namespace=?').run(identity.id, 'demo');
    database.prepare('DELETE FROM mania_expeditions WHERE userId=? AND namespace=?').run(identity.id, 'demo');
    for (const [id, value] of pending) if (value.identityId === identity.id && value.namespace === 'demo') pending.delete(id);
    return snapshot(identity);
  }
  function cityWeather() {
    const rows = database.prepare("SELECT cityId,data FROM mania_progress WHERE namespace='real'").all();
    return bundle.world.cities.map(item => {
      const states = rows.filter(row => row.cityId === item.id).map(row => JSON.parse(String(row.data)) as StoredMastery).filter(state => state.totalAnswers > 0);
      const totalAnswers = states.reduce((sum, state) => sum + state.totalAnswers, 0);
      const incorrectAnswers = states.reduce((sum, state) => sum + state.mistakes, 0);
      const wrongRate = totalAnswers ? incorrectAnswers / totalAnswers : 0;
      return { cityId: item.id, students: states.length, totalAnswers, incorrectAnswers, wrongRate, storm: states.length >= 3 && wrongRate >= 0.4 };
    });
  }
  return { bundle, snapshot, explore, quest, review, setExam, markLandmark, resetDemo, readState, cityWeather };
}

let mountedService: ReturnType<typeof createManiaService> | null = null;
export function getWorld(): WorldData {
  if (!mountedService) throw new Error('The semester map is not initialized.');
  return mountedService.bundle.world;
}
/** Called only after a server-validated puzzle result, never directly by a client route. */
export function markLandmarkSolved(userId: string, cityId: string, demo = false) {
  if (!mountedService) throw new Error('The semester map is not initialized.');
  return mountedService.markLandmark({ id: userId, name: 'Student', source: userId.startsWith('proxy:') ? 'proxy' : 'guest', demo }, cityId);
}
export function cityWeather() {
  if (!mountedService) throw new Error('The semester map is not initialized.');
  return mountedService.cityWeather();
}

export async function mountMania(app: express.Express, _io?: Server) {
  const service = createManiaService(await loadWorld()); mountedService = service;
  const rates = new Map<string, { started: number; count: number }>();
  const route = (handler: (req: express.Request, identity: LearningIdentity) => unknown) => (req: express.Request, res: express.Response) => {
    try {
      if (req.method === 'POST' && !req.is('application/json')) return res.status(415).json({ error: 'Use Content-Type application/json.' });
      const identity = maniaIdentity(req, res), now = Date.now();
      if (rates.size > 10_000) for (const [key, rate] of rates) if (now - rate.started > 60_000) rates.delete(key);
      let rate = rates.get(identity.id); if (!rate || now - rate.started >= 60_000) { rate = { started: now, count: 0 }; rates.set(identity.id, rate); }
      if (++rate.count > 120) return res.status(429).json({ error: 'Too many study requests. Please wait a moment.' });
      res.json(handler(req, identity));
    } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'The study request could not be completed.' }); }
  };
  app.get('/api/mania/world', (_req, res) => res.json({ ...service.bundle.world, exam: examInfo() }));
  app.get('/api/mania/progress', route((_req, identity) => service.snapshot(identity)));
  app.post('/api/mania/exam', route((req, identity) => service.setExam(identity, req.body?.date)));
  app.post('/api/mania/cities/:id/explore', route((req, identity) => service.explore(identity, String(req.params.id), req.body?.chapterId)));
  app.get('/api/mania/cities/:id/quest', route((req, identity) => service.quest(identity, String(req.params.id))));
  app.post('/api/mania/cities/:id/review', route((req, identity) => service.review(identity, String(req.params.id), req.body?.questId, req.body?.answers)));
  app.get('/api/mania/mock-exam', route((_req, identity) => service.quest(identity)));
  app.post('/api/mania/mock-exam/review', route((req, identity) => service.review(identity, null, req.body?.questId, req.body?.answers)));
  app.post('/api/mania/demo/reset', route((_req, identity) => service.resetDemo({ ...identity, demo: true })));
  return service;
}
