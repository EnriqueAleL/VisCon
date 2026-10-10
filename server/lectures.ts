import express from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createOllamaExplainer } from '../video-pull-up/src/answers.mjs';
import { InputError, validateQuestion } from '../video-pull-up/src/catalog.mjs';
import type { LectureSummary } from '../web-interface/src/types';
import { createCatalogStore } from './catalog-store';
import { mountCourseMedia } from './course-catalog';
import { DEPARTMENTS } from '../shared/departments';
import { loadLectureCatalog, projectRoot, readSummary } from './lecture-catalog';
import { qaAnswer, runPythonQA } from './lecture-qa';
import { chatReply, validateChat } from './lecture-chat';

export interface MountLecturesDeps {
  db: DatabaseSync;
  /** Published courses live here (the same folder the indexer fills). */
  coursesDir: string;
}

export async function mountLectures(app: express.Express, deps: MountLecturesDeps) {
  const provider = process.env.LECTURE_QA_PROVIDER || 'local';
  if (!['local', 'python'].includes(provider)) throw new Error('LECTURE_QA_PROVIDER must be local or python.');
  const explain = process.env.OLLAMA_MODEL ? createOllamaExplainer({ model: process.env.OLLAMA_MODEL, baseUrl: process.env.OLLAMA_BASE_URL }) : null;
  const store = createCatalogStore({ legacy: await loadLectureCatalog(), db: deps.db, coursesDir: deps.coursesDir, provider, explain });
  await store.snapshot();
  mountCourseMedia(app, { db: deps.db, coursesDir: deps.coursesDir });

  const route = (fn: (req: express.Request, res: express.Response) => unknown): express.RequestHandler => async (req, res, next) => {
    try { await fn(req, res); } catch (error) { next(error); }
  };
  app.get('/api/courses', route(async (_req, res) => { res.json({ courses: (await store.snapshot()).catalog.courses, departments: DEPARTMENTS }); }));

  // The same list as ever (the app loads it once and filters in the browser), but serialised and compressed once per
  // catalogue version, and revalidated with an ETag: an unchanged list costs a 304 with no body.
  app.get('/api/lectures', route(async (req, res) => {
    const snap = await store.snapshot();
    const wanted = typeof req.query.courseId === 'string' ? req.query.courseId : null;
    const courseId = wanted && wanted !== 'all' ? wanted : null;
    if (courseId && !snap.catalog.courses.some(course => course.id === courseId)) return res.status(404).json({ error: 'Unbekannter Kurs.' });
    const entry = snap.list(courseId);
    res.set({ ETag: entry.etag, 'Cache-Control': 'private, no-cache', Vary: 'Accept-Encoding, Cookie', 'Content-Type': 'application/json; charset=utf-8' });
    if (req.headers['if-none-match'] === entry.etag) return res.status(304).end();
    if (/\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))) { res.set('Content-Encoding', 'gzip'); return res.send(entry.gzip); }
    res.send(entry.body);
  }));
  app.get('/api/lectures/:id', route(async (req, res) => {
    const lecture = (await store.snapshot()).catalog.lectures.find(item => item.id === req.params.id);
    if (!lecture) return res.status(404).json({ error: 'Vorlesung nicht gefunden.' });
    res.json({ lecture: { ...lecture, segments: lecture.segments.map(({ cues: _cues, ...segment }) => segment) } });
  }));
  app.get('/api/lectures/:id/summary', route(async (req, res) => {
    const snap = await store.snapshot();
    const lecture = snap.catalog.lectures.find(item => item.id === req.params.id);
    if (!lecture) return res.status(404).json({ error: 'Vorlesung nicht gefunden.' });
    const file = snap.summaryFile(lecture);
    res.json({ summary: file ? JSON.parse(await readFile(file, 'utf8')) as LectureSummary : await readSummary(lecture.id) });
  }));

  let activeModelRequests = 0;
  app.post(['/api/ask', '/api/search'], async (req, res) => {
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    try {
      if (!req.is('application/json')) throw new InputError('Content-Type application/json erwartet.', 415);
      const snap = await store.snapshot();
      const request = validateQuestion(req.body, snap.catalog);
      // No course chosen means the original recordings, as before. Any course with an index can use the model.
      const courseId = request.courseId ?? 'computer-architecture';
      const lecture = request.lectureId ? snap.catalog.lectures.find(item => item.id === request.lectureId) : null;
      const workspace = provider === 'python' && (!lecture || (lecture.courseId === courseId && !lecture.demo)) ? snap.workspace(courseId) : null;
      if (workspace) {
        if (activeModelRequests >= 2) throw new InputError('Die Suche ist gerade ausgelastet. Bitte versuche es gleich erneut.', 429);
        activeModelRequests++;
        try {
          const result = await runPythonQA({ ...request, lectureId: lecture ? `lec${lecture.episode}` : null }, controller.signal, workspace.env);
          if (!controller.signal.aborted) res.json(qaAnswer(result, request, snap.catalog, courseId));
          return;
        } catch {
          if (controller.signal.aborted) return;
          const fallback = await snap.ask(request);
          fallback.answer.mode = 'extractive_fallback';
          fallback.answer.notice = 'Die KI-Suche ist gerade nicht verfügbar. Angezeigt werden lokale Transkript-Treffer; versuche es erneut oder präzisiere deine Suchbegriffe.';
          res.json(fallback);
          return;
        } finally { activeModelRequests--; }
      }
      res.json(await snap.ask(request));
    } catch (error) {
      if (res.destroyed) return;
      res.status(error instanceof InputError ? error.status : 500).json({ error: error instanceof InputError ? error.message : 'Die Vorlesungssuche ist gerade nicht verfügbar. Bitte versuche es erneut.' });
    }
  });

  // Chat next to a video or city: the open lecture first, the whole course when it does not cover the question.
  app.post('/api/lectures/:id/chat', async (req, res) => {
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    try {
      if (!req.is('application/json')) throw new InputError('Content-Type application/json erwartet.', 415);
      const snap = await store.snapshot();
      const lecture = snap.catalog.lectures.find(item => item.id === req.params.id);
      if (!lecture) throw new InputError('Vorlesung nicht gefunden.', 404);
      const chat = validateChat(req.body);
      const workspace = provider === 'python' && !lecture.demo ? snap.workspace(lecture.courseId) : null;
      if (!workspace) throw new InputError('Der KI-Chat ist für diese Vorlesung nicht verfügbar.', 503);
      if (activeModelRequests >= 2) throw new InputError('Der Chat ist gerade ausgelastet. Bitte versuche es gleich erneut.', 429);
      activeModelRequests++;
      try {
        const result = await runPythonQA({
          question: chat.message, courseId: lecture.courseId, lectureId: `lec${lecture.episode}`, language: chat.language,
          mode: 'chat', history: chat.history, currentTime: chat.currentTime,
        }, controller.signal, workspace.env);
        if (!controller.signal.aborted) res.json(chatReply(result, snap.catalog, lecture.courseId));
      } finally { activeModelRequests--; }
    } catch (error) {
      if (res.destroyed || controller.signal.aborted) return;
      res.status(error instanceof InputError ? error.status : 500).json({ error: error instanceof InputError ? error.message : 'Der Chat ist gerade nicht verfügbar. Bitte versuche es erneut.' });
    }
  });

  // Express supplies byte-range and HEAD responses for native video seeking.
  app.use('/media/lectures', express.static(join(projectRoot, 'lectures'), { index: false, fallthrough: false, dotfiles: 'deny' }));
  app.use('/media/chapters', express.static(join(projectRoot, 'qa/data/chapters'), { index: false, fallthrough: false, dotfiles: 'deny' }));
  app.use('/media', express.static(join(projectRoot, 'video-pull-up/media'), { index: false, fallthrough: false, dotfiles: 'deny' }));

  return {
    /** True when the lecture is in the current catalogue and, if given, the chapter belongs to it. */
    async knows(lectureId: string, chapterId: string | null) {
      const lecture = (await store.snapshot()).catalog.lectures.find(item => item.id === lectureId);
      if (!lecture) return false;
      return chapterId === null || [...(lecture.chapters ?? []), ...lecture.segments].some(part => part.id === chapterId);
    }
  };
}
