import { useEffect, useRef, useState } from 'react';
import { Bookmark, Check, ChevronRight, Clock3, FileText, Play, X } from 'lucide-react';
import { courses, formatTime } from '../data/lectures';
import type { Lecture, Segment } from '../types';

interface LectureViewerProps {
  lecture: Lecture;
  segment: Segment;
  savedIds: string[];
  onSave: (id: string) => void;
  onClose: () => void;
}

export function LectureViewer({ lecture, segment, savedIds, onSave, onClose }: LectureViewerProps) {
  const [activeSegment, setActiveSegment] = useState(segment);
  const [tab, setTab] = useState<'moments' | 'transcript'>('moments');
  const [preview, setPreview] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const course = courses.find((item) => item.id === lecture.courseId)!;

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      className="viewer-dialog"
      ref={dialogRef}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      aria-labelledby="viewer-title"
    >
      <div className="viewer-header">
        <span className="course-label" style={{ color: course.color }}>
          <span className="course-dot" style={{ background: course.color }} />
          {course.name}
          <ChevronRight size={14} />
          Vorlesung {lecture.episode}
        </span>
        <button
          className="icon-button"
          title="Schliessen"
          aria-label="Vorlesung schliessen"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <div className="viewer-preview">
        <img src={lecture.thumbnail} alt={`Beispiel-Vorschaubild: ${lecture.title}`} />
        <span className="preview-badge">Beispielvorschau</span>
        <button
          className="viewer-play"
          aria-label="Vorschau anzeigen"
          onClick={() => setPreview(true)}
        >
          <Play size={28} fill="currentColor" />
        </button>
        {preview && (
          <div className="preview-message">
            <p>Für diese Beispielvorlesung ist noch kein Video hinterlegt.</p>
            <button onClick={() => setPreview(false)}>Zur Vorschau</button>
          </div>
        )}
        <div className="preview-position">
          <Clock3 size={14} />
          {formatTime(activeSegment.start)}
          <span>/ {formatTime(lecture.duration)}</span>
        </div>
        <div className="preview-progress">
          <span style={{ width: `${(activeSegment.start / lecture.duration) * 100}%` }} />
        </div>
      </div>
      <div className="viewer-body">
        <h2 id="viewer-title">{lecture.title}</h2>
        <p className="lecture-meta">
          {lecture.lecturer}
          <span>·</span>
          {new Intl.DateTimeFormat('de-CH').format(new Date(`${lecture.date}T12:00:00`))}
        </p>
        <div className="viewer-tabs" role="group" aria-label="Vorlesungsdetails">
          <button
            aria-pressed={tab === 'moments'}
            className={tab === 'moments' ? 'active' : ''}
            onClick={() => setTab('moments')}
          >
            <Clock3 size={16} />
            Passende Stellen <span>{lecture.segments.length}</span>
          </button>
          <button
            aria-pressed={tab === 'transcript'}
            className={tab === 'transcript' ? 'active' : ''}
            onClick={() => setTab('transcript')}
          >
            <FileText size={16} />
            Transkript
          </button>
        </div>
        <div className="viewer-segments">
          {lecture.segments.map((item) => (
            <div
              className={`viewer-segment ${activeSegment.id === item.id ? 'active' : ''}`}
              key={item.id}
            >
              <button
                className="viewer-segment-select"
                onClick={() => {
                  setActiveSegment(item);
                  setPreview(false);
                }}
              >
                <span className="segment-time">
                  {activeSegment.id === item.id ? (
                    <Check size={12} />
                  ) : (
                    <Play size={10} fill="currentColor" />
                  )}
                  {formatTime(item.start)}
                </span>
                <span>
                  <strong>{item.title}</strong>
                  {tab === 'transcript' && <p>{item.transcript}</p>}
                </span>
              </button>
              <button
                className={`icon-button ${savedIds.includes(item.id) ? 'is-saved' : ''}`}
                title={savedIds.includes(item.id) ? 'Stelle entfernen' : 'Stelle speichern'}
                aria-label={`${item.title}: ${savedIds.includes(item.id) ? 'Stelle entfernen' : 'Stelle speichern'}`}
                aria-pressed={savedIds.includes(item.id)}
                onClick={() => onSave(item.id)}
              >
                <Bookmark size={17} fill={savedIds.includes(item.id) ? 'currentColor' : 'none'} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </dialog>
  );
}
