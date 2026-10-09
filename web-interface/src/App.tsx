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
  GraduationCap,
  Grid2X2,
  Layers3,
  LayoutList,
  MessageCircle,
  Search,
  X,
} from 'lucide-react';
import { LectureCard } from './components/LectureCard';
import { LectureViewer } from './components/LectureViewer';
import { IconSidebar } from './components/IconSidebar';
import { DocumentViewer } from './components/DocumentViewer';
import { courses, lectures, searchLectureMatches, searchLectures } from './data/lectures';
import {
  isCourseSelection,
  lectureMatchesSelection,
  sameCourseSelection,
  selectionForLecture,
  degreeNames,
  semesterNames,
} from './data/courseSelection';
import { useLocalStorage } from './hooks/useLocalStorage';
import type { CourseId, CourseSelection, Lecture, QuestionHistoryEntry, Segment } from './types';

type View = 'questions' | 'library' | 'saved' | 'documents';
type Sort = 'relevance' | 'newest' | 'shortest';
const viewNames: Record<View, string> = {
  questions: 'Chat',
  library: 'Meine Vorlesungen',
  saved: 'Gespeicherte Stellen',
  documents: 'Dokumente',
};
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');
const isQuestionHistory = (value: unknown): value is QuestionHistoryEntry[] =>
  Array.isArray(value) &&
  value.every(
    (item) =>
      isCourseSelection(item) &&
      'question' in item &&
      typeof item.question === 'string' &&
      Boolean(item.question.trim()),
  );

function readLegacyQuestionHistory(): QuestionHistoryEntry[] {
  try {
    const courseHistory = localStorage.getItem('viscon.question-history.v3');
    const entries: unknown = JSON.parse(
      courseHistory ?? localStorage.getItem('viscon.question-history.v2') ?? '[]',
    );
    if (!Array.isArray(entries)) return [];
    const migrated = entries.flatMap((entry) => {
      if (!entry || typeof entry.question !== 'string' || !entry.question.trim()) return [];
      if (courseHistory !== null) {
        const course = courses.find((item) => item.id === entry.courseId);
        if (!course) return [];
        const selection = {
          courseId: course.id,
          year: entry.year,
          semester: entry.semester,
          degree: course.degree,
          studyYear: course.studyYear,
        };
        return isCourseSelection(selection) ? [{ question: entry.question, ...selection }] : [];
      }
      const lecture = lectures.find((item) => item.id === entry.lectureId);
      return lecture ? [{ question: entry.question, ...selectionForLecture(lecture) }] : [];
    });
    return migrated.filter(
      (entry, index) =>
        migrated.findIndex(
          (other) => other.question === entry.question && sameCourseSelection(other, entry),
        ) === index,
    );
  } catch {
    return [];
  }
}

