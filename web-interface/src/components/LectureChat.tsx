import { useEffect, useRef, useState } from 'react';
import { Minus, Play, Send } from 'lucide-react';
import { formatTime, postJSON } from '../api';
import { useI18n } from '../i18n';
import type { AnswerLanguage } from './SettingsMenu';

/* The galaxy's "Chat zur Vorlesung", beside the video in the list view.
 *
 * Same endpoint and same contract as the galaxy panel: the whole transcript of
 * the open lecture goes into one call with the chapter outline, the playback
 * position and the last few turns, so follow-ups and "explain this part" work.
 * When the open lecture does not teach what was asked, the server searches the
 * course instead and says so — that is the notice above the answer. An answer
 * may carry a labelled paragraph of general background, and a jump to the
 * moment it came from, in this lecture or another one.
 */

export interface ChatMoment {
  lectureId: string;
  lectureTitle: string;
  courseId: string;
  start: number;
  end: number;
  title: string | null;
}

interface ChatResponse {
  status: 'answered' | 'no_match';
  scope: 'lecture' | 'course';
  reply: string;
  background: string;
  backgroundLabel: string;
  moment: ChatMoment | null;
}

interface Turn {
  role: 'user' | 'assistant';
  text: string;
  scope?: 'lecture' | 'course';
  status?: 'answered' | 'no_match';
  background?: string;
  backgroundLabel?: string;
  moment?: ChatMoment | null;
  error?: boolean;
}

interface LectureChatProps {
  lectureId: string;
  lectureTitle: string;
  /** Where the student is in the video, or null when there is nothing playing. */
  currentTime: number | null;
  language: AnswerLanguage;
  onJump: (moment: ChatMoment) => void;
  onHide: () => void;
}

const MAX_HISTORY = 6;

export function LectureChat({
  lectureId,
  lectureTitle,
  currentTime,
  language,
  onJump,
  onHide,
}: LectureChatProps) {
  const { t } = useI18n();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const request = useRef<AbortController | null>(null);
  // Read at send time, so the question is about where the student actually is.
  const timeRef = useRef(currentTime);
  timeRef.current = currentTime;

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [turns, busy]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    // Only finished turns go along; the server trims them again.
    const history = turns
      .filter((turn) => !turn.error)
      .slice(-MAX_HISTORY)
      .map((turn) => ({ role: turn.role, text: turn.text }));
    const time = timeRef.current !== null && timeRef.current > 0 ? Math.round(timeRef.current) : null;
    setTurns((current) => [...current, { role: 'user', text: message }]);
    setDraft('');
    setBusy(true);
    const controller = new AbortController();
    request.current = controller;
    try {
      const result = await postJSON<ChatResponse>(
        `/api/lectures/${encodeURIComponent(lectureId)}/chat`,
        { message, history, currentTime: time, language },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setTurns((current) => [...current, {
        role: 'assistant',
        status: result.status,
        scope: result.scope,
        text: result.status === 'answered' ? result.reply : t('chat.noMatch'),
        background: result.status === 'answered' ? result.background : '',
        backgroundLabel: result.backgroundLabel,
        moment: result.status === 'answered' ? result.moment : null,
      }]);
    } catch (error) {
      if (!controller.signal.aborted) {
        setTurns((current) => [...current, { role: 'assistant', error: true, text: (error as Error).message }]);
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  // While a video is playing, "explain where I am" is the question worth offering first.
  const suggestions = [
    ...(currentTime !== null ? [t('chat.suggest.here')] : []),
    t('chat.suggest.summary'),
    t('chat.suggest.terms'),
  ];

  return (
    <section className="lecture-chat" aria-label={t('chat.label')}>
      <header className="lc-head">
        <div>
          <p className="lc-eyebrow">{t('chat.label')}</p>
          <h3 className="lc-title">{lectureTitle}</h3>
        </div>
        <button className="lc-toggle" onClick={onHide} aria-label={t('chat.hide')} title={t('chat.hide')}>
          <Minus size={16} />
        </button>
      </header>

      <div className="lc-log" ref={logRef} role="log" aria-live="polite">
        {turns.length === 0 && (
          <div className="lc-starter">
            <p>{t('chat.intro')}</p>
            <div className="lc-suggestions">
              {suggestions.map((text) => (
                <button key={text} onClick={() => void send(text)}>{text}</button>
              ))}
            </div>
          </div>
        )}
        {turns.map((turn, index) => (
          <div key={index} className={`lc-turn lc-${turn.role} ${turn.error ? 'lc-error' : ''}`}>
            {turn.role === 'assistant' && turn.scope === 'course' && !turn.error && turn.status === 'answered' && (
              <p className="lc-scope">
                {turn.moment && turn.moment.lectureId !== lectureId
                  ? t('chat.scope.found', { lecture: turn.moment.lectureTitle })
                  : t('chat.scope.other')}
              </p>
            )}
            <p className="lc-text">{turn.text}</p>
            {turn.background && (
              <p className="lc-background">
                <span className="lc-bg-label">{turn.backgroundLabel}</span>
                {turn.background}
              </p>
            )}
            {turn.moment && (
              <button className="lc-moment" onClick={() => onJump(turn.moment!)}>
                <Play size={10} fill="currentColor" />
                <span className="lc-moment-time">{formatTime(turn.moment.start)}</span>
                <span>
                  {turn.moment.lectureId !== lectureId && turn.moment.lectureTitle
                    ? `${turn.moment.lectureTitle}${turn.moment.title ? ` · ${turn.moment.title}` : ''}`
                    : turn.moment.title || t('chat.watchMoment')}
                </span>
              </button>
            )}
          </div>
        ))}
        {busy && <p className="lc-thinking">{t('chat.thinking')}</p>}
      </div>

      <form className="lc-form" onSubmit={(event) => { event.preventDefault(); void send(draft); }}>
        <textarea
          id="lecture-chat-input"
          rows={2}
          maxLength={1000}
          value={draft}
          aria-label={t('chat.inputLabel')}
          placeholder={t('chat.placeholder')}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(draft); }
          }}
        />
        <button type="submit" disabled={busy || !draft.trim()} aria-label={t('chat.send')} title={t('chat.send')}>
          <Send size={15} />
        </button>
      </form>
    </section>
  );
}
