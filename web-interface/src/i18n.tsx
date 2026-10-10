import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type UiLanguage = 'de' | 'en';

const STORAGE_KEY = 'viscon.ui-language.v1';

type Vars = Record<string, string | number>;

/** German is the original wording of the page; English sits next to it so the two stay in step. */
const messages = {
  // navigation and header
  'skip': { de: 'Zum Inhalt', en: 'Skip to content' },
  'view.questions': { de: 'Chat', en: 'Chat' },
  'view.library': { de: 'Meine Vorlesungen', en: 'My lectures' },
  'view.saved': { de: 'Gespeicherte Stellen', en: 'Saved moments' },
  'view.documents': { de: 'Dokumente', en: 'Documents' },
  'header.view': { de: 'Ansicht', en: 'View' },
  'header.list': { de: 'Liste', en: 'List' },
  'header.listTitle': { de: 'Normale Ansicht', en: 'Standard view' },
  'header.galaxy': { de: 'Galaxie', en: 'Galaxy' },
  'header.galaxyTitle': { de: 'Galaxie-Ansicht', en: 'Galaxy view' },

  // loading and errors
  'loading.catalog': { de: 'Vorlesungen werden geladen…', en: 'Loading lectures…' },
  'loading.lecture': { de: 'Vorlesung wird geöffnet…', en: 'Opening lecture…' },
  'retry.connection': { de: 'Verbindung erneut versuchen', en: 'Retry connection' },
  'error.connection': { de: 'Die Verbindung ist unterbrochen. Bitte versuche es erneut.', en: 'The connection was interrupted. Please try again.' },
  'error.search': { de: 'Die Suche ist fehlgeschlagen. Bitte versuche es erneut.', en: 'The search failed. Please try again.' },
  'error.lecture': { de: 'Die Vorlesung konnte nicht geladen werden.', en: 'The lecture could not be loaded.' },

  // chat workspace
  'workspace.default': { de: 'Vorlesungen', en: 'Lectures' },
  'workspace.counts': { de: '{lectures} Vorlesungen · {courses} Kurse', en: '{lectures} lectures · {courses} courses' },
  'input.label': { de: 'Nachricht eingeben', en: 'Enter your message' },
  'input.placeholder': { de: 'Nachricht an VisCon …', en: 'Message VisCon …' },
  'input.pickFirst': { de: 'Wähle zuerst ein Fach …', en: 'Choose a course first …' },
  'course.change': { de: 'Fach wechseln', en: 'Change course' },
  'course.pick': { de: 'Fach auswählen', en: 'Choose a course' },
  'ask.submit': { de: 'Frage stellen', en: 'Ask' },
  'ask.again': { de: 'Erneut suchen', en: 'Search again' },
  'ask.searching': { de: 'Passende Transkriptstellen werden gesucht…', en: 'Searching matching transcript passages…' },
  'ask.retry': { de: 'Suche erneut versuchen', en: 'Retry search' },

  // answer
  'answer.label': { de: 'Antwort', en: 'Answer' },
  'answer.noMatch': { de: 'Keine passende Stelle gefunden', en: 'No matching passage found' },
  'answer.similar': { de: 'Ähnliche Stellen gefunden', en: 'Similar passages found' },
  'answer.generated': { de: 'Antwort aus deinen Vorlesungen', en: 'Answer from your lectures' },
  'answer.transcript': { de: 'Aus dem Transkript', en: 'From the transcript' },
  'answer.readFull': { de: 'Vollständigen Ausschnitt lesen', en: 'Read the full excerpt' },
  'common.demo': { de: 'Demo', en: 'Demo' },

  // library and saved
  'library.counts': {
    de: '{recordings} Aufzeichnungen und {demos} Demo-Videos · Kapitel und Transkripte',
    en: '{recordings} recordings and {demos} demo videos · chapters and transcripts',
  },
  'saved.counts.one': { de: '{n} gespeicherte Stelle · Deine persönliche Merkliste', en: '{n} saved moment · Your personal list' },
  'saved.counts.other': { de: '{n} gespeicherte Stellen · Deine persönliche Merkliste', en: '{n} saved moments · Your personal list' },
  'search.label': { de: 'Vorlesungen durchsuchen', en: 'Search lectures' },
  'search.placeholder': { de: 'Vorlesungen durchsuchen …', en: 'Search lectures …' },
  'search.reset': { de: 'Suche zurücksetzen', en: 'Clear search' },
  'filter.label': { de: 'Kursfilter', en: 'Course filter' },
  'filter.all': { de: 'Alle Kurse', en: 'All courses' },

  // results
  'results.matching': { de: 'Passende Vorlesungen', en: 'Matching lectures' },
  'results.all': { de: 'Alle Vorlesungen', en: 'All lectures' },
  'results.saved': { de: 'Deine Merkliste', en: 'Your saved list' },
  'results.forQuestion': { de: '{n} passende Stellen zu deiner Frage', en: '{n} matching passages for your question' },
  'results.next': { de: 'Deine nächste Frage', en: 'Your next question' },
  'results.lecture.one': { de: 'Vorlesung', en: 'lecture' },
  'results.lecture.other': { de: 'Vorlesungen', en: 'lectures' },
  'sort.label': { de: 'Vorlesungen sortieren', en: 'Sort lectures' },
  'sort.relevance': { de: 'Relevanz', en: 'Relevance' },
  'sort.newest': { de: 'Letzte Vorlesung zuerst', en: 'Newest lecture first' },
  'sort.shortest': { de: 'Kürzeste zuerst', en: 'Shortest first' },
  'layout.label': { de: 'Darstellung', en: 'Layout' },
  'layout.grid': { de: 'Rasteransicht', en: 'Grid view' },
  'layout.list': { de: 'Listenansicht', en: 'List view' },

  // empty states
  'empty.saved.title': { de: 'Hier ist Platz für deine Aha-Momente.', en: 'Room for your aha moments.' },
  'empty.landing.title': { de: 'Was steht auf deinem Lernplan?', en: "What's on your study plan?" },
  'empty.none.title': { de: 'Keine passenden Vorlesungen gefunden.', en: 'No matching lectures found.' },
  'empty.saved.text': { de: 'Deine gespeicherten Zeitstellen erscheinen hier.', en: 'Your saved moments will appear here.' },
  'empty.landing.text': { de: 'Lineare Algebra, Analysis oder Informatik.', en: 'Linear algebra, analysis or computer science.' },
  'empty.none.text': { de: 'Versuche einen anderen Begriff oder wähle alle Kurse.', en: 'Try a different term or choose all courses.' },
  'empty.saved.action': { de: 'Vorlesungen ansehen', en: 'Browse lectures' },

  // toast
  'toast.removed': { de: 'Stelle aus deiner Merkliste entfernt', en: 'Moment removed from your saved list' },
  'toast.saved': { de: 'Stelle in deiner Merkliste gespeichert', en: 'Moment saved to your list' },

  // help dialog
  'help.close': { de: 'Information schliessen', en: 'Close information' },
  'common.close': { de: 'Schliessen', en: 'Close' },
  'help.title': { de: 'Dein VisCon Lernraum', en: 'Your VisCon study room' },
  'help.p1': {
    de: 'Hier findest du die Vorlesungsaufzeichnungen mit ihren Transkripten, Kapiteln und vorhandenen Lernnotizen. Die drei kurzen Beispielvideos sind als Demo gekennzeichnet.',
    en: 'Here you will find the lecture recordings with their transcripts, chapters and any available study notes. The three short sample videos are marked as demos.',
  },
  'help.p2': {
    de: 'Die Suche zeigt passende Transkriptstellen. Gespeicherte Momente und Fragen bleiben in diesem Browser. Über Basis Arena kannst du weiterhin gemeinsam spielen und deinen Elo-Fortschritt verfolgen. Die Arena verwendet eine separate Fragenbank.',
    en: 'The search shows matching transcript passages. Saved moments and questions stay in this browser. In Basis Arena you can still play together and follow your Elo progress. The arena uses a separate question bank.',
  },
  'help.status': { de: 'Vorlesungen und Basis Arena verbunden', en: 'Lectures and Basis Arena connected' },
  'help.back': { de: 'Zurück zum Lernraum', en: 'Back to the study room' },

  // sidebar
  'sidebar.main': { de: 'Hauptnavigation', en: 'Main navigation' },
  'sidebar.room': { de: 'Lernraum', en: 'Study room' },
  'sidebar.newChat': { de: 'Neuer Chat', en: 'New chat' },
  'sidebar.history': { de: 'Chatverlauf', en: 'Chat history' },
  'sidebar.historyClose': { de: 'Chatverlauf schliessen', en: 'Close chat history' },
  'sidebar.historyClear': { de: 'Frageverlauf löschen', en: 'Clear question history' },
  'sidebar.historyEmpty': { de: 'Noch keine Fragen gestellt.', en: 'No questions asked yet.' },
  'sidebar.courses': { de: 'Kurse', en: 'Courses' },
  'sidebar.about': { de: 'Über VisCon', en: 'About VisCon' },

  // course picker
  'picker.label': { de: 'Kursauswahl', en: 'Course selection' },
  'picker.close': { de: 'Kursauswahl schliessen', en: 'Close course selection' },
  'picker.title.department': { de: 'Departement auswählen', en: 'Choose department' },
  'picker.title.programme': { de: 'Studienjahr auswählen', en: 'Choose study year' },
  'picker.title.course': { de: 'Fach auswählen', en: 'Choose a course' },
  'picker.group.department': { de: 'Departement', en: 'Department' },
  'picker.group.programme': { de: 'Studienjahr', en: 'Study year' },
  'picker.group.course': { de: 'Fach', en: 'Course' },
  'picker.changeDepartment': { de: 'Departement ändern', en: 'Change department' },
  'picker.changeYear': { de: 'Studienjahr ändern', en: 'Change study year' },
  'picker.other': { de: 'Weitere Fächer', en: 'Other courses' },
  'picker.year': { de: '{year}. Jahr', en: 'Year {year}' },
  'picker.yearLabel': { de: '{degree}, {year}. Studienjahr', en: '{degree}, year {year}' },
  'picker.empty': { de: 'Hier sind noch keine Fächer verfügbar.', en: 'No courses are available here yet.' },
  'degree.unspecified': { de: 'Ohne Studiengangsangabe', en: 'No programme specified' },

  // lecture viewer
  'viewer.lecture': { de: 'Vorlesung {n}', en: 'Lecture {n}' },
  'viewer.closeLabel': { de: 'Vorlesung schliessen', en: 'Close lecture' },
  'viewer.mediaError': {
    de: 'Das Video konnte nicht geladen werden. Prüfe die Verbindung und versuche es erneut.',
    en: 'The video could not be loaded. Check your connection and try again.',
  },
  'viewer.noVideo': {
    de: 'Für diese Vorlesung ist kein abspielbares Video verfügbar. Kapitel und Transkript kannst du weiterhin lesen.',
    en: 'No playable video is available for this lecture. You can still read the chapters and transcript.',
  },
  'viewer.reload': { de: 'Video erneut laden', en: 'Reload video' },
  'viewer.removeCurrent': { de: 'Aktuelle Stelle entfernen', en: 'Remove current moment' },
  'viewer.saveCurrent': { de: 'Aktuelle Stelle speichern', en: 'Save current moment' },
  'viewer.details': { de: 'Vorlesungsdetails', en: 'Lecture details' },
  'tab.chapters': { de: 'Kapitel', en: 'Chapters' },
  'tab.moments': { de: 'Stellen', en: 'Moments' },
  'tab.transcript': { de: 'Transkript', en: 'Transcript' },
  'tab.notes': { de: 'Lernnotizen', en: 'Study notes' },
  'notes.loading': { de: 'Lernnotizen werden geladen…', en: 'Loading study notes…' },
  'notes.reload': { de: 'Erneut laden', en: 'Reload' },
  'notes.ai': { de: 'KI-erstellte Lernnotizen · mit der Vorlesung abgleichen', en: 'AI-generated study notes · check them against the lecture' },
  'notes.takeaways': { de: 'Zum Mitnehmen', en: 'Takeaways' },
  'notes.none': {
    de: 'Für diese Vorlesung sind noch keine Lernnotizen vorhanden. Unter „Kapitel“ findest du die Themenübersicht und kurze Zusammenfassungen.',
    en: 'There are no study notes for this lecture yet. Under “Chapters” you will find the topic overview and short summaries.',
  },
  'moment.remove': { de: 'Stelle entfernen', en: 'Remove moment' },
  'moment.save': { de: 'Stelle speichern', en: 'Save moment' },

  // lecture card
  'card.open': { de: '{title} öffnen', en: 'Open {title}' },
  'card.short': { de: 'VL {n}', en: 'Lec {n}' },
  'card.bestMatch': { de: 'Beste Übereinstimmung', en: 'Best match' },
  'card.meta.demo': { de: 'Beispielvideo · kein Kursmaterial', en: 'Sample video · not course material' },
  'card.meta.video': { de: 'Video mit Transkript und Kapiteln', en: 'Video with transcript and chapters' },
  'card.meta.transcript': { de: 'Transkript verfügbar · Video fehlt', en: 'Transcript available · video missing' },
  'card.matches.one': { de: 'passende Stelle', en: 'matching passage' },
  'card.matches.other': { de: 'passende Stellen', en: 'matching passages' },
  'card.openAt': { de: '{title} ab {time} öffnen', en: 'Open {title} at {time}' },
  'card.moreChapters': { de: 'Alle {n} Kapitel ansehen', en: 'View all {n} chapters' },
  'card.moreMoments': { de: 'Alle {n} Stellen ansehen', en: 'View all {n} moments' },

  // documents
  'documents.title': { de: 'PDF-Dokument · Theoretische Informatik', en: 'PDF document · Theoretical computer science' },

  // settings
  'settings.title': { de: 'Einstellungen', en: 'Settings' },
  'settings.interface': { de: 'Sprache der Oberfläche', en: 'Interface language' },
  'settings.answer': { de: 'Sprache der KI-Antwort', en: 'AI answer language' },
  'settings.auto': { de: 'Automatisch', en: 'Automatic' },
  'settings.autoHint': { de: 'Wie die Frage', en: 'Same as the question' },
  'settings.deHint': { de: 'Antworten auf Deutsch', en: 'Answers in German' },
  'settings.enHint': { de: 'Antworten auf Englisch', en: 'Answers in English' },
  'settings.note': {
    de: 'Die Antwortsprache gilt für Antworten in „Chat“. Hinweise vom Server können weiterhin Deutsch sein.',
    en: 'The answer language applies to answers in “Chat”. Some messages from the server may still be in German.',
  },
} as const;