export function App() {
  const [view, setView] = useState<View>('questions');
  const [question, setQuestion] = useState('');
  const [submittedQuestion, setSubmittedQuestion] = useState('');
  const [courseId, setCourseId] = useState<CourseId>('all');
  const [selectedCourse, setSelectedCourse] = useState<CourseSelection | null>(null);
  const [pickerRequest, setPickerRequest] = useState(0);
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [sort, setSort] = useState<Sort>('relevance');
  const [savedIds, setSavedIds] = useLocalStorage<string[]>(
    'viscon.saved-segments.v1',
    [],
    isStringArray,
  );
  const legacyHistory = useMemo(readLegacyQuestionHistory, []);
  const [history, setHistory] = useLocalStorage<QuestionHistoryEntry[]>(
    'viscon.question-history.v4',
    legacyHistory,
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
        ? submittedQuestion && selectedCourse
          ? searchLectureMatches(submittedQuestion, selectedCourse.courseId).filter((lecture) =>
              lectureMatchesSelection(lecture, selectedCourse),
            )
          : []
        : searchLectures(librarySearch, courseId);
    if (view === 'saved')
      items = items.filter((item) =>
        item.segments.some((segment) => savedIds.includes(segment.id)),
      );
    if (sort === 'newest') items = [...items].sort((a, b) => b.date.localeCompare(a.date));
    if (sort === 'shortest') items = [...items].sort((a, b) => a.duration - b.duration);
    return items;
  }, [view, submittedQuestion, selectedCourse, courseId, librarySearch, sort, savedIds]);

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
  };

  const submitQuestion = (nextQuestion: string = question) => {
    if (!selectedCourse) {
      setPickerRequest((current) => current + 1);
      return;
    }
    const trimmed = nextQuestion.trim();
    if (!trimmed) {
      textareaRef.current?.focus();
      return;
    }
    setQuestion(trimmed);
    setSubmittedQuestion(trimmed);
    setView('questions');
    setSort('relevance');
    setHistory((current) =>
      [
        { question: trimmed, ...selectedCourse },
        ...current.filter(
          (item) => item.question !== trimmed || !sameCourseSelection(item, selectedCourse),
        ),
      ].slice(0, 8),
    );
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
    setActiveLecture(null);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const clearCourse = () => {
    setSelectedCourse(null);
    setQuestion('');
    setSubmittedQuestion('');
    setActiveLecture(null);
  };

  const selectCourse = (selection: CourseSelection) => {
    setSelectedCourse(selection);
    setQuestion('');
    setSubmittedQuestion('');
    setActiveLecture(null);
    setView('questions');
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const restoreQuestion = (entry: QuestionHistoryEntry) => {
    setSelectedCourse({
      year: entry.year,
      semester: entry.semester,
      degree: entry.degree,
      studyYear: entry.studyYear,
      courseId: entry.courseId,
    });
    setQuestion(entry.question);
    setSubmittedQuestion(entry.question);
    setView('questions');
    setSort('relevance');
    setActiveLecture(null);
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Zum Inhalt
      </a>
      <IconSidebar
        view={view}
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
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Lernraum</span>
            <ChevronRight size={14} />
            <strong>{viewNames[view]}</strong>
          </div>
          <div className="topbar-right">
            <div className="avatar" title="Studentisches Demo-Profil">
              DU
            </div>
          </div>
        </header>

        <main id="main" className={`main-content ${isQuestionLanding ? 'chat-landing' : ''} ${view === 'documents' ? 'document-content' : ''}`}>
          {view === 'documents' ? (
            <DocumentViewer />
          ) : view === 'questions' ? (
            <div className="question-workspace">
              {selectedCourseDetails && (
                <h1 className="chat-prompt">Stell eine Frage zu {selectedCourseDetails.name}</h1>
              )}
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
                    title={
                      selectedCourse
                        ? `${selectedCourseDetails?.name} · ${semesterNames[selectedCourse.semester]} ${selectedCourse.year} · ${degreeNames[selectedCourse.degree]}, ${selectedCourse.studyYear}. Studienjahr`
                        : undefined
                    }
                    onClick={() => setPickerRequest((current) => current + 1)}
                  >
                    <GraduationCap size={16} />
                    <span>{selectedCourseDetails?.name ?? 'Fach auswählen'}</span>
                    <ChevronDown size={13} />
                  </button>
                  <span className="question-limit">{question.length}/500</span>
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={!selectedCourse || !question.trim()}
                  >
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

          {view !== 'documents' && (view !== 'questions' || submittedQuestion) && (
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
                        : view === 'questions'
                          ? 'Versuche einen anderen Begriff oder wähle eine andere Vorlesung.'
                          : 'Versuche einen anderen Begriff oder wähle alle Kurse.'}
                  </p>
                  <button
                    className="secondary-button"
                    onClick={() =>
                      view === 'saved'
                        ? navigate('library')
                        : view === 'questions'
                          ? setPickerRequest((current) => current + 1)
                          : (setCourseId('all'), setLibrarySearch(''))
                    }
                  >
                    {view === 'saved'
                      ? 'Vorlesungen ansehen'
                      : view === 'questions'
                        ? 'Vorlesung wechseln'
                        : 'Suche zurücksetzen'}
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
