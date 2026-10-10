import type express from 'express';
import { createAnswerService, createOllamaExplainer } from '../video-pull-up/src/answers.mjs';
import { InputError, validateQuestion } from '../video-pull-up/src/catalog.mjs';
import { loadLectureCatalog } from './lecture-catalog';
import { qaAnswer, runPythonQA } from './lecture-qa';

const demonstrations = [
  {
    question: 'Why does a load followed by add stall even with forwarding?', lectureId: 'lec11', chapterId: 'lec11-chapter-11-17',
    text: 'A load produces its value at the end of MEM. The immediately following ADD needs that value at the start of EX in the same cycle. Forwarding cannot move a value backward in time, so the pipeline holds IF and ID for one cycle and inserts a bubble into EX. In the next cycle the loaded value can be forwarded to the ADD.',
  },
  {
    question: 'How does LRU cache replacement work?', lectureId: 'lec21', chapterId: 'lec21-chapter-21-5',
    text: 'LRU tracks the last time each cache block was accessed. When a miss needs space in a full set, it evicts the least recently accessed block in that set. A hit updates the recency order. Associativity determines which blocks compete; replacement chooses among the ways in the selected set.',
  },
  {
    question: 'How does a virtual memory page table work?', lectureId: 'lec23', chapterId: 'lec23-chapter-23-16',
    text: 'Split a virtual address into its virtual page number and page offset. A page-table entry maps the virtual page to a physical frame and records validity and protection information. Combine the physical frame number with the unchanged offset to form the physical address. A missing mapping can trigger a page fault. The TLB caches recent translations.',
  },
];

export const normalizedQuestion = (question: string) => question.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Cache the exact stage questions with real anchors, independently of model availability. */
export async function mountManiaAnswers(app: express.Express) {
  const catalog = await loadLectureCatalog();
  const explain = process.env.OLLAMA_MODEL ? createOllamaExplainer({ model: process.env.OLLAMA_MODEL, baseUrl: process.env.OLLAMA_BASE_URL }) : null;
  const search = createAnswerService(catalog, { explain });
  const cache = new Map<string, unknown>();
  for (const demonstration of demonstrations) {
    const lecture = catalog.lectures.find(item => item.id === demonstration.lectureId);
    const chapter = lecture?.chapters?.find(item => item.id === demonstration.chapterId);
    if (!lecture || !chapter) continue;
    const transcript = lecture.segments.filter(item => item.start < chapter.end && item.end > chapter.start).map(item => item.transcript).join(' ');
    const source = { id: 'S1', lectureId: lecture.id, courseId: lecture.courseId, courseName: 'Digital Design & Computer Architecture', lectureTitle: lecture.title, segmentId: chapter.id, title: chapter.title, start: chapter.start, end: chapter.end, contextStart: chapter.start, transcript, mediaUrl: lecture.mediaUrl, playbackUrl: lecture.mediaUrl ? `${lecture.mediaUrl}#t=${chapter.start}` : null, demo: false };
    cache.set(normalizedQuestion(demonstration.question), { question: demonstration.question, courseId: lecture.courseId, status: 'answered', answer: { mode: 'demo_cached', text: demonstration.text, paragraphs: [{ text: demonstration.text, sourceIds: ['S1'] }], notice: 'Pre-reviewed demonstration answer, linked to the original DDCA chapter.' }, sources: [source], playback: lecture.mediaUrl ? { lectureId: lecture.id, sourceId: 'S1', mediaUrl: lecture.mediaUrl, start: chapter.start, end: chapter.end } : null });
  }
  let active = 0;
  app.post('/api/mania/ask', async (req, res) => {
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    try {
      const request = validateQuestion(req.body, catalog);
      const cached = (!request.lectureId && request.courseId === 'computer-architecture') ? cache.get(normalizedQuestion(request.question)) : undefined;
      if (cached) return res.json(cached);
      if (process.env.LECTURE_QA_PROVIDER === 'python' && (!request.courseId || request.courseId === 'computer-architecture')) {
        if (active >= 2) return res.status(429).json({ error: 'Lecture answers are busy. Try again in a moment.' });
        active++;
        try { const result = await runPythonQA(request, controller.signal); if (!controller.signal.aborted) return res.json(qaAnswer(result, request, catalog)); }
        catch { if (controller.signal.aborted) return; }
        finally { active--; }
      }
      if (!controller.signal.aborted) res.json(await search(request));
    } catch (error) { if (!res.destroyed) res.status(error instanceof InputError ? error.status : 500).json({ error: error instanceof InputError ? error.message : 'Lecture search is unavailable. Try again.' }); }
  });
}
