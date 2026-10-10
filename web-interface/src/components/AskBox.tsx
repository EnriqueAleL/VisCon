import { useRef, useState } from 'react';
import { ArrowRight, LoaderCircle, Play } from 'lucide-react';
import { askLecture } from '../../../video-pull-up/client/client.mjs';
import { formatTime } from '../api';
import { useI18n } from '../i18n';
import type { AnswerLanguage } from './SettingsMenu';
import type { Lecture, Segment } from '../types';

/* The galaxy's corner box, in the list view.
 *
 * Same job and same shape: ask from wherever you are, and the answer is a place
 * rather than an essay — one line naming the lecture and the timestamp, which
 * opens that moment. The galaxy flies the camera there; here it opens the
 * viewer at the same second. The Chat view is still where a full answer with
 * its sources lives; this is the shortcut that never leaves the page.
 */

interface AskBoxProps {
  lectures: Lecture[];
  /** The course to search; null opens the course picker instead of guessing. */
  courseId: string | null;
  language: AnswerLanguage;
  onNeedCourse: () => void;
  onOpen: (lecture: Lecture, segment: Segment) => void;
}

type Found = { lecture: Lecture; segment: Segment; near: boolean };

/** The chapter containing the moment, else the nearest one — the galaxy picks the same way. */
function locate(lecture: Lecture, start: number): Segment | null {
  const parts = lecture.chapters?.length ? lecture.chapters : lecture.segments;
  if (!parts.length) return null;
  let best = parts[0];
  let gap = Infinity;
  for (const part of parts) {
    if (start >= part.start && start <= part.end) return part;
    const distance = Math.abs(part.start - start);
    if (distance < gap) { gap = distance; best = part; }
  }
  return best;
}

export function AskBox({ lectures, courseId, language, onNeedCourse, onOpen }: AskBoxProps) {
  const { t } = useI18n();
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [found, setFound] = useState<Found | null>(null);
  const request = useRef<AbortController | null>(null);

  const ask = async () => {
    const trimmed = question.trim();
    if (!trimmed || busy) return;
    if (!courseId) { onNeedCourse(); return; }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setNote('');
    setFound(null);
    try {
      const result = await askLecture(
        { question: trimmed, courseId, limit: 3, language },
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      const hit = result.playback ?? result.sources[0] ?? null;
      const lecture = hit && lectures.find((item) => item.id === hit.lectureId);
      const chapter = lecture && locate(lecture, hit.start || 0);
      if (!lecture || !chapter) {
        setNote(result.answer?.notice || t('askbox.noMatch'));
        return;
      }
      // The chapter names the place; the answer's own second is where to land.
      const segment: Segment = { ...chapter, start: hit.start, end: Math.max(hit.end, hit.start + 1) };
      setFound({ lecture, segment, near: result.status !== 'answered' });
      // The galaxy flies there by itself once it knows where "there" is.
      onOpen(lecture, segment);
    } catch (error) {
      if (!controller.signal.aborted) setNote((error as Error).message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  return (
    <form
      className={`ask-box ${busy ? 'busy' : ''}`}
      onSubmit={(event) => { event.preventDefault(); void ask(); }}
    >
      <label className="ask-box-label" htmlFor="ask-box-input">{t('askbox.label')}</label>
      <div className="ask-box-row">
        <input
          id="ask-box-input"
          type="text"
          autoComplete="off"
          maxLength={300}
          value={question}
          placeholder={t('askbox.placeholder')}
          onChange={(event) => setQuestion(event.target.value)}
        />
        <button type="submit" disabled={busy} aria-label={t('ask.submit')} title={t('ask.submit')}>
          {busy ? <LoaderCircle size={16} className="loading-spin" /> : <ArrowRight size={16} />}
        </button>
      </div>
      {busy && <p className="ask-box-status" role="status">{t('askbox.searching')}</p>}
      {!busy && note && <p className="ask-box-status" role="status">{note}</p>}
      {!busy && found && (
        <button
          type="button"
          className="ask-box-hit"
          title={t('askbox.reopen')}
          onClick={() => onOpen(found.lecture, found.segment)}
        >
          <Play size={11} fill="currentColor" />
          <span>
            {found.near && <em>{t('askbox.nearest')}</em>}
            {found.lecture.title}
          </span>
          <span className="ask-box-time">{formatTime(found.segment.start)}</span>
        </button>
      )}
    </form>
  );
}
