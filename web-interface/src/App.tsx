import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownUp,
  ArrowRight,
  BookOpen,
  Bookmark,
  Check,
  ChevronDown,
  GraduationCap,
  Grid2X2,
  Layers3,
  LayoutList,
  MessageCircle,
  Play,
  Search,
  LoaderCircle,
  X,
} from 'lucide-react';
import { IconSidebar } from './components/IconSidebar';
import { ProductHeader } from '../../shared/design/ProductHeader';
import {
  isCourseSelection,
  sameCourseSelection,
  lectureMatchesSelection,
  selectionLabel,
} from './data/courseSelection';
import { LectureCard } from './components/LectureCard';
import { LectureViewer } from './components/LectureViewer';
import { askLecture, type AnswerResult } from '../../video-pull-up/client/client.mjs';
import { getJSON, formatTime } from './api';
import { useLocalStorage } from './hooks/useLocalStorage';
import type {
  Course,
  CourseId,
  CourseSelection,
  QuestionHistoryEntry,
  Lecture,
  Segment,
} from './types';

type View = 'questions' | 'library' | 'saved';
type Sort = 'relevance' | 'newest' | 'shortest';
const viewNames: Record<View, string> = {
  questions: 'Chat',
  library: 'Meine Vorlesungen',
  saved: 'Gespeicherte Stellen',
};
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');
const isQuestionHistory = (value: unknown): value is QuestionHistoryEntry[] =>
  Array.isArray(value) &&
  value.every(
    (item) =>
      isCourseSelection(item) && typeof (item as QuestionHistoryEntry).question === 'string',
  );
const isSegmentMap = (value: unknown): value is Record<string, Segment> =>
  Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value).every(
      (item) =>
        item &&
        typeof item.id === 'string' &&
        typeof item.title === 'string' &&
        typeof item.transcript === 'string' &&
        Number.isFinite(item.start) &&
        Number.isFinite(item.end) &&
        item.start >= 0 &&
        item.end > item.start,
    ),
  );

