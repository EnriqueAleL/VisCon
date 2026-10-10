import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { ArrowUpRight, BookOpen, Check, ChevronRight, Clock3, FileText, LoaderCircle, Play, RotateCcw, Search, Sparkles, Swords, Upload, X } from 'lucide-react';
import type { LectureMoment, WorldCity } from '../../shared/world';
import { lectureVisualizerAt, lectureVisualizerForMoment, type LectureVisualizerLink } from '../../shared/lecture-visualizers';
import { explorationThreshold, isPlaybackAdvance, mergeWatchedInterval, watchedSeconds, type WatchedInterval } from '../../shared/lecture-viewing';
import { askLecture, pullUpVideo, type AnswerResult, type Source } from '../../video-pull-up/client/client.mjs';
import type { Lecture } from '../../web-interface/src/types';
import { maniaApi, timestamp } from './api';
import './lecture.css';

export interface LectureMomentPanelProps {
  city: WorldCity;
  moment: LectureMoment | null;
  onMoment: (moment: LectureMoment) => void;
  onExplored: (moment: LectureMoment) => void;
  exploredChapterIds: string[];
  onVisualize: (link?: LectureVisualizerLink) => void;
  onRecall: () => void;
  onDuel?: () => void;
}

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'This could not be loaded. Please try again.';