export type MessageKey = keyof typeof messages;

const interpolate = (text: string, vars?: Vars) =>
  vars ? text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match)) : text;

/** Translation for code that is not a React component. */
export function translate(language: UiLanguage, key: MessageKey, vars?: Vars): string {
  return interpolate(messages[key][language], vars);
}

const isLanguage = (value: unknown): value is UiLanguage => value === 'de' || value === 'en';

/** The saved choice, otherwise the browser's language (German for German browsers, English for everything else). */
export function storedLanguage(): UiLanguage {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (isLanguage(saved)) return saved;
  } catch {
    // Storage may be unavailable; fall through to the browser language.
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('de') ? 'de' : 'en';
}

interface I18n {
  language: UiLanguage;
  setLanguage: (language: UiLanguage) => void;
  t: (key: MessageKey, vars?: Vars) => string;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<UiLanguage>(storedLanguage);

  const setLanguage = useCallback((next: UiLanguage) => {
    setLanguageState(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // The choice then only lasts until the page is closed.
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = language === 'de' ? 'de-CH' : 'en';
  }, [language]);

  const value = useMemo<I18n>(
    () => ({ language, setLanguage, t: (key, vars) => translate(language, key, vars) }),
    [language, setLanguage],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside <I18nProvider>.');
  return context;
}