export function App() {
  const [view, setView] = useState<View>(() =>
    ['library', 'saved'].includes(location.hash.slice(1))
      ? (location.hash.slice(1) as View)
      : 'questions',
  );
  const [courses, setCourses] = useState<Course[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const [answer, setAnswer] = useState<AnswerResult | null>(null);
  const [asking, setAsking] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [opening, setOpening] = useState(false);
  const [playerError, setPlayerError] = useState('');
  const searchRequest = useRef<AbortController | null>(null);
  const playerRequest = useRef<AbortController | null>(null);
  const [question, setQuestion] = useState('');
  const [submittedQuestion, setSubmittedQuestion] = useState('');
  const [courseId, setCourseId] = useState<CourseId>('all');
  const [selectedCourse, setSelectedCourse] = useLocalStorage<CourseSelection | null>(
    'viscon.selected-course.v1',
    null,
    (value): value is CourseSelection | null => value === null || isCourseSelection(value),
  );
  const [pickerRequest, setPickerRequest] = useState(0);
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [sort, setSort] = useState<Sort>('relevance');
  const [savedIds, setSavedIds] = useLocalStorage<string[]>(
    'viscon.saved-segments.v1',
    [],
    isStringArray,
  );
  const [savedSegments, setSavedSegments] = useLocalStorage<Record<string, Segment>>(
    'viscon.saved-segment-details.v1',
    {},
    isSegmentMap,
  );
  const [history, setHistory] = useLocalStorage<QuestionHistoryEntry[]>(
    'viscon.question-history.v4',
    [],
    isQuestionHistory,
  );
  const [activeLecture, setActiveLecture] = useState<{ lecture: Lecture; segment: Segment } | null>(
    null,
  );
  const [helpOpen, setHelpOpen] = useState(false);
  const [librarySearch, setLibrarySearch] = useState('');
  const [toast, setToast] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const helpRef = useRef<HTMLDialogElement>(null);
  const isQuestionLanding = view === 'questions' && !submittedQuestion;
  const selectedCourseDetails = courses.find((course) => course.id === selectedCourse?.courseId);

  useEffect(() => {
    const controller = new AbortController();
    setCatalogLoading(true);
    setCatalogError('');
    Promise.all([
      getJSON<{ courses: Course[] }>('/api/courses', controller.signal),
      getJSON<{ lectures: Lecture[] }>('/api/lectures', controller.signal),
    ])
      .then(([courseData, lectureData]) => {
        if (!controller.signal.aborted) {
          setCourses(courseData.courses);
          setLectures(lectureData.lectures);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setCatalogError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setCatalogLoading(false);
      });
    return () => controller.abort();
  }, [catalogAttempt]);

  useEffect(
    () => () => {
      searchRequest.current?.abort();
      playerRequest.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (helpOpen) helpRef.current?.showModal();
    else helpRef.current?.close();
  }, [helpOpen]);

  const results = useMemo(() => {
    let items: Lecture[] =
      view === 'questions'
        ? (answer?.videos ?? []).flatMap((video) => {
            const metadata = lectures.find((item) => item.id === video.id);
            return metadata ? [{ ...metadata, segments: video.segments }] : [];
          })
        : lectures.map((lecture) => ({
            ...lecture,
            segments:
              view === 'saved'
                ? [...(lecture.chapters ?? []), ...lecture.segments]
                    .filter((segment) => savedIds.includes(segment.id))
                    .map((segment) => savedSegments[segment.id] ?? segment)
                : lecture.chapters?.length
                  ? lecture.chapters
                  : lecture.segments,
          }));
    if (view === 'questions' && selectedCourse)
      items = items.filter((item) => lectureMatchesSelection(item, selectedCourse, courses));
    if (view !== 'questions' && courseId !== 'all')
      items = items.filter((item) => item.courseId === courseId);
    if (view === 'saved') items = items.filter((item) => item.segments.length);
    if (view !== 'questions' && librarySearch.trim()) {
      const terms = librarySearch.toLowerCase().trim().split(/\s+/);
      items = items.filter((item) =>
        terms.every((term) =>
          `${item.title} ${item.keywords.join(' ')} ${item.segments.map((segment) => segment.title).join(' ')}`
            .toLowerCase()
            .includes(term),
        ),
      );
    }
    if (sort === 'newest')
      items = [...items].sort((a, b) => b.date.localeCompare(a.date) || b.episode - a.episode);
    if (sort === 'shortest') items = [...items].sort((a, b) => a.duration - b.duration);
    return items;
  }, [
    view,
    answer,
    lectures,
    courseId,
    librarySearch,
    sort,
    savedIds,
    savedSegments,
    selectedCourse,
    courses,
  ]);

  const segmentCount = results.reduce(
    (total, lecture) =>
      total +
      lecture.segments.filter((segment) => view !== 'saved' || savedIds.includes(segment.id))
        .length,
    0,
  );

  const navigate = (nextView: View, nextCourse: CourseId = 'all') => {
    searchRequest.current?.abort();
    playerRequest.current?.abort();
    setAsking(false);
    setOpening(false);
    setSearchError('');
    setPlayerError('');
    setActiveLecture(null);
    if (nextView !== 'questions' || nextCourse !== courseId) {
      setAnswer(null);
      setSubmittedQuestion('');
    }
    setView(nextView);
    window.history.replaceState(null, '', `#${nextView}`);
    setCourseId(nextCourse);
    setLibrarySearch('');
  };

  const submitQuestion = async (nextQuestion: string = question, selection = selectedCourse) => {
    if (!selection) {
      setPickerRequest((value) => value + 1);
      return;
    }
    const trimmed = nextQuestion.trim();
    if (!trimmed) {
      textareaRef.current?.focus();
      return;
    }
    setQuestion(trimmed);
    setSubmittedQuestion(trimmed);
    searchRequest.current?.abort();
    playerRequest.current?.abort();
    const controller = new AbortController();
    searchRequest.current = controller;
    setAnswer(null);
    setAsking(true);
    setSearchError('');
    setPlayerError('');
    setOpening(false);
    setActiveLecture(null);
    setView('questions');
    window.history.replaceState(null, '', '#questions');
    setSort('relevance');
    setHistory((current) =>
      [
        { question: trimmed, ...selection },
        ...current.filter(
          (item) => item.question !== trimmed || !sameCourseSelection(item, selection),
        ),
      ].slice(0, 8),
    );
    try {
      const result = await askLecture(
        { question: trimmed, courseId: selection.courseId, limit: 3 },
        { signal: controller.signal },
      );
      if (!controller.signal.aborted) setAnswer(result);
    } catch (error) {
      if (!controller.signal.aborted)
        setSearchError(
          error instanceof Error
            ? error.message
            : 'Die Suche ist fehlgeschlagen. Bitte versuche es erneut.',
        );
    } finally {
      if (!controller.signal.aborted) setAsking(false);
    }
  };

  const toggleSaved = (segment: Segment) => {
    const id = segment.id;
    const removing = savedIds.includes(id);
    setSavedIds((current) => (removing ? current.filter((item) => item !== id) : [...current, id]));
    setSavedSegments((current) => {
      const next = { ...current };
      if (removing) delete next[id];
      else next[id] = segment;
      return next;
    });
    setToast(
      removing ? 'Stelle aus deiner Merkliste entfernt' : 'Stelle in deiner Merkliste gespeichert',
    );
  };

  const openLecture = async (lecture: Lecture, segment: Segment) => {
    playerRequest.current?.abort();
    const controller = new AbortController();
    playerRequest.current = controller;
    setOpening(true);
    setPlayerError('');
    try {
      const detail = await getJSON<{ lecture: Lecture }>(
        `/api/lectures/${encodeURIComponent(lecture.id)}`,
        controller.signal,
      );
      if (!controller.signal.aborted) setActiveLecture({ lecture: detail.lecture, segment });
    } catch (error) {
      if (!controller.signal.aborted)
        setPlayerError(
          error instanceof Error ? error.message : 'Die Vorlesung konnte nicht geladen werden.',
        );
    } finally {
      if (!controller.signal.aborted) setOpening(false);
    }
  };

  const openSource = (id: string) => {
    const source = answer?.sources.find((item) => item.id === id);
    const lecture = lectures.find((item) => item.id === source?.lectureId);
    if (source && lecture)
      void openLecture(lecture, {
        id: source.segmentId,
        start: source.start,
        end: source.end,
        title: source.title,
        transcript: source.transcript,
      });
  };

  const newQuestion = () => {
    navigate('questions');
    setQuestion('');
    setSubmittedQuestion('');
    setAnswer(null);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const clearCourse = () => {
    searchRequest.current?.abort();
    playerRequest.current?.abort();
    setSelectedCourse(null);
    setQuestion('');
    setSubmittedQuestion('');
    setAnswer(null);
    setActiveLecture(null);
    setAsking(false);
    setOpening(false);
    setSearchError('');
    setPlayerError('');
  };
  const selectCourse = (selection: CourseSelection) => {
    clearCourse();
    setSelectedCourse(selection);
    setView('questions');
    window.history.replaceState(null, '', '#questions');
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };
  const restoreQuestion = (entry: QuestionHistoryEntry) => {
    setSelectedCourse(entry);
    void submitQuestion(entry.question, entry);
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Zum Inhalt
      </a>
      <IconSidebar
        view={view}
        courses={courses}
        lectures={lectures}
        selectedCourse={selectedCourse}
        pickerRequest={pickerRequest}
        history={history}
        onNavigate={navigate}
        onNewChat={newQuestion}
        onSelectCourse={selectCourse}
        onClearCourse={clearCourse}
        onRestoreQuestion={restoreQuestion}
        onClearHistory={() => setHistory([])}
        onHelp={() => setHelpOpen(true)}
      />

      <div className="main-shell">
        <ProductHeader
          module="Lectures"
          actions={
            <>
              <span className="view-toggle" role="group" aria-label="Ansicht">
                <a href="/learn" className="on" aria-current="page" title="Normale Ansicht">
                  Liste
                </a>
                <a
                  href={selectedCourse ? `/#/${selectedCourse.courseId}` : '/'}
                  title="Galaxie-Ansicht"
                >
                  Galaxie
                </a>
              </span>
              <div className="avatar" title="Lernraum">
                DU
              </div>
            </>
          }
        >
          <a href="/arena">Play</a>
          <a href="/history">Match history</a>
          <a href="/leaderboard">Leaderboard</a>
          <a href="/learn" className="active" aria-current="page">
            Lectures
          </a>
          <a href="/campus">Campus</a>
        </ProductHeader>

        <main id="main" className={`main-content ${isQuestionLanding ? 'chat-landing' : ''}`}>
          {catalogLoading && (
            <p className="connection-status" role="status">
              <LoaderCircle size={18} className="loading-spin" />
              Vorlesungen werden geladen…
            </p>
          )}
          {catalogError && (
            <div className="service-error" role="alert">
              <p>{catalogError}</p>
              <button
                className="secondary-button"
                onClick={() => setCatalogAttempt((value) => value + 1)}
              >
                Verbindung erneut versuchen
              </button>
            </div>
          )}
          {opening && (
            <p className="connection-status" role="status">
              <LoaderCircle size={18} className="loading-spin" />
              Vorlesung wird geöffnet…
            </p>
          )}
          {playerError && (
            <p className="service-error" role="alert">
              {playerError}
            </p>
          )}
          {view === 'questions' ? (
            <div className="question-workspace">
              <div className="workspace-heading">
                <p className="page-kicker">WORKSPACE / LECTURES</p>
                <h1 className="chat-prompt">{selectedCourseDetails?.name ?? 'Vorlesungen'}</h1>
                <p className="workspace-context">
                  {selectedCourse
                    ? selectionLabel(selectedCourse)
                    : `${lectures.length} Vorlesungen · ${courses.length} Kurse`}
                </p>
              </div>
              <form
                className="question-box"
                onSubmit={(event) => {
                  event.preventDefault();
                  submitQuestion();
                }}
              >
                <div className="question-input-wrap">
                  <MessageCircle size={21} strokeWidth={1.7} />
                  <textarea
                    id="question"
                    aria-label="Nachricht eingeben"
                    ref={textareaRef}
                    value={question}
                    placeholder={
                      selectedCourse ? 'Nachricht an VisCon …' : 'Wähle zuerst ein Fach …'
                    }
                    disabled={!selectedCourse}
                    maxLength={500}
                    onChange={(event) => setQuestion(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        submitQuestion();
                      }
                    }}
                  />
                </div>
                <div className="question-box-footer">
                  <button
                    className={`lecture-context ${selectedCourse ? 'selected' : ''}`}
                    type="button"
                    aria-label={selectedCourse ? 'Fach wechseln' : 'Fach auswählen'}
                    title={selectedCourse ? selectionLabel(selectedCourse) : undefined}
                    onClick={() => setPickerRequest((value) => value + 1)}
                  >
                    <GraduationCap size={16} />
                    <span>{selectedCourseDetails?.name ?? 'Fach auswählen'}</span>
                    <ChevronDown size={13} />
                  </button>
                  <span className="question-limit">{question.length}/500</span>
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={
                      !selectedCourse || !question.trim() || catalogLoading || !!catalogError
                    }
                  >
                    {asking ? 'Erneut suchen' : 'Frage stellen'}
                    {asking ? (
                      <LoaderCircle size={17} className="loading-spin" />
                    ) : (
                      <ArrowRight size={17} />
                    )}
                  </button>
                </div>
              </form>

              {asking && (
                <p className="connection-status" role="status">
                  Passende Transkriptstellen werden gesucht…
                </p>
              )}
              {searchError && (
                <div className="service-error" role="alert">
                  <p>{searchError}</p>
                  <button
                    className="secondary-button"
                    onClick={() => void submitQuestion(submittedQuestion)}
                  >
                    Suche erneut versuchen
                  </button>
                </div>
              )}
              {answer && (
                <section className="answer-panel" aria-label="Antwort">
                  <h2>
                    {answer.status === 'no_match'
                      ? 'Keine passende Stelle gefunden'
                      : answer.status === 'insufficient_context'
                        ? 'Ähnliche Stellen gefunden'
                        : answer.answer.mode === 'generated'
                          ? 'Antwort aus deinen Vorlesungen'
                          : 'Aus dem Transkript'}
                  </h2>
                  <p className="answer-notice">{answer.answer.notice}</p>
                  {answer.answer.paragraphs.map((paragraph, index) => (
                    <div className="answer-paragraph" key={index}>
                      <p>
                        {paragraph.text.length > 380
                          ? `${paragraph.text.slice(0, 380).replace(/\s+\S*$/, '')}…`
                          : paragraph.text}
                      </p>
                      {paragraph.text.length > 380 && (
                        <details className="transcript-excerpt">
                          <summary>Vollständigen Ausschnitt lesen</summary>
                          <p>{paragraph.text}</p>
                        </details>
                      )}
                      <div className="answer-citations">
                        {paragraph.sourceIds.map((id) => {
                          const source = answer.sources.find((item) => item.id === id);
                          return source ? (
                            <button key={id} onClick={() => openSource(id)}>
                              <Play size={14} />
                              <span>
                                {source.lectureTitle} · {formatTime(source.start)}
                                {source.demo ? ' · Demo' : ''}
                              </span>
                            </button>
                          ) : null;
                        })}
                      </div>
                    </div>
                  ))}
                </section>
              )}
              {submittedQuestion && <div className="results-divider" />}
            </div>
          ) : (
            <>
              <div className="page-heading library-heading">
                <div>
                  <h1>{viewNames[view]}</h1>
                  <p className="heading-context">
                    {view === 'library'
                      ? `${lectures.filter((item) => !item.demo).length} Aufzeichnungen und ${lectures.filter((item) => item.demo).length} Demo-Videos · Kapitel und Transkripte`
                      : `${savedIds.length} gespeicherte ${savedIds.length === 1 ? 'Stelle' : 'Stellen'} · Deine persönliche Merkliste`}
                  </p>
                </div>
                <span className="heading-mark" aria-hidden="true">
                  {view === 'saved' ? (
                    <Bookmark size={29} strokeWidth={1.3} />
                  ) : (
                    <Layers3 size={29} strokeWidth={1.3} />
                  )}
                </span>
              </div>
              <div className="library-search">
                <Search size={18} />
                <input
                  aria-label="Vorlesungen durchsuchen"
                  value={librarySearch}
                  onChange={(event) => setLibrarySearch(event.target.value)}
                  placeholder="Vorlesungen durchsuchen …"
                />
                {librarySearch && (
                  <button
                    className="icon-button"
                    title="Suche zurücksetzen"
                    aria-label="Suche zurücksetzen"
                    onClick={() => setLibrarySearch('')}
                  >
                    <X size={17} />
                  </button>
                )}
              </div>
              <div className="course-filters" aria-label="Kursfilter">
                <button
                  className={courseId === 'all' ? 'active' : ''}
                  onClick={() => setCourseId('all')}
                >
                  Alle Kurse<span>{lectures.length}</span>
                </button>
                {courses.map((course) => (
                  <button
                    className={courseId === course.id ? 'active' : ''}
                    key={course.id}
                    onClick={() => setCourseId(course.id)}
                  >
                    <span className="course-dot" style={{ background: course.color }} />
                    {course.name}
                    <span>{course.videoCount}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {!catalogLoading && !catalogError && (view !== 'questions' || answer?.sources.length) ? (
            <section
              className="results-section"
              aria-label={view === 'questions' ? 'Passende Vorlesungen' : viewNames[view]}
            >
              <div className="results-toolbar">
                <div className="results-heading">
                  <h2>
                    {view === 'questions'
                      ? 'Passende Vorlesungen'
                      : view === 'library'
                        ? 'Alle Vorlesungen'
                        : 'Deine Merkliste'}
                  </h2>
                  <span className="result-count">{results.length}</span>
                </div>
                <div className="results-controls">
                  <div className="sort-select">
                    <ArrowDownUp size={14} />
                    <select
                      aria-label="Vorlesungen sortieren"
                      value={sort}
                      onChange={(event) => setSort(event.target.value as Sort)}
                    >
                      <option value="relevance">Relevanz</option>
                      <option value="newest">Letzte Vorlesung zuerst</option>
                      <option value="shortest">Kürzeste zuerst</option>
                    </select>
                    <ChevronDown size={13} />
                  </div>
                  <div className="layout-toggle" role="group" aria-label="Darstellung">
                    <button
                      className={layout === 'grid' ? 'active' : ''}
                      title="Rasteransicht"
                      aria-label="Rasteransicht"
                      aria-pressed={layout === 'grid'}
                      onClick={() => setLayout('grid')}
                    >
                      <Grid2X2 size={16} />
                    </button>
                    <button
                      className={layout === 'list' ? 'active' : ''}
                      title="Listenansicht"
                      aria-label="Listenansicht"
                      aria-pressed={layout === 'list'}
                      onClick={() => setLayout('list')}
                    >
                      <LayoutList size={17} />
                    </button>
                  </div>
                </div>
              </div>
              <p className="results-caption">
                {view === 'questions' ? (
                  <>
                    <span className="results-indicator" />
                    {submittedQuestion
                      ? `${segmentCount} passende Stellen zu deiner Frage`
                      : 'Deine nächste Frage'}
                  </>
                ) : (
                  <>
                    {results.length} {results.length === 1 ? 'Vorlesung' : 'Vorlesungen'}
                    {courseId !== 'all' &&
                      ` · ${courses.find((item) => item.id === courseId)?.name}`}
                  </>
                )}
              </p>
              {results.length > 0 ? (
                <div className={`lecture-grid ${layout === 'list' ? 'lecture-list' : ''}`}>
                  {results.map((lecture, index) => (
                    <LectureCard
                      key={lecture.id}
                      lecture={lecture}
                      course={courses.find((course) => course.id === lecture.courseId)!}
                      showBestMatch={view === 'questions' && sort === 'relevance' && index === 0}
                      savedIds={savedIds}
                      onSave={toggleSaved}
                      onOpen={(item, segment) => void openLecture(item, segment)}
                      savedOnly={view === 'saved'}
                      compact={layout === 'list'}
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  {view === 'saved' ? (
                    <Bookmark size={29} strokeWidth={1.5} />
                  ) : (
                    <Search size={29} strokeWidth={1.5} />
                  )}
                  <h3>
                    {view === 'saved'
                      ? 'Hier ist Platz für deine Aha-Momente.'
                      : view === 'questions' && !submittedQuestion
                        ? 'Was steht auf deinem Lernplan?'
                        : 'Keine passenden Vorlesungen gefunden.'}
                  </h3>
                  <p>
                    {view === 'saved'
                      ? 'Deine gespeicherten Zeitstellen erscheinen hier.'
                      : view === 'questions' && !submittedQuestion
                        ? 'Lineare Algebra, Analysis oder Informatik.'
                        : 'Versuche einen anderen Begriff oder wähle alle Kurse.'}
                  </p>
                  <button
                    className="secondary-button"
                    onClick={() =>
                      view === 'saved'
                        ? navigate('library')
                        : (setCourseId('all'),
                          setLibrarySearch(''),
                          setPickerRequest((value) => value + 1))
                    }
                  >
                    {view === 'saved' ? 'Vorlesungen ansehen' : 'Fach auswählen'}
                    <ArrowRight size={16} />
                  </button>
                </div>
              )}
            </section>
          ) : null}
        </main>
      </div>

      {activeLecture && (
        <LectureViewer
          key={`${activeLecture.lecture.id}-${activeLecture.segment.id}`}
          lecture={activeLecture.lecture}
          course={courses.find((course) => course.id === activeLecture.lecture.courseId)!}
          segment={activeLecture.segment}
          savedIds={savedIds}
          onSave={toggleSaved}
          onClose={() => setActiveLecture(null)}
        />
      )}
      <dialog
        ref={helpRef}
        className="help-dialog"
        onCancel={() => setHelpOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setHelpOpen(false);
        }}
        aria-labelledby="help-title"
      >
        <div className="help-header">
          <span className="brand-symbol">
            <BookOpen size={23} />
          </span>
          <button
            className="icon-button"
            aria-label="Information schliessen"
            title="Schliessen"
            onClick={() => setHelpOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <h2 id="help-title">Dein VisCon Lernraum</h2>
        <p>
          Hier findest du die Vorlesungsaufzeichnungen mit ihren Transkripten, Kapiteln und
          vorhandenen Lernnotizen. Die drei kurzen Beispielvideos sind als Demo gekennzeichnet.
        </p>
        <p>
          Die Suche zeigt passende Transkriptstellen. Gespeicherte Momente und Fragen bleiben in
          diesem Browser. Über Basis Arena kannst du weiterhin gemeinsam spielen und deinen
          Elo-Fortschritt verfolgen. Die Arena verwendet eine separate Fragenbank.
        </p>
        <span className="help-status">
          <Check size={15} />
          Vorlesungen und Basis Arena verbunden
        </span>
        <button className="primary-button" onClick={() => setHelpOpen(false)}>
          Zurück zum Lernraum
          <ArrowRight size={17} />
        </button>
      </dialog>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}