export default function LectureMomentPanel({ city, moment, onMoment, onExplored, exploredChapterIds, onVisualize, onRecall, onDuel }: LectureMomentPanelProps) {
  const selected = moment ?? city.chapters[0];
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [mediaError, setMediaError] = useState('');
  const [retry, setRetry] = useState(0);
  const [tab, setTab] = useState<'moments' | 'transcript'>('moments');
  const [playbackTime, setPlaybackTime] = useState(selected?.start ?? 0);
  const [watched, setWatched] = useState<Record<string, number>>({});
  const [credited, setCredited] = useState<string[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const ranges = useRef(new Map<string, WatchedInterval[]>());
  const lastTick = useRef<{ seconds: number; wall: number } | null>(null);
  const creditedRef = useRef(new Set<string>());
  const [bridgeText, setBridgeText] = useState('');
  const [bridgeResult, setBridgeResult] = useState<AnswerResult | null>(null);
  const [bridgeLoading, setBridgeLoading] = useState(false);
  const [bridgeError, setBridgeError] = useState('');
  const [openingSource, setOpeningSource] = useState<string | null>(null);
  const [pdf, setPdf] = useState<{ url: string; name: string } | null>(null);
  const bridgeRequest = useRef<AbortController | null>(null);
  const sourceRequest = useRef<AbortController | null>(null);
  const bridgeId = useId();
  const titleId = useId();

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setLoadError(''); setMediaError(''); setLecture(null);
    if (!selected) { setLoading(false); return; }
    maniaApi<{ lecture: Lecture }>(`/api/lectures/${encodeURIComponent(selected.lectureId)}`, undefined, controller.signal)
      .then(result => { if (!controller.signal.aborted) setLecture(result.lecture); })
      .catch(error => { if (!controller.signal.aborted) setLoadError(errorMessage(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [selected?.lectureId, retry]);

  useEffect(() => {
    setPlaybackTime(selected?.start ?? 0);
    lastTick.current = null;
    const video = videoRef.current;
    if (loading || !video || !selected || !lecture?.mediaUrl || lecture.id !== selected.lectureId) return;
    let active = true;
    setMediaError('');
    void pullUpVideo(video, { mediaUrl: lecture.mediaUrl, start: selected.start })
      .catch(error => { if (active) setMediaError(errorMessage(error)); });
    return () => { active = false; video.pause(); lastTick.current = null; };
  }, [loading, lecture?.id, lecture?.mediaUrl, selected?.lectureId, selected?.start, retry]);

  useEffect(() => { for (const id of exploredChapterIds) creditedRef.current.add(id); }, [exploredChapterIds]);
  useEffect(() => () => { bridgeRequest.current?.abort(); sourceRequest.current?.abort(); }, []);
  useEffect(() => { setBridgeResult(null); setBridgeError(''); bridgeRequest.current?.abort(); sourceRequest.current?.abort(); setBridgeLoading(false); setOpeningSource(null); }, [city.id]);
  useEffect(() => () => { if (pdf) URL.revokeObjectURL(pdf.url); }, [pdf]);

  const readyLecture = lecture?.id === selected?.lectureId ? lecture : null;
  const canonicalSelected = city.chapters.find(chapter => chapter.chapterId === selected?.chapterId) ?? selected;
  const playingMoment = city.chapters.find(chapter => chapter.lectureId === selected?.lectureId
    && playbackTime >= chapter.start && playbackTime < chapter.end) ?? selected;
  const liveLink = readyLecture ? lectureVisualizerAt(readyLecture.id, playbackTime) : null;
  const visualizerLink = readyLecture?.mediaUrl ? liveLink : selected ? lectureVisualizerForMoment(selected) : null;
  const explored = useMemo(() => new Set([...exploredChapterIds, ...credited]), [exploredChapterIds, credited]);
  const transcript = readyLecture?.segments.filter(segment => canonicalSelected
    && segment.end > canonicalSelected.start && segment.start < canonicalSelected.end) ?? [];
  const viewed = playingMoment ? watched[playingMoment.chapterId] ?? 0 : 0;
  const threshold = playingMoment ? explorationThreshold(playingMoment.start, playingMoment.end) : 15;
  const progressPercent = threshold > 0 ? Math.min(100, Math.round(viewed / threshold * 100)) : 0;

  const recordPlayback = () => {
    const video = videoRef.current;
    if (!video || !readyLecture) return;
    setPlaybackTime(video.currentTime);
    const now = performance.now();
    const previous = lastTick.current;
    lastTick.current = { seconds: video.currentTime, wall: now };
    if (!previous || video.paused || video.seeking || video.ended || document.visibilityState !== 'visible'
      || !isPlaybackAdvance(video.currentTime - previous.seconds, (now - previous.wall) / 1000, video.playbackRate)) return;
    for (const chapter of city.chapters) {
      if (chapter.lectureId !== readyLecture.id) continue;
      const start = Math.max(chapter.start, previous.seconds), end = Math.min(chapter.end, video.currentTime);
      if (end <= start) continue;
      const merged = mergeWatchedInterval(ranges.current.get(chapter.chapterId) ?? [], start, end);
      ranges.current.set(chapter.chapterId, merged);
      const duration = watchedSeconds(merged);
      setWatched(current => ({ ...current, [chapter.chapterId]: duration }));
      if (!creditedRef.current.has(chapter.chapterId) && duration >= explorationThreshold(chapter.start, chapter.end)) {
        creditedRef.current.add(chapter.chapterId);
        setCredited(current => [...current, chapter.chapterId]);
        onExplored(chapter);
      }
    }
  };

  const searchBridge = async (event: FormEvent) => {
    event.preventDefault();
    const question = bridgeText.trim();
    if (!question) return;
    bridgeRequest.current?.abort();
    const controller = new AbortController(); bridgeRequest.current = controller;
    setBridgeLoading(true); setBridgeError(''); setBridgeResult(null);
    try {
      const result = await askLecture({ question, courseId: 'computer-architecture', limit: 3 }, { signal: controller.signal });
      if (!controller.signal.aborted) setBridgeResult(result);
    } catch (error) { if (!controller.signal.aborted) setBridgeError(errorMessage(error)); }
    finally { if (!controller.signal.aborted) setBridgeLoading(false); }
  };

  const openSource = async (source: Source) => {
    sourceRequest.current?.abort();
    const controller = new AbortController(); sourceRequest.current = controller;
    setOpeningSource(source.id); setBridgeError('');
    try {
      const known = city.chapters.find(chapter => chapter.lectureId === source.lectureId
        && source.start >= chapter.start && source.start < chapter.end);
      if (known) { onMoment({ ...known, start: source.start }); return; }
      const result = await maniaApi<{ lecture: Lecture }>(`/api/lectures/${encodeURIComponent(source.lectureId)}`, undefined, controller.signal);
      if (controller.signal.aborted) return;
      const chapter = result.lecture.chapters?.find(item => source.start >= item.start && source.start < item.end)
        ?? result.lecture.chapters?.find(item => source.end > item.start && source.start < item.end);
      if (!chapter) throw new Error('This source has no indexed chapter. Try another result.');
      onMoment({ id: chapter.id, chapterId: chapter.id, lectureId: result.lecture.id, lecture: result.lecture.episode,
        title: chapter.title, summary: chapter.summary ?? '', start: Math.max(chapter.start, source.start), end: chapter.end, keyTerms: [] });
    } catch (error) { if (!controller.signal.aborted) setBridgeError(errorMessage(error)); }
    finally { if (!controller.signal.aborted) setOpeningSource(null); }
  };

  const captureSelection = () => {
    const selection = window.getSelection()?.toString().trim();
    if (selection && selection.length > 5 && selection.length <= 2000) setBridgeText(selection);
  };

  if (!selected) return <div className="lm-empty"><BookOpen size={24} /><p>No lecture moments are indexed for this city yet.</p></div>;

  return <section className="lecture-moment-panel" aria-labelledby={titleId}>
    <div className="lm-grid">
      <div className="lm-watch">
        <div className="lm-player-heading"><span><Play size={13} />LECTURE {selected.lecture}</span><span><Clock3 size={13} />{timestamp(selected.start)}–{timestamp(selected.end)}</span></div>
        <div className="lm-player">
          {loading ? <div className="lm-empty" role="status"><LoaderCircle size={26} className="lm-spin" /><p>Finding your lecture moment…</p></div>
            : loadError ? <div className="lm-empty" role="alert"><FileText size={26} /><p>{loadError}</p><button type="button" onClick={() => setRetry(value => value + 1)}><RotateCcw size={14} />Try again</button></div>
              : readyLecture?.mediaUrl ? <video ref={videoRef} controls playsInline preload="metadata" aria-label={`Lecture ${selected.lecture}: ${selected.title}`}
                onTimeUpdate={recordPlayback} onSeeking={() => { lastTick.current = null; }} onSeeked={() => { lastTick.current = null; }}
                onPlay={() => { lastTick.current = null; }} onPause={() => { lastTick.current = null; }}
                onError={() => setMediaError('The lecture video could not load. The chapter summary and transcript are still available below.')}>
                {readyLecture.captionsUrl && <track kind="captions" src={readyLecture.captionsUrl} srcLang="en" label="English transcript" />}
                {readyLecture.chaptersUrl && <track kind="chapters" src={readyLecture.chaptersUrl} srcLang="en" label="Lecture chapters" />}
              </video>
                : <div className="lm-empty"><FileText size={28} /><strong>Read this lecture moment</strong><p>The original video is unavailable here. The transcript and chapter summary below remain searchable.</p><button type="button" onClick={() => setTab('transcript')}><BookOpen size={14} />Read transcript</button></div>}
        </div>
        {mediaError && <div className="lm-error" role="alert"><p>{mediaError}</p><button type="button" onClick={() => setRetry(value => value + 1)}><RotateCcw size={13} />Retry video</button></div>}
        <div className="lm-current">
          <h3 id={titleId}>{selected.title}</h3>
          <p>{selected.summary}</p>
          <div className="lm-exploration"><span>{explored.has(playingMoment.chapterId) ? <><Check size={13} />Explored · recall will light the city</> : <><span className="lm-coverage" style={{ '--coverage': `${progressPercent}%` } as CSSProperties} />Watch {Math.ceil(Math.max(0, threshold - viewed))} more unique seconds to explore</>}</span><button type="button" onClick={onRecall}>Try recall<ArrowUpRight size={13} /></button></div>
        </div>
        {visualizerLink && <div className="lm-visualize" key={visualizerLink.chapterId}>
          <span className="lm-landmark-icon"><Sparkles size={19} /></span>
          <div><strong>{visualizerLink.title}</strong><p>A teaching adaptation of this lecture concept. Predict, then step through it.</p></div>
          <button type="button" onClick={() => { videoRef.current?.pause(); onVisualize(visualizerLink); }}>Visualize this<ArrowUpRight size={15} /></button>
        </div>}
      </div>
      <div className="lm-index">
        <div className="lm-tabs" role="group" aria-label="Lecture details"><button type="button" aria-pressed={tab === 'moments'} className={tab === 'moments' ? 'active' : ''} onClick={() => setTab('moments')}>City moments<span>{city.chapters.length}</span></button><button type="button" aria-pressed={tab === 'transcript'} className={tab === 'transcript' ? 'active' : ''} onClick={() => setTab('transcript')}>Transcript</button></div>
        <div className="lm-chapters" onMouseUp={tab === 'transcript' ? captureSelection : undefined}>
          {tab === 'moments' ? city.chapters.map(chapter => {
            const active = chapter.chapterId === selected.chapterId;
            const covered = explored.has(chapter.chapterId);
            return <button type="button" key={chapter.chapterId} className={`lm-chapter ${active ? 'active' : ''}`} aria-pressed={active} onClick={() => onMoment(chapter)}>
              <span className={`lm-chapter-state ${covered ? 'explored' : ''}`}>{covered ? <Check size={13} /> : <Play size={11} />}</span>
              <span><strong>{chapter.title}</strong><small>Lecture {chapter.lecture} · {timestamp(chapter.start)} · {Math.max(1, Math.round((chapter.end - chapter.start) / 60))} min{covered ? ' · explored' : ''}</small></span>
              <ChevronRight size={13} />
            </button>;
          }) : loading ? <p className="lm-transcript-notice" role="status">Loading the original transcript…</p> : transcript.length ? <>
            <p className="lm-transcript-notice">Original transcript. Select a passage to search for its explanation below.</p>
            {transcript.map(segment => <div className="lm-transcript" key={segment.id}><button type="button" onClick={() => onMoment({ ...canonicalSelected, start: Math.max(canonicalSelected.start, segment.start) })}><Play size={10} />{timestamp(segment.start)}</button><p>{segment.transcript}</p></div>)}
          </> : <p className="lm-transcript-notice">{loadError ? 'The transcript is temporarily unavailable. Try loading the lecture again.' : 'No transcript is available for this moment. The chapter summary is shown beside it.'}</p>}
        </div>
        <div className="lm-index-footer"><span>{city.chapterIds.filter(id => explored.has(id)).length}/{city.chapters.length} moments explored</span>{onDuel ? <button type="button" onClick={onDuel}><Swords size={13} />Challenge a friend</button> : <a href={`/arena?city=${encodeURIComponent(city.id)}&chapter=${encodeURIComponent(selected.chapterId)}`}><Swords size={13} />Challenge a friend</a>}</div>
      </div>
    </div>
    <details className="lm-book-bridge">
      <summary><BookOpen size={17} /><span>From book to lecture<small>Bring a passage from your notes or PDF</small></span><ArrowUpRight size={15} /></summary>
      <div className="lm-bridge-body">
        <div className="lm-bridge-copy"><h4>The explanation, at the exact second</h4><p>Paste a passage or question from your textbook, slides or notes. Search finds cited moments in the real DDCA transcripts.</p>
          <label className="lm-pdf-upload"><Upload size={14} />Open a local PDF<input type="file" accept="application/pdf,.pdf" onChange={event => {
            const file = event.currentTarget.files?.[0];
            if (!file) return;
            if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) { setBridgeError('Choose a PDF document.'); return; }
            setPdf({ url: URL.createObjectURL(file), name: file.name });
            event.currentTarget.value = '';
          }} /></label><small className="lm-pdf-note">PDF stays in your browser. Copy a passage from it and paste below; only the search text is sent.</small>
        </div>
        {pdf && <div className="lm-pdf"><div><span><FileText size={13} />{pdf.name}</span><button type="button" aria-label="Close PDF" onClick={() => setPdf(null)}><X size={15} /></button></div><iframe src={pdf.url} title={`Local PDF: ${pdf.name}`} /><a href={pdf.url} target="_blank" rel="noreferrer">Open PDF in a new tab<ArrowUpRight size={12} /></a></div>}
        <form onSubmit={searchBridge} className="lm-bridge-form"><label htmlFor={bridgeId}>Passage or question</label><textarea id={bridgeId} value={bridgeText} onChange={event => setBridgeText(event.target.value)} maxLength={2000} rows={3} placeholder="Why does a load followed by add stall, even with forwarding?" required /><div><span>{bridgeText.length}/2000</span><button type="submit" disabled={bridgeLoading || !bridgeText.trim()}>{bridgeLoading ? <LoaderCircle size={14} className="lm-spin" /> : <Search size={14} />}{bridgeLoading ? 'Finding lecture moments…' : 'Find the lecture moment'}</button></div></form>
        {bridgeError && <p className="lm-error" role="alert">{bridgeError}</p>}
        {bridgeResult && <div className="lm-bridge-results" aria-live="polite"><p className="lm-bridge-notice">{bridgeResult.answer.notice || 'Cited transcript matches. Check the original explanation.'}</p>{bridgeResult.answer.text && <p className="lm-bridge-answer">{bridgeResult.answer.text}</p>}
          {bridgeResult.sources.length ? bridgeResult.sources.map(source => <div className="lm-source" key={source.id}><div><span>{source.lectureTitle} · {timestamp(source.start)}</span><strong>{source.title}</strong><p>{source.transcript.slice(0, 240)}{source.transcript.length > 240 ? '…' : ''}</p></div><button type="button" onClick={() => void openSource(source)} disabled={openingSource !== null}>{openingSource === source.id ? <LoaderCircle size={14} className="lm-spin" /> : <Play size={13} />}See the moment</button></div>) : <p>No grounded lecture moment matched this passage. Try the key concept in a shorter question.</p>}
        </div>}
      </div>
    </details>
  </section>;
}
