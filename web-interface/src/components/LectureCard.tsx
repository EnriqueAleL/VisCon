import { ArrowUpRight, Bookmark, Check, Clock3, Play } from 'lucide-react';
import { courses, formatTime } from '../data/lectures';
import type { Lecture, Segment } from '../types';

interface LectureCardProps {
  lecture: Lecture;
  showBestMatch: boolean;
  savedIds: string[];
  onSave: (segmentId: string) => void;
  onOpen: (lecture: Lecture, segment: Segment) => void;
  savedOnly?: boolean;
  compact?: boolean;
}

export function LectureCard({
  lecture,
  showBestMatch,
  savedIds,
  onSave,
  onOpen,
  savedOnly,
  compact,
}: LectureCardProps) {
  const course = courses.find((item) => item.id === lecture.courseId)!;
  const segments = savedOnly
    ? lecture.segments.filter((item) => savedIds.includes(item.id))
    : lecture.segments;
  const firstSegment = segments[0];

  return (
    <article className={`lecture-card ${compact ? 'lecture-card-list' : ''}`}>
      <button
        className="lecture-thumbnail"
        onClick={() => onOpen(lecture, firstSegment)}
        aria-label={`${lecture.title} öffnen`}
      >
        <img src={lecture.thumbnail} alt={`Beispiel-Vorschaubild zur Vorlesung ${lecture.title}`} />
        {showBestMatch && (
          <span className="best-match">
            <Check size={12} /> Beste Übereinstimmung
          </span>
        )}
        <span className="thumbnail-play">
          <Play size={20} fill="currentColor" />
        </span>
        <span className="video-duration">{formatTime(lecture.duration)}</span>
      </button>
      <div className="lecture-details">
        <div className="course-label" style={{ color: course.color }}>
          <span className="course-dot" style={{ background: course.color }} />
          {course.name}
          <span className="lecture-number">VL {lecture.episode.toString().padStart(2, '0')}</span>
        </div>
        <button className="lecture-title" onClick={() => onOpen(lecture, firstSegment)}>
          {lecture.title}
          <ArrowUpRight size={17} />
        </button>
        <p className="lecture-meta">
          {lecture.lecturer}
          <span>·</span>
          {new Intl.DateTimeFormat('de-CH').format(new Date(`${lecture.date}T12:00:00`))}
        </p>
        <div className="segments-heading">
          <Clock3 size={13} />
          {segments.length} passende {segments.length === 1 ? 'Stelle' : 'Stellen'}
        </div>
        <div className="segment-list">
          {segments.map((segment) => (
            <div className="segment-row" key={segment.id}>
              <button
                className="segment-open"
                onClick={() => onOpen(lecture, segment)}
                aria-label={`${segment.title} ab ${formatTime(segment.start)} öffnen`}
              >
                <span className="segment-time">
                  <Play size={10} fill="currentColor" />
                  {formatTime(segment.start)}
                </span>
                <span className="segment-title">{segment.title}</span>
              </button>
              <button
                className={`icon-button bookmark-button ${savedIds.includes(segment.id) ? 'is-saved' : ''}`}
                title={savedIds.includes(segment.id) ? 'Stelle entfernen' : 'Stelle speichern'}
                aria-label={`${segment.title}: ${savedIds.includes(segment.id) ? 'Stelle entfernen' : 'Stelle speichern'}`}
                aria-pressed={savedIds.includes(segment.id)}
                onClick={() => onSave(segment.id)}
              >
                <Bookmark
                  size={15}
                  fill={savedIds.includes(segment.id) ? 'currentColor' : 'none'}
                />
              </button>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}
