import { useMemo, useState } from 'react';
import { ArrowLeft, Bookmark, ChevronRight, GraduationCap, Layers3, Play, Search, X } from 'lucide-react';
import type { Course, Lecture, Segment } from '../types';
import { formatTime } from '../api';
import { useI18n, type Translate } from '../i18n';
import { CourseDocuments } from './CourseDocuments';
import './course-browser.css';

/* The list view of the galaxy, level for level.
 *
 *   galaxy  ->  planet   ->  city       ->  house
 *   course  ->  lecture  ->  chapter    ->  the moment in the recording
 *
 * Same hierarchy, same names, same thing at the end of it — opening a chapter
 * plays that moment. Only the instrument changes: lists and cards instead of
 * a camera. Where the galaxy encodes a chapter's length as the height of a
 * building, here it is the length of a bar, so the same fact is still visible
 * without reading the timestamps.
 */

type Level = 'courses' | 'lectures' | 'chapters';

interface CourseBrowserProps {
  courses: Course[];
  lectures: Lecture[];
  savedIds: string[];
  onSave(segmentId: string, segment: Segment): void;
  onOpenSegment(lecture: Lecture, segment: Segment): void;
  /** The course both views share, so Liste and Galaxie open on the same one. */
  selectedCourseId: string | null;
  onSelectCourse(courseId: string | null): void;
}

const chaptersOf = (lecture: Lecture): Segment[] =>
  lecture.chapters?.length ? lecture.chapters : lecture.segments;

const programmeLabel = (course: Course, t: Translate) => {
  if (!course.department) return t('picker.other');
  const degree = course.degree === 'msc' ? 'MSc' : course.degree === 'bsc' ? 'BSc' : null;
  return [course.department, degree, course.studyYear ? t('picker.year', { year: course.studyYear }) : null]
    .filter(Boolean)
    .join(' · ');
};

