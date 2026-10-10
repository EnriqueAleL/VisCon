/* Live state behind the galaxy cities: who is in which lecture right now, and how hard
 * each chapter is.
 *
 * Presence is a heartbeat, not a socket: the galaxy page reports where it is every few
 * seconds and on every move, and anyone not heard from for HERE_TTL drops out. That keeps
 * it on the ordinary guarded /api routes and needs no client library on the plain page.
 *
 * Difficulty is the hybrid the team chose: students rate a chapter 1-5 after watching,
 * and where the study world has recall answers for the same chapter, its mistake rate
 * counts as extra evidence. Below MIN_WEIGHT of evidence a chapter has no score, and the
 * city shows neutral weather rather than guessing.
 */
import type express from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { cityWeather, getWorld } from './mania';

export interface ChapterQuiz { answers: number; wrongRate: number }
export interface Difficulty { score: number | null; weight: number; votes: number }

export interface GalaxyLiveOptions {
  db: DatabaseSync;
  clock?: () => number;
  /** True when the lecture exists and, if given, the chapter belongs to it. */
  knows: (lectureId: string, chapterId: string | null) => boolean | Promise<boolean>;
  /** Recall-answer evidence per chapter id; defaults to the study world's answers. */
  quiz?: () => Map<string, ChapterQuiz>;
}

export const HERE_TTL = 45_000;
export const MIN_WEIGHT = 3;
const MAX_RATINGS_PER_PLAYER = 3000;
const ID = /^[A-Za-z0-9_.-]{1,120}$/;

export class GalaxyInputError extends Error {}

/** Ratings and quiz evidence on one 1-5 scale. A 60 % mistake rate already counts as the hardest. */
export function difficultyOf(ratingSum: number, votes: number, quiz?: ChapterQuiz): Difficulty {
  let total = ratingSum, weight = votes;
  if (quiz && quiz.answers > 0) {
    const w = Math.min(5, quiz.answers / 5);
    total += w * (1 + 4 * Math.min(1, quiz.wrongRate / 0.6));
    weight += w;
  }
  const score = weight >= MIN_WEIGHT ? Math.round((total / weight) * 10) / 10 : null;
  return { score, weight: Math.round(weight * 10) / 10, votes };
}

/** The study world's recall answers, spread over the chapters of each topic city. */
function studyWorldQuiz(): Map<string, ChapterQuiz> {
  const out = new Map<string, ChapterQuiz>();
  try {
    const weather = new Map(cityWeather().map(item => [item.cityId, item]));
    for (const city of getWorld().cities) {
      const w = weather.get(city.id);
      if (!w || !w.totalAnswers || !city.chapterIds.length) continue;
      for (const id of city.chapterIds) out.set(id, { answers: w.totalAnswers / city.chapterIds.length, wrongRate: w.wrongRate });
    }
  } catch { /* the study world is not mounted (tests, or a deployment without it) */ }
  return out;
}

const lectureOf = (chapterId: string) => chapterId.replace(/-chapter-.*$/, '');

