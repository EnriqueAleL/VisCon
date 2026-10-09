import type { Course, CourseId, Lecture } from '../types';

// Synthetic demonstration content, not actual ETH lecture recordings.
export const courses: Course[] = [
  {
    id: 'linear-algebra',
    name: 'Lineare Algebra I',
    shortName: 'Lineare Algebra',
    color: '#526cb7',
    videoCount: 3,
  },
  {
    id: 'analysis',
    name: 'Analysis I',
    shortName: 'Analysis',
    color: '#bd754b',
    videoCount: 3,
  },
  {
    id: 'informatics',
    name: 'Informatik I',
    shortName: 'Informatik',
    color: '#5f8c78',
    videoCount: 2,
  },
];

export const lectures: Lecture[] = [
  {
    id: 'eigenvalues-introduction',
    courseId: 'linear-algebra',
    title: 'Eigenwerte und Eigenvektoren',
    lecturer: 'Prof. Dr. Lena Keller',
    date: '2026-10-05',
    duration: 3180,
    episode: 7,
    thumbnail: '/images/algebra-1.jpg',
    keywords: [
      'eigenwert',
      'eigenwerte',
      'eigenvektor',
      'eigenvektoren',
      'matrix',
      'matrizen',
      'av',
      'lambda',
      'geometrie',
    ],
    segments: [
      {
        id: 'eigenvalues-geometric',
        start: 702,
        end: 954,
        title: 'Was bleibt bei einer linearen Abbildung gleich?',
        transcript:
          'Ein Eigenvektor ist ein von null verschiedener Vektor, dessen Richtung durch die Matrix unverändert bleibt. Der zugehörige Eigenwert beschreibt, um welchen Faktor er gestreckt oder gestaucht wird. Genau das drückt die Gleichung Av = λv aus.',
      },
      {
        id: 'eigenvalues-computation',
        start: 1446,
        end: 1795,
        title: 'Eigenwerte und Eigenvektoren berechnen',
        transcript:
          'Zuerst bestimmen wir die Eigenwerte über die Gleichung det(A − λI) = 0. Anschliessend lösen wir für jeden Eigenwert das homogene Gleichungssystem (A − λI)v = 0 und erhalten die zugehörigen Eigenvektoren.',
      },
      {
        id: 'eigenvalues-example',
        start: 2238,
        end: 2512,
        title: 'Ein Beispiel mit einer 2 × 2-Matrix',
        transcript:
          'Wir betrachten eine Matrix mit den Eigenwerten 2 und 3. Die Eigenvektoren zeigen die beiden Richtungen, in denen die Abbildung ausschliesslich skaliert. Ein negativer Eigenwert würde die Orientierung zusätzlich umkehren.',
      },
    ],
  },
  {
    id: 'diagonalization',
    courseId: 'linear-algebra',
    title: 'Diagonalisierung von Matrizen',
    lecturer: 'Prof. Dr. Lena Keller',
    date: '2026-10-07',
    duration: 3374,
    episode: 8,
    thumbnail: '/images/algebra-2.jpg',
    keywords: [
      'diagonalisierung',
      'diagonalisieren',
      'eigenwert',
      'eigenwerte',
      'eigenvektor',
      'eigenvektoren',
      'basis',
      'basiswechsel',
      'matrix',
      'matrizen',
    ],
    segments: [
      {
        id: 'diagonalization-basis',
        start: 488,
        end: 793,
        title: 'Eine Basis aus Eigenvektoren',
        transcript:
          'Besitzt eine n × n-Matrix n linear unabhängige Eigenvektoren, können wir diese als Basis verwenden. In dieser Basis ist die Abbildung besonders einfach: Auf der Diagonale stehen die zugehörigen Eigenwerte.',
      },
      {
        id: 'diagonalization-change',
        start: 1294,
        end: 1660,
        title: 'Der Zusammenhang A = PDP⁻¹',
        transcript:
          'Die Spalten von P enthalten die Eigenvektoren. Die Diagonalmatrix D enthält in derselben Reihenfolge die Eigenwerte. Der Basiswechsel erklärt, weshalb A = PDP⁻¹ gilt und wie wir Potenzen einer Matrix einfacher berechnen.',
      },
      {
        id: 'diagonalization-limits',
        start: 2472,
        end: 2790,
        title: 'Wann ist eine Matrix diagonalisierbar?',
        transcript:
          'Verschiedene Eigenwerte liefern linear unabhängige Eigenvektoren. Bei mehrfachen Eigenwerten vergleichen wir die algebraische und geometrische Vielfachheit: Es müssen insgesamt genügend unabhängige Eigenvektoren vorhanden sein.',
      },
    ],
  },
  {
    id: 'spectral-theorem',
    courseId: 'linear-algebra',
    title: 'Symmetrische Matrizen und der Spektralsatz',
    lecturer: 'Prof. Dr. Lena Keller',
    date: '2026-10-09',
    duration: 2916,
    episode: 9,
    thumbnail: '/images/algebra-3.jpg',
    keywords: [
      'spektralsatz',
      'symmetrisch',
      'symmetrische',
      'eigenwert',
      'eigenwerte',
      'eigenvektor',
      'eigenvektoren',
      'orthogonal',
      'orthonormal',
      'matrix',
    ],
    segments: [
      {
        id: 'spectral-orthogonal',
        start: 836,
        end: 1104,
        title: 'Warum sind die Eigenvektoren orthogonal?',
        transcript:
          'Für eine reelle symmetrische Matrix sind Eigenvektoren zu verschiedenen Eigenwerten orthogonal. Wir zeigen dies über das Skalarprodukt und die Eigenschaft Aᵀ = A. Alle Eigenwerte einer solchen Matrix sind reell.',
      },
      {
        id: 'spectral-theorem-proof',
        start: 1675,
        end: 2051,
        title: 'Orthogonale Diagonalisierung',
        transcript:
          'Der Spektralsatz garantiert eine Orthonormalbasis aus Eigenvektoren. Mit der orthogonalen Matrix Q können wir A als QDQᵀ schreiben. Die Eigenwerte in D beschreiben die Skalierung entlang dieser orthogonalen Richtungen.',
      },
    ],
  },
  {
    id: 'limits-continuity',
    courseId: 'analysis',
    title: 'Grenzwerte und Stetigkeit',
    lecturer: 'Prof. Dr. Jonas Meier',
    date: '2026-10-02',
    duration: 3260,
    episode: 5,
    thumbnail: '/images/analysis-1.jpg',
    keywords: [
      'grenzwert',
      'grenzwerte',
      'stetigkeit',
      'stetig',
      'epsilon',
      'delta',
      'folgen',
      'konvergenz',
      'funktion',
    ],
    segments: [
      {
        id: 'limits-definition',
        start: 612,
        end: 963,
        title: 'Die ε-δ-Definition verstehen',
        transcript:
          'Für jede gewünschte Genauigkeit ε wählen wir ein δ, sodass alle Funktionswerte in der entsprechenden Umgebung nahe am Grenzwert liegen. Wir gehen die Definition Schritt für Schritt an einer linearen Funktion durch.',
      },
      {
        id: 'limits-continuity-example',
        start: 1814,
        end: 2146,
        title: 'Stetigkeit an einer Stelle prüfen',
        transcript:
          'Eine Funktion ist an einer Stelle stetig, wenn ihr Grenzwert dort mit dem Funktionswert übereinstimmt. An einer stückweise definierten Funktion vergleichen wir den linksseitigen und rechtsseitigen Grenzwert.',
      },
    ],
  },
  {
    id: 'derivatives',
    courseId: 'analysis',
    title: 'Ableitungen und die Kettenregel',
    lecturer: 'Prof. Dr. Jonas Meier',
    date: '2026-10-06',
    duration: 3468,
    episode: 6,
    thumbnail: '/images/analysis-2.jpg',
    keywords: [
      'ableitung',
      'ableitungen',
      'ableiten',
      'kettenregel',
      'differenzieren',
      'differentialrechnung',
      'produktregel',
      'funktion',
      'tangente',
    ],
    segments: [
      {
        id: 'derivatives-tangent',
        start: 425,
        end: 739,
        title: 'Von der Sekante zur Tangente',
        transcript:
          'Die Ableitung entsteht als Grenzwert des Differenzenquotienten. Sie beschreibt die lokale Änderungsrate einer Funktion und die Steigung ihrer Tangente. Wir illustrieren den Übergang von der Sekante zur Tangente.',
      },
      {
        id: 'derivatives-chain-rule',
        start: 1358,
        end: 1726,
        title: 'Die Kettenregel an einem Beispiel',
        transcript:
          'Bei einer zusammengesetzten Funktion multiplizieren wir die äussere Ableitung mit der inneren Ableitung. Für sin(x²) ergibt das cos(x²) · 2x. Wir identifizieren zunächst die innere und äussere Funktion.',
      },
      {
        id: 'derivatives-product-rule',
        start: 2520,
        end: 2776,
        title: 'Kettenregel und Produktregel kombinieren',
        transcript:
          'Für x · exp(x²) brauchen wir sowohl die Produktregel als auch die Kettenregel. Wir zerlegen den Ausdruck, differenzieren die einzelnen Teile und fassen das Ergebnis anschliessend zusammen.',
      },
    ],
  },
  {
    id: 'integrals',
    courseId: 'analysis',
    title: 'Integrale und der Hauptsatz',
    lecturer: 'Prof. Dr. Jonas Meier',
    date: '2026-10-08',
    duration: 3082,
    episode: 7,
    thumbnail: '/images/analysis-3.jpg',
    keywords: [
      'integral',
      'integrale',
      'integration',
      'integrieren',
      'hauptsatz',
      'stammfunktion',
      'fläche',
      'flächeninhalt',
      'riemann',
      'ableitung',
    ],
    segments: [
      {
        id: 'integrals-riemann',
        start: 574,
        end: 926,
        title: 'Flächen mit Riemannsummen berechnen',
        transcript:
          'Wir nähern den orientierten Flächeninhalt unter einer Kurve durch Rechtecke an. Werden die Teilintervalle immer feiner, führt der Grenzwert dieser Riemannsummen zum bestimmten Integral.',
      },
      {
        id: 'integrals-fundamental',
        start: 1540,
        end: 1920,
        title: 'Warum sind Ableitung und Integral verbunden?',
        transcript:
          'Der Hauptsatz der Differential- und Integralrechnung verbindet Integration und Ableitung. Kennen wir eine Stammfunktion F von f, berechnen wir das bestimmte Integral von a bis b als F(b) − F(a).',
      },
    ],
  },
  {
    id: 'recursion',
    courseId: 'informatics',
    title: 'Rekursion und rekursive Algorithmen',
    lecturer: 'Dr. Nora Fischer',
    date: '2026-10-05',
    duration: 2841,
    episode: 4,
    thumbnail: '/images/informatics-1.jpg',
    keywords: [
      'rekursion',
      'rekursiv',
      'rekursive',
      'algorithmus',
      'algorithmen',
      'fakultät',
      'fibonacci',
      'abbruchbedingung',
      'laufzeit',
      'komplexität',
    ],
    segments: [
      {
        id: 'recursion-base-case',
        start: 396,
        end: 712,
        title: 'Basisfall und rekursiver Aufruf',
        transcript:
          'Eine rekursive Funktion löst ein Problem, indem sie sich selbst mit einem kleineren Teilproblem aufruft. Der Basisfall beendet die Rekursion. Am Beispiel der Fakultät verfolgen wir die Aufrufe und Rückgabewerte.',
      },
      {
        id: 'recursion-complexity',
        start: 1572,
        end: 1916,
        title: 'Die Laufzeit von Fibonacci verstehen',
        transcript:
          'Die naive rekursive Berechnung der Fibonacci-Zahlen löst dieselben Teilprobleme mehrfach. Der Aufrufbaum zeigt das exponentielle Wachstum. Mit Memoisierung speichern wir Ergebnisse und erreichen eine lineare Laufzeit.',
      },
    ],
  },
  {
    id: 'data-structures',
    courseId: 'informatics',
    title: 'Datenstrukturen: Listen und Hashtabellen',
    lecturer: 'Dr. Nora Fischer',
    date: '2026-10-08',
    duration: 3015,
    episode: 5,
    thumbnail: '/images/informatics-2.jpg',
    keywords: [
      'datenstruktur',
      'datenstrukturen',
      'liste',
      'listen',
      'hashtabelle',
      'hashtabellen',
      'hashmap',
      'hashing',
      'kollision',
      'laufzeit',
      'komplexität',
      'suchen',
    ],
    segments: [
      {
        id: 'data-structures-comparison',
        start: 708,
        end: 1014,
        title: 'Arrays und verkettete Listen vergleichen',
        transcript:
          'Arrays bieten direkten Zugriff über einen Index. Verkettete Listen bestehen aus einzelnen Knoten und erfordern für den Zugriff einen Durchlauf. Wir vergleichen Speicherbedarf sowie die Laufzeit beim Einfügen und Suchen.',
      },
      {
        id: 'data-structures-hashing',
        start: 1694,
        end: 2058,
        title: 'Wie funktioniert eine Hashtabelle?',
        transcript:
          'Eine Hashfunktion ordnet einem Schlüssel einen Speicherplatz zu. Wenn zwei Schlüssel denselben Platz erhalten, entsteht eine Kollision. Wir besprechen Verkettung als Lösung und weshalb der Zugriff im Durchschnitt konstant schnell ist.',
      },
    ],
  },
];

