import { InputError } from '../video-pull-up/src/catalog.mjs';
import type { LectureCatalog } from './lecture-catalog';
import { LABELS, type QAResult } from './lecture-qa';

export interface ChatTurn { role: 'user' | 'assistant'; text: string }
export interface ChatRequest {
  message: string;
  history: ChatTurn[];
  /** Where the student is in the video, in seconds; null when the video is not playing (e.g. in the city view). */
  currentTime: number | null;
  language: 'auto' | 'en' | 'de';
}

const MAX_MESSAGE = 1000;
const MAX_TURNS = 6;
const MAX_TURN_CHARS = 1500;

/** The chat is stateless on the server: the browser sends the last few turns with every message. */
export function validateChat(input: unknown): ChatRequest {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new InputError('JSON-Objekt erwartet.');
  const body = input as Record<string, unknown>;
  if (typeof body.message !== 'string' || !body.message.trim()) throw new InputError('Nachricht fehlt.');
  const message = body.message.trim();
  if (message.length > MAX_MESSAGE) throw new InputError(`Die Nachricht darf maximal ${MAX_MESSAGE} Zeichen enthalten.`);

  const rawHistory = body.history ?? [];
  if (!Array.isArray(rawHistory)) throw new InputError('history muss eine Liste sein.');
  const history: ChatTurn[] = [];
  for (const item of rawHistory.slice(-MAX_TURNS)) {
    if (!item || typeof item !== 'object') throw new InputError('Ungültiger Verlauf.');
    const turn = item as Record<string, unknown>;
    if ((turn.role !== 'user' && turn.role !== 'assistant') || typeof turn.text !== 'string') throw new InputError('Ungültiger Verlauf.');
    const text = turn.text.trim().slice(0, MAX_TURN_CHARS);
    if (text) history.push({ role: turn.role, text });
  }

  const time = body.currentTime ?? null;
  if (time !== null && (typeof time !== 'number' || !Number.isFinite(time) || time < 0 || time > 24 * 3600)) throw new InputError('currentTime ist ungültig.');
  const language = body.language ?? 'auto';
  if (language !== 'auto' && language !== 'en' && language !== 'de') throw new InputError('language muss auto, en oder de sein.');
  return { message, history, currentTime: time, language };
}

export interface ChatMoment { lectureId: string; lectureTitle: string; courseId: string; start: number; end: number; title: string | null }
export interface ChatResponse {
  status: 'answered' | 'no_match';
  /** "lecture": answered from the open lecture. "course": the open lecture did not cover it, the course was searched. */
  scope: 'lecture' | 'course';
  reply: string;
  background: string;
  backgroundLabel: string;
  language: 'en' | 'de';
  moment: ChatMoment | null;
}

/** The jump target is optional: a bad timestamp drops the link, never the answer. */
function momentOf(result: QAResult, catalog: LectureCatalog, courseId: string): ChatMoment | null {
  if (typeof result.lecture !== 'number' || typeof result.start !== 'number' || typeof result.end !== 'number') return null;
  const lecture = catalog.lectures.find(item => item.courseId === courseId && item.episode === result.lecture && !item.demo);
  if (!lecture || !Number.isFinite(result.start) || !Number.isFinite(result.end)) return null;
  if (result.start < 0 || result.start >= lecture.duration || result.end <= result.start) return null;
  return {
    lectureId: lecture.id, lectureTitle: lecture.title, courseId,
    start: result.start, end: Math.min(result.end, lecture.duration), title: result.chapter || null,
  };
}

export function chatReply(result: QAResult, catalog: LectureCatalog, courseId: string): ChatResponse {
  if (typeof result.found !== 'boolean' || typeof result.answer !== 'string') throw new Error('Invalid chat response');
  const language = result.language === 'en' ? 'en' : 'de';
  const labels = LABELS[language];
  const scope = result.scope === 'lecture' ? 'lecture' : 'course';
  if (!result.found) return { status: 'no_match', scope, reply: result.answer, background: '', backgroundLabel: labels.background, language, moment: null };
  const background = typeof result.background === 'string' ? result.background.trim() : '';
  return {
    status: 'answered', scope, reply: result.answer.trim(), background, backgroundLabel: labels.background, language,
    moment: momentOf(result, catalog, courseId),
  };
}
