import express from 'express';
import { join } from 'node:path';
import { createAnswerService, createOllamaExplainer } from '../video-pull-up/src/answers.mjs';
import { InputError, validateQuestion } from '../video-pull-up/src/catalog.mjs';
import { lecturePreview, loadLectureCatalog, projectRoot, readSummary } from './lecture-catalog';
import { qaAnswer, runPythonQA } from './lecture-qa';

export async function mountLectures(app: express.Express) {
  const catalog = await loadLectureCatalog();
  const provider = process.env.LECTURE_QA_PROVIDER || 'local';
  if (!['local', 'python'].includes(provider)) throw new Error('LECTURE_QA_PROVIDER must be local or python.');
  const explain = process.env.OLLAMA_MODEL ? createOllamaExplainer({ model: process.env.OLLAMA_MODEL, baseUrl: process.env.OLLAMA_BASE_URL }) : null;
  const ask = createAnswerService(catalog, { explain });
  app.get('/api/courses', (_req, res) => res.json({ courses: catalog.courses }));
  app.get('/api/lectures', (req, res) => {
    const courseId = req.query.courseId;
    if (courseId && courseId !== 'all' && !catalog.courses.some(course => course.id === courseId)) return res.status(404).json({ error: 'Unbekannter Kurs.' });
    res.json({ lectures: catalog.lectures.filter(item => !courseId || courseId === 'all' || item.courseId === courseId).map(lecturePreview), provider });
  });
  app.get('/api/lectures/:id', (req, res) => {
    const lecture = catalog.lectures.find(item => item.id === req.params.id);
    if (!lecture) return res.status(404).json({ error: 'Vorlesung nicht gefunden.' });
    res.json({ lecture: { ...lecture, segments: lecture.segments.map(({ cues: _cues, ...segment }) => segment) } });
  });
  app.get('/api/lectures/:id/summary', async (req, res, next) => {
    if (!catalog.lectures.some(item => item.id === req.params.id)) return res.status(404).json({ error: 'Vorlesung nicht gefunden.' });
    try { res.json({ summary: await readSummary(String(req.params.id)) }); } catch (error) { next(error); }
  });
  let activeModelRequests = 0;
  app.post(['/api/ask', '/api/search'], async (req, res) => {
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    try {
      if (!req.is('application/json')) throw new InputError('Content-Type application/json erwartet.', 415);
      const request = validateQuestion(req.body, catalog);
      if (provider === 'python' && (!request.courseId || request.courseId === 'computer-architecture') && (!request.lectureId || /^lec\d+$/.test(request.lectureId))) {
        if (activeModelRequests >= 2) throw new InputError('Die Suche ist gerade ausgelastet. Bitte versuche es gleich erneut.', 429);
        activeModelRequests++;
        try {
          const result = await runPythonQA(request, controller.signal);
          if (!controller.signal.aborted) res.json(qaAnswer(result, request, catalog));
          return;
        } catch {
          if (controller.signal.aborted) return;
          const fallback = await ask(request);
          fallback.answer.mode = 'extractive_fallback';
          fallback.answer.notice = 'Die KI-Suche ist gerade nicht verfügbar. Angezeigt werden lokale Transkript-Treffer; versuche es erneut oder präzisiere deine Suchbegriffe.';
          res.json(fallback);
          return;
        } finally { activeModelRequests--; }
      }
      res.json(await ask(request));
    } catch (error) {
      if (res.destroyed) return;
      res.status(error instanceof InputError ? error.status : 500).json({ error: error instanceof InputError ? error.message : 'Die Vorlesungssuche ist gerade nicht verfügbar. Bitte versuche es erneut.' });
    }
  });
  // Express supplies byte-range and HEAD responses for native video seeking.
  app.use('/media/lectures', express.static(join(projectRoot, 'lectures'), { index: false, fallthrough: false, dotfiles: 'deny' }));
  app.use('/media/chapters', express.static(join(projectRoot, 'qa/data/chapters'), { index: false, fallthrough: false, dotfiles: 'deny' }));
  app.use('/media', express.static(join(projectRoot, 'video-pull-up/media'), { index: false, fallthrough: false, dotfiles: 'deny' }));
}
