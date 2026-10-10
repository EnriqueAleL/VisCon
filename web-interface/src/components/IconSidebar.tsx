import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Bookmark,
  CircleHelp,
  GraduationCap,
  Layers3,
  MessageCircle,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { selectionLabel } from '../data/courseSelection';
import type { Course, CourseSelection, Department, Lecture, QuestionHistoryEntry } from '../types';
import { CoursePicker } from './CoursePicker';
import { ArenaIcon } from './ArenaIcon';
import { useI18n } from '../i18n';

interface IconSidebarProps {
  courses: Course[];
  departments: Department[];
  lectures: Lecture[];
  view: 'questions' | 'library' | 'saved' | 'documents';
  selectedCourse: CourseSelection | null;
  pickerRequest: number;
  history: QuestionHistoryEntry[];
  onNavigate: (view: 'questions' | 'library' | 'saved' | 'documents') => void;
  onNewChat: () => void;
  onSelectCourse: (selection: CourseSelection) => void;
  onClearCourse: () => void;
  onRestoreQuestion: (entry: QuestionHistoryEntry) => void;
  onClearHistory: () => void;
  onHelp: () => void;
}

export function IconSidebar({
  courses,
  departments,
  lectures,
  view,
  selectedCourse,
  pickerRequest,
  history,
  onNavigate,
  onNewChat,
  onSelectCourse,
  onClearCourse,
  onRestoreQuestion,
  onClearHistory,
  onHelp,
}: IconSidebarProps) {
  const { t, language } = useI18n();
  const [panel, setPanel] = useState<'courses' | 'history' | null>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const courseButtonRef = useRef<HTMLButtonElement>(null);
  const chatButtonRef = useRef<HTMLButtonElement>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    leaveTimer.current = null;
  };

  const openOnHover = (nextPanel: 'courses' | 'history') => {
    cancelClose();
    if (window.matchMedia('(hover: hover)').matches) setPanel(nextPanel);
  };

  const closeAfterLeave = (leavingPanel: 'courses' | 'history') => {
    if (!window.matchMedia('(hover: hover)').matches) return;
    cancelClose();
    // Allow the pointer to cross the small gap between the icon and its panel.
    leaveTimer.current = setTimeout(() => {
      leaveTimer.current = null;
      setPanel((current) => (current === leavingPanel ? null : current));
    }, 180);
  };

  useEffect(() => {
    if (pickerRequest > 0) setPanel('courses');
  }, [pickerRequest]);

  useEffect(
    () => () => {
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!panel) return;
    const outside = (event: PointerEvent) => {
      if (!sidebarRef.current?.contains(event.target as Node)) setPanel(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const focusedInside = sidebarRef.current?.contains(document.activeElement);
      setPanel(null);
      if (focusedInside) (panel === 'courses' ? courseButtonRef : chatButtonRef).current?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [panel]);

  const navigate = (nextView: IconSidebarProps['view']) => {
    cancelClose();
    setPanel(null);
    onNavigate(nextView);
  };

  return (
    <aside ref={sidebarRef} className="sidebar" aria-label={t('sidebar.main')}>
      <nav className="rail-nav" aria-label={t('sidebar.room')}>
        <button
          className="rail-button rail-new-chat"
          title={t('sidebar.newChat')}
          aria-label={t('sidebar.newChat')}
          onClick={() => {
            setPanel(null);
            onNewChat();
          }}
        >
          <Plus size={21} />
        </button>
        <div
          className="rail-popover-anchor"
          onMouseEnter={() => openOnHover('history')}
          onMouseLeave={() => closeAfterLeave('history')}
          onFocusCapture={cancelClose}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget))
              setPanel((current) => (current === 'history' ? null : current));
          }}
        >
          <button
            ref={chatButtonRef}
            className={`rail-button ${view === 'questions' || panel === 'history' ? 'active' : ''}`}
            title="Chat"
            aria-label="Chat"
            aria-current={view === 'questions' ? 'page' : undefined}
            aria-haspopup="dialog"
            aria-expanded={panel === 'history'}
            aria-controls={panel === 'history' ? 'chat-history-panel' : undefined}
            onClick={() => {
              cancelClose();
              onNavigate('questions');
              setPanel('history');
            }}
          >
            <MessageCircle size={21} />
          </button>
          {panel === 'history' && (
            <div
              id="chat-history-panel"
              className="rail-panel history-panel"
              role="dialog"
              aria-labelledby="history-panel-title"
            >
              <div className="lecture-picker-header">
                <h2 id="history-panel-title" className="lecture-picker-title">
                  {t('sidebar.history')}
                </h2>
                <button
                  className="lecture-picker-close"
                  aria-label={t('sidebar.historyClose')}
                  onClick={() => {
                    setPanel(null);
                    chatButtonRef.current?.focus();
                  }}
                >
                  <X size={17} />
                </button>
              </div>
              {history.length ? (
                <>
                  <div className="history-panel-list">
                    {history.map((entry) => (
                      <button
                        key={`${entry.department}-${entry.degree}-${entry.studyYear}-${entry.courseId}-${entry.question}`}
                        onClick={() => {
                          setPanel(null);
                          onRestoreQuestion(entry);
                        }}
                      >
                        <span>{entry.question}</span>
                        <small>
                          {courses.find((course) => course.id === entry.courseId)?.name}
                          {' · '}
                          {selectionLabel(entry, language)}
                        </small>
                      </button>
                    ))}
                  </div>
                  <button className="clear-history" onClick={onClearHistory}>
                    <Trash2 size={14} />
                    {t('sidebar.historyClear')}
                  </button>
                </>
              ) : (
                <p className="lecture-picker-empty">{t('sidebar.historyEmpty')}</p>
              )}
            </div>
          )}
        </div>
        <div
          className="rail-popover-anchor"
          onMouseEnter={() => openOnHover('courses')}
          onMouseLeave={() => closeAfterLeave('courses')}
          onFocusCapture={cancelClose}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget))
              setPanel((current) => (current === 'courses' ? null : current));
          }}
        >
          <button
            ref={courseButtonRef}
            className={`rail-button ${panel === 'courses' || selectedCourse ? 'has-selection' : ''}`}
            title={t('sidebar.courses')}
            aria-label={t('sidebar.courses')}
            aria-haspopup="dialog"
            aria-expanded={panel === 'courses'}
            aria-controls={panel === 'courses' ? 'course-picker-panel' : undefined}
            onClick={() => {
              cancelClose();
              setPanel('courses');
            }}
          >
            <GraduationCap size={23} />
          </button>
          {panel === 'courses' && (
            <div id="course-picker-panel" className="rail-panel">
              <CoursePicker
                courses={courses}
                departments={departments}
                selectedCourse={selectedCourse}
                onClear={onClearCourse}
                onSelect={(selection) => {
                  cancelClose();
                  setPanel(null);
                  onSelectCourse(selection);
                }}
                onClose={() => {
                  setPanel(null);
                  courseButtonRef.current?.focus();
                }}
              />
            </div>
          )}
        </div>
        <button
          className={`rail-button ${view === 'library' ? 'active' : ''}`}
          title={t('view.library')}
          aria-label={t('view.library')}
          aria-current={view === 'library' ? 'page' : undefined}
          onClick={() => navigate('library')}
        >
          <Layers3 size={21} />
        </button>
        <button
          className={`rail-button ${view === 'saved' ? 'active' : ''}`}
          title={t('view.saved')}
          aria-label={t('view.saved')}
          aria-current={view === 'saved' ? 'page' : undefined}
          onClick={() => navigate('saved')}
        >
          <Bookmark size={20} />
        </button>
        <button
          className={`rail-button ${view === 'documents' ? 'active' : ''}`}
          title={t('view.documents')}
          aria-label={t('view.documents')}
          aria-current={view === 'documents' ? 'page' : undefined}
          onClick={() => navigate('documents')}
        >
          <BookOpen size={20} />
        </button>
        <a className="rail-button" href="/arena" title="Versus" aria-label="Versus">
          <ArenaIcon />
        </a>
      </nav>
      <div className="rail-bottom">
        <button
          className="rail-button"
          title={t('sidebar.about')}
          aria-label={t('sidebar.about')}
          onClick={() => {
            setPanel(null);
            onHelp();
          }}
        >
          <CircleHelp size={21} />
        </button>
      </div>
    </aside>
  );
}
