import { useEffect, useRef, useState } from 'react';
import { Bookmark, BookOpen, Check, ChevronRight, Clock3, FileText, Play, X } from 'lucide-react';
import { pullUpVideo } from '../../../video-pull-up/client/client.mjs';
import { lectureVisualizerAt, lectureVisualizerHref } from '../../../shared/lecture-visualizers';
import { formatTime, getJSON } from '../api';
import type { Course, Lecture, LectureSummary, Segment } from '../types';
import { useI18n } from '../i18n';

interface LectureViewerProps {
  lecture: Lecture;
  course: Course;
  segment: Segment;
  savedIds: string[];
  onSave: (segment: Segment) => void;
  onClose: () => void;
}

export function LectureViewer({ lecture, course, segment, savedIds, onSave, onClose }: LectureViewerProps) {
  const { t } = useI18n();
  const [activeSegment, setActiveSegment] = useState(segment);
  const [tab, setTab] = useState<'moments' | 'transcript' | 'notes'>('moments');
  const [mediaError, setMediaError] = useState('');
  const [mediaAttempt, setMediaAttempt] = useState(0);
  const [playbackTime, setPlaybackTime] = useState(segment.start);
  const [summary, setSummary] = useState<LectureSummary | null>(null);
  const [notesError, setNotesError] = useState('');
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesAttempt, setNotesAttempt] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const moments = lecture.chapters?.length ? lecture.chapters : lecture.segments;
  const visualizer = lectureVisualizerAt(lecture.id, playbackTime);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => { dialog?.close(); previous?.focus(); };
  }, []);

  useEffect(() => {
    setPlaybackTime(activeSegment.start);
    const video = videoRef.current;
    if (!video || !lecture.mediaUrl) return;
    let alive = true;
    setMediaError('');
    void pullUpVideo(video, { mediaUrl: lecture.mediaUrl, start: activeSegment.start }).catch(error => { if (alive) setMediaError(error.message); });
    return () => { alive = false; video.pause(); };
  }, [lecture.mediaUrl, activeSegment, mediaAttempt]);

  useEffect(() => {
    if (tab !== 'notes' || !lecture.hasSummary) return;
    const controller = new AbortController();
    setNotesLoading(true); setNotesError('');
    getJSON<{ summary: LectureSummary | null }>(`/api/lectures/${encodeURIComponent(lecture.id)}/summary`, controller.signal)
      .then(result => { if (!controller.signal.aborted) setSummary(result.summary); })
      .catch(error => { if (!controller.signal.aborted) setNotesError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setNotesLoading(false); });
    return () => controller.abort();
  }, [tab, lecture.id, lecture.hasSummary, notesAttempt]);

  const choose = (item: Segment) => setActiveSegment({ ...item });
  return (
    <dialog className="viewer-dialog" ref={dialogRef} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }} aria-labelledby="viewer-title">
      <div className="viewer-header">
        <span className="course-label"><span className="course-dot" style={{ background: course.color }} />{course.shortName}<ChevronRight size={14} />{lecture.demo ? t('common.demo') : t('viewer.lecture', { n: lecture.episode })}</span>
        <button className="icon-button" title={t('common.close')} aria-label={t('viewer.closeLabel')} onClick={onClose}><X size={20} /></button>
      </div>
      <div className="lecture-player">
        {lecture.mediaUrl ? <video ref={videoRef} controls playsInline preload="metadata" aria-label={lecture.title} onTimeUpdate={event => setPlaybackTime(event.currentTarget.currentTime)} onError={() => setMediaError(t('viewer.mediaError'))}>
          {lecture.captionsUrl && <track kind="captions" src={lecture.captionsUrl} srcLang="en" label="English transcript" />}
          {lecture.chaptersUrl && <track kind="chapters" src={lecture.chaptersUrl} srcLang="en" label="Chapters" />}
        </video> : <div className="missing-video"><FileText size={28} /><p>{t('viewer.noVideo')}</p></div>}
      </div>
      {mediaError && <div className="service-error" role="alert"><p>{mediaError}</p><button className="secondary-button" onClick={() => { videoRef.current?.load(); setMediaAttempt(value => value + 1); }}>{t('viewer.reload')}</button></div>}
      <div className="viewer-body">
        <h2 id="viewer-title">{lecture.title}</h2>
        <div className="selected-moment"><span><Clock3 size={15} />{formatTime(activeSegment.start)} · {activeSegment.title}</span><button className={`icon-button ${savedIds.includes(activeSegment.id) ? 'is-saved' : ''}`} aria-label={savedIds.includes(activeSegment.id) ? t('viewer.removeCurrent') : t('viewer.saveCurrent')} aria-pressed={savedIds.includes(activeSegment.id)} onClick={() => onSave(activeSegment)}><Bookmark size={18} fill={savedIds.includes(activeSegment.id) ? 'currentColor' : 'none'} /></button></div>
        {activeSegment.summary && <p className="chapter-description">{activeSegment.summary}</p>}
        {visualizer && <div className="selected-moment lecture-concept-link"><span><BookOpen size={15} />{visualizer.title} · Teaching adaptation</span><a className="note-timestamp" href={lectureVisualizerHref(visualizer)}><Play size={12} />Visualize this</a></div>}
        <div className="viewer-tabs" role="group" aria-label={t('viewer.details')}>
          <button aria-pressed={tab === 'moments'} className={tab === 'moments' ? 'active' : ''} onClick={() => setTab('moments')}><Clock3 size={16} />{lecture.chapters?.length ? t('tab.chapters') : t('tab.moments')}<span>{moments.length}</span></button>
          <button aria-pressed={tab === 'transcript'} className={tab === 'transcript' ? 'active' : ''} onClick={() => setTab('transcript')}><FileText size={16} />{t('tab.transcript')}</button>
          <button aria-pressed={tab === 'notes'} className={tab === 'notes' ? 'active' : ''} onClick={() => setTab('notes')}><BookOpen size={16} />{t('tab.notes')}</button>
        </div>
        {tab === 'notes' ? <section className="lecture-notes" aria-label={t('tab.notes')}>
          {notesLoading && <p role="status">{t('notes.loading')}</p>}
          {notesError && <div className="service-error" role="alert"><p>{notesError}</p><button onClick={() => setNotesAttempt(value => value + 1)}>{t('notes.reload')}</button></div>}
          {summary && !notesLoading && !notesError ? <><p className="answer-notice">{t('notes.ai')}</p><p>{summary.overview}</p>{summary.sections.map((section, index) => <section key={index}><h3>{section.heading}</h3>{section.start !== null && <button className="note-timestamp" onClick={() => { const item = moments.find(moment => moment.start <= section.start! && moment.end > section.start!); if (item) choose({ ...item, start: section.start! }); }}><Play size={12} />{formatTime(section.start)}</button>}<ul>{section.points.map((point, pointIndex) => <li key={pointIndex}>{point}</li>)}</ul></section>)}<h3>{t('notes.takeaways')}</h3><ul>{summary.takeaways.map((point, index) => <li key={index}>{point}</li>)}</ul></> : !notesLoading && !notesError && <p>{t('notes.none')}</p>}
        </section> : <div className="viewer-segments">{(tab === 'moments' ? moments : lecture.segments).map(item => {
          const active = activeSegment.start >= item.start && activeSegment.start < item.end;
          return <div className={`viewer-segment ${active ? 'active' : ''}`} key={item.id}>
            <button className="viewer-segment-select" onClick={() => choose(item)}><span className="segment-time">{active ? <Check size={12} /> : <Play size={10} fill="currentColor" />}{formatTime(item.start)}</span><span><strong>{item.title}</strong>{tab === 'transcript' && <p>{item.transcript}</p>}</span></button>
            <button className={`icon-button ${savedIds.includes(item.id) ? 'is-saved' : ''}`} aria-label={`${item.title}: ${savedIds.includes(item.id) ? t('moment.remove') : t('moment.save')}`} aria-pressed={savedIds.includes(item.id)} onClick={() => onSave(item)}><Bookmark size={17} fill={savedIds.includes(item.id) ? 'currentColor' : 'none'} /></button>
          </div>;
        })}</div>}
      </div>
    </dialog>
  );
}