export function createGalaxyLive(options: GalaxyLiveOptions) {
  const { db } = options;
  const clock = options.clock ?? Date.now;
  const quiz = options.quiz ?? studyWorldQuiz;
  db.exec(`CREATE TABLE IF NOT EXISTS galaxy_difficulty (playerId TEXT NOT NULL, lectureId TEXT NOT NULL, chapterId TEXT NOT NULL,
    rating INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY(playerId, chapterId))`);
  const here = new Map<string, { lectureId: string; chapterId: string | null; at: number }>();

  function id(value: unknown, field: string, optional = false): string | null {
    if (optional && (value === null || value === undefined || value === '')) return null;
    if (typeof value !== 'string' || !ID.test(value)) throw new GalaxyInputError(`Invalid ${field}.`);
    return value;
  }

  async function setHere(playerId: string, body: unknown) {
    const input = (body ?? {}) as Record<string, unknown>;
    const lectureId = id(input.lectureId, 'lecture', true);
    const chapterId = lectureId ? id(input.chapterId, 'chapter', true) : null;
    if (!lectureId) here.delete(playerId);
    else {
      if (!(await options.knows(lectureId, chapterId))) throw new GalaxyInputError('Unknown lecture or chapter.');
      here.set(playerId, { lectureId, chapterId, at: clock() });
    }
    return snapshot(playerId);
  }

  async function rate(playerId: string, body: unknown) {
    const input = (body ?? {}) as Record<string, unknown>;
    const lectureId = id(input.lectureId, 'lecture')!;
    const chapterId = id(input.chapterId, 'chapter')!;
    const rating = Number(input.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new GalaxyInputError('Rate from 1 (easy) to 5 (hard).');
    if (!(await options.knows(lectureId, chapterId))) throw new GalaxyInputError('Unknown lecture or chapter.');
    const existing = db.prepare('SELECT 1 FROM galaxy_difficulty WHERE playerId=? AND chapterId=?').get(playerId, chapterId);
    const count = (db.prepare('SELECT COUNT(*) AS n FROM galaxy_difficulty WHERE playerId=?').get(playerId) as { n: number }).n;
    if (!existing && count >= MAX_RATINGS_PER_PLAYER) throw new GalaxyInputError('Too many ratings.');
    db.prepare(`INSERT INTO galaxy_difficulty VALUES (?,?,?,?,?) ON CONFLICT(playerId, chapterId)
      DO UPDATE SET rating=excluded.rating, at=excluded.at`).run(playerId, lectureId, chapterId, rating, clock());
    return snapshot(playerId);
  }

  function snapshot(playerId: string) {
    const now = clock();
    for (const [key, value] of here) if (now - value.at > HERE_TTL) here.delete(key);
    const online = { lectures: {} as Record<string, number>, chapters: {} as Record<string, number> };
    for (const value of here.values()) {
      online.lectures[value.lectureId] = (online.lectures[value.lectureId] ?? 0) + 1;
      if (value.chapterId) online.chapters[value.chapterId] = (online.chapters[value.chapterId] ?? 0) + 1;
    }

    const rows = db.prepare('SELECT chapterId, SUM(rating) AS total, COUNT(*) AS votes FROM galaxy_difficulty GROUP BY chapterId')
      .all() as { chapterId: string; total: number; votes: number }[];
    const ratings = new Map(rows.map(row => [row.chapterId, row]));
    const evidence = quiz();
    const chapters: Record<string, Difficulty> = {};
    for (const chapterId of new Set([...ratings.keys(), ...evidence.keys()])) {
      const r = ratings.get(chapterId);
      chapters[chapterId] = difficultyOf(r?.total ?? 0, r?.votes ?? 0, evidence.get(chapterId));
    }
    // A lecture's weather is its chapters' scores, weighted by how much evidence each has
    const sums = new Map<string, { total: number; weight: number }>();
    for (const [chapterId, d] of Object.entries(chapters)) {
      if (d.score === null) continue;
      const s = sums.get(lectureOf(chapterId)) ?? { total: 0, weight: 0 };
      s.total += d.score * d.weight; s.weight += d.weight;
      sums.set(lectureOf(chapterId), s);
    }
    const lectures: Record<string, { score: number; weight: number }> = {};
    for (const [lectureId, s] of sums) lectures[lectureId] = { score: Math.round((s.total / s.weight) * 10) / 10, weight: Math.round(s.weight * 10) / 10 };

    const mine = Object.fromEntries((db.prepare('SELECT chapterId, rating FROM galaxy_difficulty WHERE playerId=?').all(playerId) as
      { chapterId: string; rating: number }[]).map(row => [row.chapterId, row.rating]));
    return { online, difficulty: { lectures, chapters }, mine, ttl: HERE_TTL, serverTime: now };
  }

  return { setHere, rate, snapshot };
}

type Route = (handler: (req: express.Request, res: express.Response, player: { id: string }) => unknown) => express.RequestHandler;

/** Mounts the three galaxy routes behind the app's own guarded, rate-limited route wrapper. */
export function mountGalaxyLive(app: express.Express, route: Route, options: GalaxyLiveOptions) {
  const live = createGalaxyLive(options);
  app.get('/api/galaxy/live', route((_req, res, p) => res.json(live.snapshot(p.id))));
  app.post('/api/galaxy/here', route(async (req, res, p) => res.json(await live.setHere(p.id, req.body))));
  app.post('/api/galaxy/difficulty', route(async (req, res, p) => res.json(await live.rate(p.id, req.body))));
  return live;
}
