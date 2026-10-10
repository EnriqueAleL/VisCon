import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AnswerResult, Source } from '../video-pull-up/client/client.mjs';
import type { LectureCatalog } from './lecture-catalog';
import { buildPythonEnv } from '../indexing/runner';
import { projectRoot } from './lecture-catalog';

interface QAResult { found: boolean; answer: string; lecture: number | null; start: number | null; end: number | null; chapter: string | null }
export interface QARequest { question: string; courseId: string | null; lectureId: string | null }

/** The Q&A tool reads these too (the original recordings can be configured with them), besides the model settings. */
const QA_PASS_THROUGH = ['PATH', 'LANG', 'LC_ALL', 'TMPDIR', 'SYSTEMROOT', 'HOME', 'OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_ORG_ID', 'QA_INDEX_MODEL', 'QA_ANSWER_MODEL', 'QA_LECTURES_DIR', 'QA_INDEX_PATH', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'SSL_CERT_FILE', 'REQUESTS_CA_BUNDLE'];

/** `workspace` points the tool at one course's folders (see Snapshot.workspace); `request.lectureId` is then the course-local `lec<N>`. */
export function runPythonQA(request: QARequest, signal: AbortSignal, workspace: Record<string, string> = {}): Promise<QAResult> {
  const localPython = join(projectRoot, '.venv/bin/python');
  const python = process.env.QA_PYTHON || (existsSync(localPython) ? localPython : 'python3');
  return new Promise((resolve, reject) => {
    const child = spawn(python, ['-m', 'viscon_qa.web'], { cwd: join(projectRoot, 'qa'), signal, stdio: ['pipe', 'pipe', 'ignore'], env: buildPythonEnv(process.env, workspace, QA_PASS_THROUGH) });
    let output = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Q&A timed out')); }, 120_000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      output += chunk;
      if (output.length > 1_000_000) { child.kill(); reject(new Error('Q&A response too large')); }
    });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) { reject(new Error('Q&A is unavailable')); return; }
      try { resolve(JSON.parse(output)); } catch { reject(new Error('Invalid Q&A response')); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(request));
  });
}

/** Map only validated transcript timestamps into the existing video-pull-up response. */
export function qaAnswer(result: QAResult, request: QARequest, catalog: LectureCatalog, courseId: string | null = request.courseId): AnswerResult {
  if (typeof result.found !== 'boolean' || typeof result.answer !== 'string') throw new Error('Invalid Q&A response');
  if (!result.found) return {
    ...request, status: 'no_match', answer: { mode: 'generated', text: '', paragraphs: [], notice: result.answer },
    sources: [], playback: null, videos: [],
  };
  // The tool answers with the lecture number inside one course; find that lecture of that course (no course given: the original recordings).
  const lecture = catalog.lectures.find(item => item.courseId === (courseId ?? 'computer-architecture') && item.episode === result.lecture && !item.demo);
  if (!lecture || (request.lectureId && lecture.id !== request.lectureId)
    || (request.courseId && lecture.courseId !== request.courseId)
    || result.start === null || result.end === null || !Number.isFinite(result.start) || !Number.isFinite(result.end)
    || result.start < 0 || result.end <= result.start || result.start >= lecture.duration || result.end > lecture.duration) throw new Error('Invalid Q&A timestamp');
  const start = result.start, end = result.end;
  const segment = lecture.segments.find(item => item.end > start && item.start < end);
  if (!segment) throw new Error('Q&A timestamp has no transcript');
  const transcript = lecture.segments.filter(item => item.end > start && item.start < end).map(item => item.transcript).join(' ');
  const source: Source = {
    id: 'S1', lectureId: lecture.id, courseId: lecture.courseId,
    courseName: catalog.courses.find(item => item.id === lecture.courseId)!.name,
    lectureTitle: lecture.title, segmentId: segment.id, title: result.chapter || segment.title,
    start, end, contextStart: segment.start, transcript, mediaUrl: lecture.mediaUrl ?? null,
    playbackUrl: lecture.mediaUrl ? `${lecture.mediaUrl}#t=${start}` : null, score: 0, demo: false,
  };
  return {
    ...request, status: 'answered',
    answer: { mode: 'generated', text: result.answer, paragraphs: [{ text: result.answer, sourceIds: ['S1'] }], notice: 'KI-Antwort aus dem Kapitelindex und den Transkripten. Prüfe die Erklärung an der verlinkten Vorlesungsstelle.' },
    sources: [source],
    playback: source.mediaUrl ? { sourceId: 'S1', lectureId: lecture.id, mediaUrl: source.mediaUrl, url: source.playbackUrl!, start, end } : null,
    videos: [{ ...lecture, segments: [{ ...segment, start, end, transcript, sourceId: 'S1' }] }],
  };
}