export const initialQuestion = 'Wie hängen Eigenwerte und Eigenvektoren zusammen?';

export const suggestedQuestions = [
  { label: 'Eigenwerte verstehen', question: initialQuestion },
  { label: 'Kettenregel', question: 'Wie funktioniert die Kettenregel beim Ableiten?' },
  { label: 'Rekursion', question: 'Wie funktioniert Rekursion und was ist der Basisfall?' },
  { label: 'Integrale', question: 'Wie hängen Integrale und Stammfunktionen zusammen?' },
];

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .toLowerCase();
}

const stopWords = new Set([
  'aber',
  'als',
  'am',
  'an',
  'auch',
  'auf',
  'beim',
  'das',
  'dem',
  'den',
  'der',
  'des',
  'die',
  'ein',
  'eine',
  'einem',
  'einen',
  'einer',
  'es',
  'fur',
  'hangen',
  'funktioniert',
  'verstehen',
  'erklaren',
  'hat',
  'ich',
  'im',
  'in',
  'ist',
  'kann',
  'man',
  'mit',
  'nach',
  'oder',
  'sich',
  'sind',
  'und',
  'von',
  'was',
  'welche',
  'welchen',
  'welcher',
  'wenn',
  'wer',
  'wie',
  'wird',
  'wo',
  'zu',
  'zum',
  'zur',
  'zusammen',
]);

