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
import { DocumentViewer } from './components/DocumentViewer';
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
import { SettingsMenu, type AnswerLanguage } from './components/SettingsMenu';
import { useI18n } from './i18n';
import type {
  Course,
  CourseId,
  CourseSelection,
  Department,
  QuestionHistoryEntry,
  Lecture,
  Segment,
} from './types';

type View = 'questions' | 'library' | 'saved' | 'documents';
type Sort = 'relevance' | 'newest' | 'shortest';
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
  const { t, language } = useI18n();
  const viewNames: Record<View, string> = {
    questions: t('view.questions'),
    library: t('view.library'),
    saved: t('view.saved'),
    documents: t('view.documents'),
  };
  const [view, setView] = useState<View>(() =>
    ['library', 'saved'].includes(location.hash.slice(1))
      ? (location.hash.slice(1) as View)
      : 'questions',
  );
  const [courses, setCourses] = useState<Course[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
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
  const [answerLanguage, setAnswerLanguage] = useLocalStorage<AnswerLanguage>(
    'viscon.answer-language.v1',
    'auto',
    (value): value is AnswerLanguage => value === 'auto' || value === 'en' || value === 'de',
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
      getJSON<{ courses: Course[]; departments?: Department[] }>('/api/courses', controller.signal),
      getJSON<{ lectures: Lecture[] }>('/api/lectures', controller.signal),
    ])
      .then(([courseData, lectureData]) => {
        if (!controller.signal.aborted) {
          setCourses(courseData.courses);
          setDepartments(courseData.departments ?? []);
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
      items = items.filter((item) => lectureMatchesSelection(item, selectedCourse));
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
        { question: trimmed, courseId: selection.courseId, limit: 3, language: answerLanguage },
        { signal: controller.signal },
      );
      if (!controller.signal.aborted) setAnswer(result);
    } catch (error) {
      if (!controller.signal.aborted)
        setSearchError(
          error instanceof Error
            ? error.message
            : t('error.search'),
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
      removing ? t('toast.removed') : t('toast.saved'),
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
          error instanceof Error ? error.message : t('error.lecture'),
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
        {t('skip')}
      </a>
      <IconSidebar
        view={view}
        courses={courses}
        departments={departments}
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

      <div className={`main-shell ${view === 'documents' ? 'documents-shell' : ''}`}>
        <ProductHeader
          module="Lectures"
          actions={
            <>
              <span className="view-toggle" role="group" aria-label={t('header.view')}>
                <a href="/learn" className="on" aria-current="page" title={t('header.listTitle')}>
                  {t('header.list')}
                </a>
                <a
                  href={selectedCourse ? `/#/${selectedCourse.courseId}` : '/'}
                  title={t('header.galaxyTitle')}
                >
                  {t('header.galaxy')}
                </a>
              </span>
              <SettingsMenu language={answerLanguage} onLanguage={setAnswerLanguage} />
            </>
          }
        >
          <a href="/arena">Versus</a>
          <a href="/history">Match history</a>
          <a href="/leaderboard">Leaderboard</a>
          <a href="/learn" className="active" aria-current="page">
            Lectures
          </a>
          <a href="/campus">Campus</a>
        </ProductHeader>

        <div id="audio-controls-slot" className="audio-controls-slot" />

        <main id="main" className={`main-content ${isQuestionLanding ? 'chat-landing' : ''} ${view === 'documents' ? 'document-content' : ''}`}>
          {view !== 'documents' && catalogLoading && (
            <p className="connection-status" role="status">
              <LoaderCircle size={18} className="loading-spin" />
              {t('loading.catalog')}
            </p>
          )}
          {view !== 'documents' && catalogError && (
            <div className="service-error" role="alert">
              <p>{catalogError}</p>
              <button
                className="secondary-button"
                onClick={() => setCatalogAttempt((value) => value + 1)}
              >
                {t('retry.connection')}
              </button>
            </div>
          )}
          {view !== 'documents' && opening && (
            <p className="connection-status" role="status">
              <LoaderCircle size={18} className="loading-spin" />
              {t('loading.lecture')}
            </p>
          )}
          {view !== 'documents' && playerError && (
            <p className="service-error" role="alert">
              {playerError}
            </p>
          )}
          {view === 'documents' ? (
            <DocumentViewer />
          ) : view === 'questions' ? (
            <div className="question-workspace">
              <div className="workspace-heading">
                <p className="page-kicker">WORKSPACE / LECTURES</p>
                <h1 className="chat-prompt">{selectedCourseDetails?.name ?? t('workspace.default')}</h1>
                <p className="workspace-context">
                  {selectedCourse
                    ? selectionLabel(selectedCourse, language)
                    : t('workspace.counts', { lectures: lectures.length, courses: courses.length })}
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
                    aria-label={t('input.label')}
                    ref={textareaRef}
                    value={question}
                    placeholder={
                      selectedCourse ? t('input.placeholder') : t('input.pickFirst')
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
                    aria-label={selectedCourse ? t('course.change') : t('course.pick')}
                    title={selectedCourse ? selectionLabel(selectedCourse, language) : undefined}
                    onClick={() => setPickerRequest((value) => value + 1)}
                  >
                    <GraduationCap size={16} />
                    <span>{selectedCourseDetails?.name ?? t('course.pick')}</span>
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
                    {asking ? t('ask.again') : t('ask.submit')}
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
                  {t('ask.searching')}
                </p>
              )}
              {searchError && (
                <div className="service-error" role="alert">
                  <p>{searchError}</p>
                  <button
                    className="secondary-button"
                    onClick={() => void submitQuestion(submittedQuestion)}
                  >
                    {t('ask.retry')}
                  </button>
                </div>
              )}
              {answer && (
                <section className="answer-panel" aria-label={t('answer.label')}>
                  <h2>
                    {answer.status === 'no_match'
                      ? t('answer.noMatch')
                      : answer.status === 'insufficient_context'
                        ? t('answer.similar')
                        : answer.answer.mode === 'generated'
                          ? t('answer.generated')
                          : t('answer.transcript')}
                  </h2>
                  <p className="answer-notice">{answer.answer.notice}</p>
                  {answer.answer.paragraphs.map((paragraph, index) => (
                    <div className="answer-paragraph" key={index}>
                      <p>
                        {answer.answer.mode !== 'generated' && paragraph.text.length > 380
                          ? `${paragraph.text.slice(0, 380).replace(/\s+\S*$/, '')}…`
                          : paragraph.text}
                      </p>
                      {answer.answer.mode !== 'generated' && paragraph.text.length > 380 && (
                        <details className="transcript-excerpt">
                          <summary>{t('answer.readFull')}</summary>
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
                                {source.demo ? ` · ${t('common.demo')}` : ''}
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
                      ? t('library.counts', {
                          recordings: lectures.filter((item) => !item.demo).length,
                          demos: lectures.filter((item) => item.demo).length,
                        })
                      : t(savedIds.length === 1 ? 'saved.counts.one' : 'saved.counts.other', {
                          n: savedIds.length,
                        })}
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
                  aria-label={t('search.label')}
                  value={librarySearch}
                  onChange={(event) => setLibrarySearch(event.target.value)}
                  placeholder={t('search.placeholder')}
                />
                {librarySearch && (
                  <button
                    className="icon-button"
                    title={t('search.reset')}
                    aria-label={t('search.reset')}
                    onClick={() => setLibrarySearch('')}
                  >
                    <X size={17} />
                  </button>
                )}
              </div>
              <div className="course-filters" aria-label={t('filter.label')}>
                <button
                  className={courseId === 'all' ? 'active' : ''}
                  onClick={() => setCourseId('all')}
                >
                  {t('filter.all')}<span>{lectures.length}</span>
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

          {view !== 'documents' && !catalogLoading && !catalogError &&
          (view !== 'questions' || answer?.sources.length) ? (
            <section
              className="results-section"
              aria-label={view === 'questions' ? t('results.matching') : viewNames[view]}
            >
              <div className="results-toolbar">
                <div className="results-heading">
                  <h2>
                    {view === 'questions'
                      ? t('results.matching')
                      : view === 'library'
                        ? t('results.all')
                        : t('results.saved')}
                  </h2>
                  <span className="result-count">{results.length}</span>
                </div>
                <div className="results-controls">
                  <div className="sort-select">
                    <ArrowDownUp size={14} />
                    <select
                      aria-label={t('sort.label')}
                      value={sort}
                      onChange={(event) => setSort(event.target.value as Sort)}
                    >
                      <option value="relevance">{t('sort.relevance')}</option>
                      <option value="newest">{t('sort.newest')}</option>
                      <option value="shortest">{t('sort.shortest')}</option>
                    </select>
                    <ChevronDown size={13} />
                  </div>
                  <div className="layout-toggle" role="group" aria-label={t('layout.label')}>
                    <button
                      className={layout === 'grid' ? 'active' : ''}
                      title={t('layout.grid')}
                      aria-label={t('layout.grid')}
                      aria-pressed={layout === 'grid'}
                      onClick={() => setLayout('grid')}
                    >
                      <Grid2X2 size={16} />
                    </button>
                    <button
                      className={layout === 'list' ? 'active' : ''}
                      title={t('layout.list')}
                      aria-label={t('layout.list')}
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
                      ? t('results.forQuestion', { n: segmentCount })
                      : t('results.next')}
                  </>
                ) : (
                  <>
                    {results.length} {t(results.length === 1 ? 'results.lecture.one' : 'results.lecture.other')}
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
                      ? t('empty.saved.title')
                      : view === 'questions' && !submittedQuestion
                        ? t('empty.landing.title')
                        : t('empty.none.title')}
                  </h3>
                  <p>
                    {view === 'saved'
                      ? t('empty.saved.text')
                      : view === 'questions' && !submittedQuestion
                        ? t('empty.landing.text')
                        : t('empty.none.text')}
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
                    {view === 'saved' ? t('empty.saved.action') : t('course.pick')}
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
            aria-label={t('help.close')}
            title={t('common.close')}
            onClick={() => setHelpOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <h2 id="help-title">{t('help.title')}</h2>
        <p>{t('help.p1')}</p>
        <p>{t('help.p2')}</p>
        <span className="help-status">
          <Check size={15} />
          {t('help.status')}
        </span>
        <button className="primary-button" onClick={() => setHelpOpen(false)}>
          {t('help.back')}
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
