import { ArrowUpRight, Bookmark, Check, Clock3, Play, Video } from 'lucide-react';
import { formatTime } from '../api';
import type { Course, Lecture, Segment } from '../types';

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
  const segments = savedOnly ? lecture.segments.filter(item => savedIds.includes(item.id)) : lecture.segments;
  const firstSegment = segments[0];
  if (!firstSegment) return null;
  const chapterList = firstSegment.summary !== undefined;
  const visible = savedOnly ? segments : segments.slice(0, 3);
  return (
    <article className={`lecture-card ${compact ? 'lecture-card-list' : ''}`}>
      <button className="lecture-thumbnail" onClick={() => onOpen(lecture, firstSegment)} aria-label={`${lecture.title} öffnen`}>
        {lecture.thumbnail ? <img src={lecture.thumbnail} alt="" /> : <span className={`thumbnail-placeholder ${lecture.demo ? 'demo-thumbnail' : ''}`}><Video size={25} strokeWidth={1.5} /><span>{lecture.demo ? 'Demo' : `Vorlesung ${lecture.episode}`}<small>{course.shortName}</small></span></span>}
        {showBestMatch && <span className="best-match"><Check size={12} />Beste Übereinstimmung</span>}
        <span className="thumbnail-play"><Play size={20} fill="currentColor" /></span>
        <span className="video-duration">{formatTime(lecture.duration)}</span>
      </button>
      <div className="lecture-details">
        <div className="course-label"><span className="course-dot" style={{ background: course.color }} />{course.shortName}<span className="lecture-number">{lecture.demo ? 'Demo' : `VL ${String(lecture.episode).padStart(2, '0')}`}</span></div>
        <button className="lecture-title" onClick={() => onOpen(lecture, firstSegment)}>{lecture.title}<ArrowUpRight size={17} /></button>
        <p className="lecture-meta">{lecture.demo ? 'Beispielvideo · kein Kursmaterial' : lecture.mediaUrl ? 'Video mit Transkript und Kapiteln' : 'Transkript verfügbar · Video fehlt'}</p>
        <div className="segments-heading"><Clock3 size={13} />{segments.length} {chapterList ? 'Kapitel' : segments.length === 1 ? 'passende Stelle' : 'passende Stellen'}</div>
        <div className="segment-list">
          {visible.map(segment => (
            <div className="segment-row" key={segment.id}>
              <button className="segment-open" onClick={() => onOpen(lecture, segment)} aria-label={`${segment.title} ab ${formatTime(segment.start)} öffnen`}><span className="segment-time"><Play size={10} fill="currentColor" />{formatTime(segment.start)}</span><span className="segment-title">{segment.title}</span></button>
              <button className={`icon-button bookmark-button ${savedIds.includes(segment.id) ? 'is-saved' : ''}`} title={savedIds.includes(segment.id) ? 'Stelle entfernen' : 'Stelle speichern'} aria-label={`${segment.title}: ${savedIds.includes(segment.id) ? 'Stelle entfernen' : 'Stelle speichern'}`} aria-pressed={savedIds.includes(segment.id)} onClick={() => onSave(segment)}><Bookmark size={15} fill={savedIds.includes(segment.id) ? 'currentColor' : 'none'} /></button>
            </div>
          ))}
        </div>
        {segments.length > visible.length && <button className="more-moments" onClick={() => onOpen(lecture, firstSegment)}>Alle {segments.length} {chapterList ? 'Kapitel' : 'Stellen'} ansehen<ArrowUpRight size={14} /></button>}
      </div>
    </article>
  );
}