function queryTerms(question: string): string[] {
  return [...new Set(normalize(question).match(/[a-z0-9]+/g) ?? [])].filter(
    (term) => term.length > 2 && !stopWords.has(term),
  );
}

export function searchLectures(question: string, courseId: CourseId): Lecture[] {
  const available = lectures.filter(
    (lecture) => courseId === 'all' || lecture.courseId === courseId,
  );
  if (!question.trim()) return available;

  const terms = queryTerms(question);
  if (!terms.length) return [];

  return available
    .map((lecture) => {
      const title = normalize(lecture.title);
      const keywords = lecture.keywords.map(normalize);
      const segments = normalize(
        lecture.segments.map((segment) => `${segment.title} ${segment.transcript}`).join(' '),
      );
      const score = terms.reduce(
        (total, term) =>
          total +
          (title.includes(term) ? 6 : 0) +
          (keywords.some((keyword) => keyword.includes(term)) ? 3 : 0) +
          (segments.includes(term) ? 1 : 0),
        0,
      );
      return { lecture, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ lecture }) => lecture);
}

export function searchLectureMatches(question: string, courseId: CourseId): Lecture[] {
  const terms = queryTerms(question);
  const matchesTerm = (text: string, term: string) =>
    text.includes(term) || (term.length > 5 && text.includes(term.replace(/(?:en|e|n)$/, '')));
  return searchLectures(question, courseId).map((lecture) => {
    const scoredSegments = lecture.segments.map((segment) => {
      const title = normalize(segment.title);
      const transcript = normalize(segment.transcript);
      const matchedTerms = terms.filter(
        (term) => matchesTerm(title, term) || matchesTerm(transcript, term),
      ).length;
      const score = terms.reduce(
        (total, term) =>
          total + (matchesTerm(title, term) ? 6 : matchesTerm(transcript, term) ? 1 : 0),
        0,
      );
      return { segment, score, matchedTerms };
    });
    const highestScore = Math.max(...scoredSegments.map((item) => item.score));
    const matchingSegments = scoredSegments
      .filter(
        ({ score, matchedTerms }) =>
          score > 0 && (matchedTerms === terms.length || score >= highestScore / 3),
      )
      .sort((a, b) => b.score - a.score)
      .map(({ segment }) => segment);

    // A lecture can match its title or keywords without a segment-level match.
    return { ...lecture, segments: matchingSegments.length ? matchingSegments : lecture.segments };
  });
}

export function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}
