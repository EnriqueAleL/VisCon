import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownUp,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  GraduationCap,
  Grid2X2,
  History,
  Layers3,
  LayoutList,
  Menu,
  MessageCircle,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { LectureCard } from './components/LectureCard';
import { LectureViewer } from './components/LectureViewer';
import {
  courses,
  initialQuestion,
  lectures,
  searchLectureMatches,
  searchLectures,
} from './data/lectures';
import { useLocalStorage } from './hooks/useLocalStorage';
import type { CourseId, Lecture, Segment } from './types';

type View = 'questions' | 'library' | 'saved';
type Sort = 'relevance' | 'newest' | 'shortest';
const viewNames: Record<View, string> = {
  questions: 'Fragen & Videos',
  library: 'Meine Vorlesungen',
  saved: 'Gespeicherte Stellen',
};
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

export function App() {
  const [view, setView] = useState<View>('questions');
  const [question, setQuestion] = useState('');
  const [submittedQuestion, setSubmittedQuestion] = useState('');
  const [courseId, setCourseId] = useState<CourseId>('all');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [sort, setSort] = useState<Sort>('relevance');
  const [savedIds, setSavedIds] = useLocalStorage<string[]>(
    'viscon.saved-segments.v1',
    [],
    isStringArray,
  );
  const [history, setHistory] = useLocalStorage<string[]>(
    'viscon.question-history.v1',
    [initialQuestion],
    isStringArray,
  );
  const [activeLecture, setActiveLecture] = useState<{ lecture: Lecture; segment: Segment } | null>(
    null,
  );
  const [mobileMenu, setMobileMenu] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [librarySearch, setLibrarySearch] = useState('');
  const [toast, setToast] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const helpRef = useRef<HTMLDialogElement>(null);
  const isQuestionLanding = view === 'questions' && !submittedQuestion;

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
    let items =
      view === 'questions'
        ? submittedQuestion
          ? searchLectureMatches(submittedQuestion, courseId)
          : []
        : searchLectures(librarySearch, courseId);
    if (view === 'saved')
      items = items.filter((item) =>
        item.segments.some((segment) => savedIds.includes(segment.id)),
      );
    if (sort === 'newest') items = [...items].sort((a, b) => b.date.localeCompare(a.date));
    if (sort === 'shortest') items = [...items].sort((a, b) => a.duration - b.duration);
    return items;
  }, [view, submittedQuestion, courseId, librarySearch, sort, savedIds]);

  const segmentCount = results.reduce(
    (total, lecture) =>
      total +
      lecture.segments.filter((segment) => view !== 'saved' || savedIds.includes(segment.id))
        .length,
    0,
  );

  const navigate = (nextView: View, nextCourse: CourseId = 'all') => {
    setView(nextView);
    setCourseId(nextCourse);
    setLibrarySearch('');
    setMobileMenu(false);
  };

  const submitQuestion = (nextQuestion: string = question) => {
    const trimmed = nextQuestion.trim();
    if (!trimmed) {
      textareaRef.current?.focus();
      return;
    }
    setQuestion(trimmed);
    setSubmittedQuestion(trimmed);
    setView('questions');
    setSort('relevance');
    setHistory((current) => [trimmed, ...current.filter((item) => item !== trimmed)].slice(0, 8));
  };

  const toggleSaved = (id: string) => {
    const removing = savedIds.includes(id);
    setSavedIds((current) => (removing ? current.filter((item) => item !== id) : [...current, id]));
    setToast(
      removing ? 'Stelle aus deiner Merkliste entfernt' : 'Stelle in deiner Merkliste gespeichert',
    );
  };

  const newQuestion = () => {
    navigate('questions');
    setQuestion('');
    setSubmittedQuestion('');
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Zum Inhalt
      </a>
      {mobileMenu && (
        <button
          className="sidebar-backdrop"
          aria-label="Navigation schliessen"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <aside
        className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}
        aria-label="Hauptnavigation"
        onKeyDown={(event) => {
          if (event.key === 'Escape') setMobileMenu(false);
        }}
      >
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            navigate('questions');
          }}
          aria-label="VisCon Startseite"
        >
          <span className="brand-symbol">
            <BookOpen size={23} strokeWidth={2.3} />
          </span>
          <span>
            VisCon<span className="brand-period">.</span>
          </span>
        </a>
        <button className="new-question" onClick={newQuestion}>
          <Plus size={17} />
          Neue Frage{' '}
          <span>
            <ArrowUpRight size={15} />
          </span>
        </button>
        <p className="nav-label">LERNRAUM</p>
        <nav className="primary-nav">
          <button
            className={view === 'questions' ? 'nav-item active' : 'nav-item'}
            onClick={() => navigate('questions')}
            aria-current={view === 'questions' ? 'page' : undefined}
          >
            <MessageCircle size={18} />
            Fragen & Videos
          </button>
          <button
            className={view === 'library' ? 'nav-item active' : 'nav-item'}
            onClick={() => navigate('library')}
            aria-current={view === 'library' ? 'page' : undefined}
          >
            <Layers3 size={18} />
            Meine Vorlesungen<span className="nav-count">{lectures.length}</span>
          </button>
          <button
            className={view === 'saved' ? 'nav-item active' : 'nav-item'}
            onClick={() => navigate('saved')}
            aria-current={view === 'saved' ? 'page' : undefined}
          >
            <Bookmark size={18} />
            Gespeicherte Stellen
            {savedIds.length > 0 && <span className="nav-count">{savedIds.length}</span>}
          </button>
        </nav>
        <div className="sidebar-divider" />
        <p className="nav-label">
          MEINE KURSE <span>{courses.length}</span>
        </p>
        <nav className="course-nav" aria-label="Kurse">
          {courses.map((course) => (
            <button
              className={`nav-item course-nav-item ${courseId === course.id && view === 'library' ? 'course-active' : ''}`}
              key={course.id}
              onClick={() => navigate('library', course.id)}
            >
              <span className="course-dot" style={{ background: course.color }} />
              {course.name}
              <ChevronRight size={14} />
            </button>
          ))}
        </nav>
        <div className="sidebar-divider" />
        <div className="history-header">
          <p className="nav-label">ZULETZT GEFRAGT</p>
          {history.length > 0 && (
            <button
              className="icon-button"
              title="Frageverlauf löschen"
              aria-label="Frageverlauf löschen"
              onClick={() => setHistory([])}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
        <div className="sidebar-history">
          {history.length === 0 ? (
            <p className="history-empty">Noch keine Fragen</p>
          ) : (
            history.slice(0, 3).map((item) => (
              <button
                key={item}
                onClick={() => {
                  navigate('questions');
                  submitQuestion(item);
                }}
                title={item}
              >
                <History size={14} />
                <span>{item}</span>
              </button>
            ))
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="semester">
            <GraduationCap size={18} />
            <div>
              <strong>Herbstsemester 2026</strong>
              <span>ETH Zürich</span>
            </div>
            <span className="semester-dot" />
          </div>
          <button className="sidebar-help" onClick={() => setHelpOpen(true)}>
            <CircleHelp size={17} />
            Über diesen Lernraum
            <ArrowUpRight size={14} />
          </button>
          <div className="sidebar-footer">
            <span>VisCon für Studierende</span>
            <span className="version">v0.1</span>
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu-button"
              aria-label="Navigation öffnen"
              onClick={() => setMobileMenu(true)}
            >
              <Menu size={21} />
            </button>
            <span>Lernraum</span>
            <ChevronRight size={14} />
            <strong>{viewNames[view]}</strong>
          </div>
          <div className="topbar-right">
            <button
              className="icon-button"
              title="Über VisCon"
              aria-label="Über VisCon"
              onClick={() => setHelpOpen(true)}
            >
              <CircleHelp size={19} />
            </button>
            <div className="avatar" title="Studentisches Demo-Profil">
              DU
            </div>
          </div>
        </header>

        <main id="main" className={`main-content ${isQuestionLanding ? 'chat-landing' : ''}`}>
          {view === 'questions' ? (
            <div className="question-workspace">
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
                    placeholder="Nachricht an VisCon …"
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
                  <span className="question-limit">{question.length}/500</span>
                  <button className="primary-button" type="submit" disabled={!question.trim()}>
                    Frage stellen
                    <ArrowRight size={17} />
                  </button>
                </div>
              </form>
              {submittedQuestion && <div className="results-divider" />}
            </div>
          ) : (
            <>
              <div className="page-heading library-heading">
                <div>
                  <h1>{viewNames[view]}</h1>
                  <p className="heading-context">
                    {view === 'library'
                      ? `${lectures.length} Vorlesungen in ${courses.length} Kursen · Herbstsemester 2026`
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

          {(view !== 'questions' || submittedQuestion) && (
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
                      <option value="newest">Neueste zuerst</option>
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
                      showBestMatch={view === 'questions' && sort === 'relevance' && index === 0}
                      savedIds={savedIds}
                      onSave={toggleSaved}
                      onOpen={(item, segment) => setActiveLecture({ lecture: item, segment })}
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
                          submitQuestion(initialQuestion))
                    }
                  >
                    {view === 'saved' ? 'Vorlesungen ansehen' : 'Beispielfrage öffnen'}
                    <ArrowRight size={16} />
                  </button>
                </div>
              )}
            </section>
          )}

          {view === 'questions' && results.length > 0 && (
            <section className="topic-note">
              <span className="topic-note-icon">
                <BookOpen size={19} />
              </span>
              <div>
                <p>Aus der Vorlesung</p>
                <blockquote>{results[0].segments[0].transcript}</blockquote>
              </div>
              <button
                className="icon-button"
                title="Zur zitierten Stelle"
                aria-label="Zur zitierten Stelle"
                onClick={() =>
                  setActiveLecture({ lecture: results[0], segment: results[0].segments[0] })
                }
              >
                <ArrowUpRight size={21} />
              </button>
            </section>
          )}
        </main>
      </div>

      {activeLecture && (
        <LectureViewer
          key={`${activeLecture.lecture.id}-${activeLecture.segment.id}`}
          lecture={activeLecture.lecture}
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
          Dies ist die erste Interface-Version mit acht Beispielvorlesungen. Kurse, Namen und
          Transkripte sind fiktiv. Die Vorschaubilder stammen aus öffentlichen Lehrvideos.
        </p>
        <p>
          Echte Vorlesungsvideos, Videosuche und ETH-Anmeldung werden später angebunden. Deine
          gespeicherten Stellen und Fragen bleiben in diesem Browser.
        </p>
        <span className="help-status">
          <Check size={15} />
          Interface-Vorschau · v0.1
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
