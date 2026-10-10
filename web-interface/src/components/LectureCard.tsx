import { ArrowUpRight, Bookmark, Check, Clock3, Play, Video } from 'lucide-react';
import { formatTime } from '../api';
import type { Course, Lecture, Segment } from '../types';
import { useI18n } from '../i18n';

interface LectureCardProps {
  lecture: Lecture;
  course: Course;
  showBestMatch: boolean;
  savedIds: string[];
  onSave: (segment: Segment) => void;
  onOpen: (lecture: Lecture, segment: Segment) => void;
  savedOnly?: boolean;
  compact?: boolean;
}

export function LectureCard({ lecture, course, showBestMatch, savedIds, onSave, onOpen, savedOnly, compact }: LectureCardProps) {
  const { t } = useI18n();
  const segments = savedOnly ? lecture.segments.filter(item => savedIds.includes(item.id)) : lecture.segments;
  const firstSegment = segments[0];
  if (!firstSegment) return null;
  const chapterList = firstSegment.summary !== undefined;
  const visible = savedOnly ? segments : segments.slice(0, 3);
  return (
    <article className={`lecture-card ${compact ? 'lecture-card-list' : ''}`}>
      <button className="lecture-thumbnail" onClick={() => onOpen(lecture, firstSegment)} aria-label={t('card.open', { title: lecture.title })}>
        {lecture.thumbnail ? <img src={lecture.thumbnail} alt="" /> : <span className={`thumbnail-placeholder ${lecture.demo ? 'demo-thumbnail' : ''}`}><Video size={25} strokeWidth={1.5} /><span>{lecture.demo ? t('common.demo') : t('viewer.lecture', { n: lecture.episode })}<small>{course.shortName}</small></span></span>}
        {showBestMatch && <span className="best-match"><Check size={12} />{t('card.bestMatch')}</span>}
        <span className="thumbnail-play"><Play size={20} fill="currentColor" /></span>
        <span className="video-duration">{formatTime(lecture.duration)}</span>
      </button>
      <div className="lecture-details">
        <div className="course-label"><span className="course-dot" style={{ background: course.color }} />{course.shortName}<span className="lecture-number">{lecture.demo ? t('common.demo') : t('card.short', { n: String(lecture.episode).padStart(2, '0') })}</span></div>
        <button className="lecture-title" onClick={() => onOpen(lecture, firstSegment)}>{lecture.title}<ArrowUpRight size={17} /></button>
        <p className="lecture-meta">{lecture.demo ? t('card.meta.demo') : lecture.mediaUrl ? t('card.meta.video') : t('card.meta.transcript')}</p>
        <div className="segments-heading"><Clock3 size={13} />{segments.length} {chapterList ? t('tab.chapters') : t(segments.length === 1 ? 'card.matches.one' : 'card.matches.other')}</div>
        <div className="segment-list">
          {visible.map(segment => (
            <div className="segment-row" key={segment.id}>
              <button className="segment-open" onClick={() => onOpen(lecture, segment)} aria-label={t('card.openAt', { title: segment.title, time: formatTime(segment.start) })}><span className="segment-time"><Play size={10} fill="currentColor" />{formatTime(segment.start)}</span><span className="segment-title">{segment.title}</span></button>
              <button className={`icon-button bookmark-button ${savedIds.includes(segment.id) ? 'is-saved' : ''}`} title={savedIds.includes(segment.id) ? t('moment.remove') : t('moment.save')} aria-label={`${segment.title}: ${savedIds.includes(segment.id) ? t('moment.remove') : t('moment.save')}`} aria-pressed={savedIds.includes(segment.id)} onClick={() => onSave(segment)}><Bookmark size={15} fill={savedIds.includes(segment.id) ? 'currentColor' : 'none'} /></button>
            </div>
          ))}
        </div>
        {segments.length > visible.length && <button className="more-moments" onClick={() => onOpen(lecture, firstSegment)}>{t(chapterList ? 'card.moreChapters' : 'card.moreMoments', { n: segments.length })}<ArrowUpRight size={14} /></button>}
      </div>
    </article>
  );
}