export function CourseBrowser({
  courses,
  lectures,
  savedIds,
  onSave,
  onOpenSegment,
  selectedCourseId,
  onSelectCourse,
}: CourseBrowserProps) {
  const { t } = useI18n();
  const [courseId, setCourseId] = useState<string | null>(selectedCourseId);
  const [lectureId, setLectureId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const course = courses.find((item) => item.id === courseId) ?? null;
  const lecture = lectures.find((item) => item.id === lectureId) ?? null;
  const level: Level = lecture ? 'chapters' : course ? 'lectures' : 'courses';

  const byCourse = useMemo(() => {
    const map = new Map<string, Lecture[]>();
    for (const item of lectures) {
      const list = map.get(item.courseId) ?? [];
      list.push(item);
      map.set(item.courseId, list);
    }
    for (const list of map.values()) list.sort((a, b) => (a.episode || 0) - (b.episode || 0));
    return map;
  }, [lectures]);

  const ownLectures = course ? byCourse.get(course.id) ?? [] : [];
  const chapters = lecture ? chaptersOf(lecture) : [];

  const openCourse = (next: Course) => {
    setCourseId(next.id);
    setLectureId(null);
    setQuery('');
    onSelectCourse(next.id);
  };
  const openLectureLevel = (next: Lecture) => {
    setLectureId(next.id);
    setQuery('');
  };
  const toCourses = () => { setCourseId(null); setLectureId(null); setQuery(''); };
  const toLectures = () => { setLectureId(null); setQuery(''); };

  const match = (text: string) => !query.trim() || text.toLowerCase().includes(query.toLowerCase().trim());

  // The longest chapter sets the scale for the bars, so they compare within a lecture
  const longest = chapters.reduce((max, item) => Math.max(max, item.end - item.start), 1);

  return (
    <div className="browser">
      <nav className="browser-trail" aria-label={t('browser.trail')}>
        <button className="browser-crumb" onClick={toCourses} disabled={level === 'courses'}>
          {t('browser.courses')}
        </button>
        {course && (
          <>
            <ChevronRight size={13} aria-hidden="true" />
            <button className="browser-crumb" onClick={toLectures} disabled={level === 'lectures'}>
              {course.shortName || course.name}
            </button>
          </>
        )}
        {lecture && (
          <>
            <ChevronRight size={13} aria-hidden="true" />
            <span className="browser-crumb current">{t('browser.lectureShort', { n: lecture.episode })}</span>
          </>
        )}
      </nav>

      {level !== 'courses' && (
        <button className="browser-back" onClick={level === 'chapters' ? toLectures : toCourses}>
          <ArrowLeft size={15} />
          {t(level === 'chapters' ? 'browser.backToLectures' : 'browser.backToCourses')}
        </button>
      )}

      {/* ---------- Level 1: courses (the planets) ---------- */}
      {level === 'courses' && (
        <>
          <header className="browser-head">
            <div>
              <p className="browser-eyebrow">{t('browser.room')}</p>
              <h1>{t('browser.courses')}</h1>
              <p className="browser-sub">
                {t(courses.length === 1 ? 'browser.courses.sub.one' : 'browser.courses.sub.other', {
                  n: courses.length,
                })}
              </p>
            </div>
            <span className="browser-mark" aria-hidden="true"><GraduationCap size={28} strokeWidth={1.3} /></span>
          </header>

          <div className="browser-grid">
            {courses.map((item) => {
              const own = byCourse.get(item.id) ?? [];
              const chapterCount = own.reduce((sum, l) => sum + chaptersOf(l).length, 0);
              return (
                <button
                  key={item.id}
                  className={`course-tile ${item.id === selectedCourseId ? 'selected' : ''}`}
                  style={{ ['--tile-accent' as string]: item.color }}
                  onClick={() => openCourse(item)}
                >
                  <span className="course-tile-top">
                    <span className="course-dot" style={{ background: item.color }} />
                    <span className="course-tile-programme">{programmeLabel(item, t)}</span>
                  </span>
                  <span className="course-tile-name">{item.name}</span>
                  <span className="course-tile-meta">
                    <span>{t(own.length === 1 ? 'browser.lectures.one' : 'browser.lectures.other', { n: own.length })}</span>
                    <span>{t('browser.chapters', { n: chapterCount })}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* ---------- Level 2: lectures (the cities) ---------- */}
      {level === 'lectures' && course && (
        <>
          <header className="browser-head">
            <div>
              <p className="browser-eyebrow">{t('browser.course', { programme: programmeLabel(course, t) })}</p>
              <h1>{course.name}</h1>
              <p className="browser-sub">
                {t(ownLectures.length === 1 ? 'browser.lectures.sub.one' : 'browser.lectures.sub.other', {
                  n: ownLectures.length,
                })}
              </p>
            </div>
            <span className="browser-mark" aria-hidden="true"><Layers3 size={28} strokeWidth={1.3} /></span>
          </header>

          <CourseDocuments courseId={course.id} />

          <Filter value={query} onChange={setQuery} placeholder={t('browser.searchLectures')} />

          <ul className="browser-list">
            {ownLectures.filter((item) => match(item.title)).map((item) => {
              const own = chaptersOf(item);
              return (
                <li key={item.id}>
                  <button className="row-tile" onClick={() => openLectureLevel(item)}>
                    <span className="row-index" style={{ color: course.color }}>
                      {String(item.episode).padStart(2, '0')}
                    </span>
                    <span className="row-body">
                      <span className="row-title">{item.title}</span>
                      <span className="row-note">{t('browser.lectureMeta', { n: own.length, lecturer: item.lecturer })}</span>
                    </span>
                    <span className="row-tail">{t('browser.minutes', { n: Math.round(item.duration / 60) })}</span>
                    <ChevronRight size={16} className="row-chevron" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* ---------- Level 3: chapters (the houses) ---------- */}
      {level === 'chapters' && lecture && course && (
        <>
          <header className="browser-head">
            <div>
              <p className="browser-eyebrow">
                {t('browser.chapterEyebrow', { n: lecture.episode, course: course.shortName || course.name })}
              </p>
              <h1>{lecture.title}</h1>
              <p className="browser-sub">{t('browser.chapters.sub', { n: chapters.length })}</p>
            </div>
            <span className="browser-mark" aria-hidden="true"><Play size={26} strokeWidth={1.3} /></span>
          </header>

          <Filter value={query} onChange={setQuery} placeholder={t('browser.searchChapters')} />

          <ul className="browser-list chapters">
            {chapters.map((segment, index) => ({ segment, index }))
              .filter(({ segment }) => match(segment.title))
              .map(({ segment, index }) => {
                const seconds = segment.end - segment.start;
                const saved = savedIds.includes(segment.id);
                return (
                  <li key={segment.id}>
                    <div className="row-tile chapter">
                      <button
                        className="chapter-open"
                        onClick={() => onOpenSegment(lecture, segment)}
                        title={t('browser.openMoment')}
                      >
                        <span className="row-index" style={{ color: course.color }}>
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <span className="row-body">
                          <span className="row-title">{segment.title}</span>
                          <span className="chapter-bar" aria-hidden="true">
                            <span
                              className="chapter-bar-fill"
                              style={{
                                width: `${Math.max(4, (seconds / longest) * 100)}%`,
                                background: course.color,
                              }}
                            />
                          </span>
                          <span className="row-note">
                            {formatTime(segment.start)}–{formatTime(segment.end)} ·{' '}
                            {t('browser.minutes', { n: Math.max(1, Math.round(seconds / 60)) })}
                          </span>
                        </span>
                        <span className="chapter-play"><Play size={15} /></span>
                      </button>
                      <button
                        className={`chapter-save ${saved ? 'on' : ''}`}
                        aria-pressed={saved}
                        title={t(saved ? 'browser.unsave' : 'browser.save')}
                        onClick={() => onSave(segment.id, segment)}
                      >
                        <Bookmark size={15} />
                      </button>
                    </div>
                  </li>
                );
              })}
          </ul>
        </>
      )}
    </div>
  );
}

function Filter({ value, onChange, placeholder }: { value: string; onChange(v: string): void; placeholder: string }) {
  const { t } = useI18n();
  return (
    <div className="browser-filter">
      <Search size={17} />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {value && (
        <button className="icon-button" onClick={() => onChange('')} title={t('search.reset')} aria-label={t('search.reset')}>
          <X size={16} />
        </button>
      )}
    </div>
  );
}
