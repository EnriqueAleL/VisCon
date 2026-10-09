// Small, dependency-free lexical baseline. Semantic search can replace this module later.
const STOP = new Set(`aber als am an auch auf aus bei beim bis da das dass dem den der des die doch du ein eine einem einen einer eines er es etwas fuer fur hat haben hier ich im in ist ja kann kannst man mich mir mit nach nicht noch nun oder ohne sein seine sich sie sind so ueber uber um und uns vom von vor wann warum was welche welcher welchen wenn werde werden weshalb wie wir wird wo zu zum zur zusammen erklaer erklaere erklar erklaren erklare bitte verstehen funktioniert unterschied frage vorlesung the a an and are as at be can do does for from how i in is it me of on or please that this to what when why with you`.split(/\s+/));

const GROUPS = [
  ['pipeline', 'pipelines', 'pipelining', 'pipelined'],
  ['hazard', 'hazards'],
  ['cache', 'caches', 'caching'],
  ['byte', 'bytes'],
  ['eigenwert', 'eigenwerte', 'eigenwerten', 'eigenvalue', 'eigenvalues'],
  ['eigenvektor', 'eigenvektoren', 'eigenvector', 'eigenvectors'],
  ['matrix', 'matrizen', 'matrices'],
  ['ableitung', 'ableitungen', 'ableiten', 'differenzieren', 'derivative', 'derivatives', 'differentiate', 'differentiation'],
  ['berechnen', 'berechne', 'berechnung', 'bestimmen', 'bestimme', 'compute', 'calculate', 'calculation'],
  ['kettenregel', 'chainrule'],
  ['produktregel', 'productrule'],
  ['rekursion', 'rekursiv', 'rekursive', 'recursion', 'recursive'],
  ['basisfall', 'abbruchbedingung', 'basecase'],
  ['stammfunktion', 'stammfunktionen', 'antiderivative'],
  ['integral', 'integrale', 'integralen', 'integration', 'integrieren', 'integrals', 'integrate'],
  ['grenzwert', 'grenzwerte', 'limit', 'limits'],
  ['stetig', 'stetigkeit', 'continuity', 'continuous'],
  ['diagonalisieren', 'diagonalisierung', 'diagonalisierbar', 'diagonalization', 'diagonalisation'],
  ['geometrisch', 'geometrische', 'geometrischen', 'geometrie', 'geometric', 'geometrical'],
  ['hashmap', 'hashtabelle', 'hashtabellen', 'hashtable'],
  ['laufzeit', 'komplexitaet', 'komplexitat', 'complexity', 'runtime'],
];
const ALIASES = new Map(GROUPS.flatMap(group => group.map(word => [word, group[0]])));
const GENERIC = new Set(['berechnen', 'beispiel', 'beispiele', 'bedeutung', 'formel', 'formeln', 'schritt', 'schritte', 'use', 'braucht', 'benoetigt', 'moechte', 'verstehe']);
const CORE_TOPICS = new Set(GROUPS.map(group => group[0]).filter(term => term !== 'berechnen'));

export function normalize(value) {
  return value.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/chain\s+rule/g, 'chainrule').replace(/product\s+rule/g, 'productrule')
    .replace(/base\s+case/g, 'basecase').replace(/hash\s+table/g, 'hashtable');
}

export function tokens(value) {
  return (normalize(value).match(/[a-z0-9]+/g) ?? []).filter(term => term.length >= 2 && !STOP.has(term))
    .map(term => ALIASES.get(term) ?? term);
}

const counts = terms => terms.reduce((map, term) => map.set(term, (map.get(term) ?? 0) + 1), new Map());

export function createRetriever(catalog) {
  const documents = catalog.lectures.flatMap(lecture => lecture.segments.map(segment => {
    const terms = tokens(`${segment.title} ${segment.title} ${segment.transcript}`);
    return { lecture, segment, terms, titleTerms: tokens(segment.title), frequencies: counts(terms), metadata: new Set(tokens(`${lecture.title} ${(lecture.keywords ?? []).join(' ')}`)) };
  }));
  const averageLength = documents.reduce((sum, doc) => sum + doc.terms.length, 0) / Math.max(documents.length, 1);
  const documentFrequency = counts(documents.flatMap(doc => [...doc.frequencies.keys()]));
  const idf = term => Math.log(1 + (documents.length - (documentFrequency.get(term) ?? 0) + 0.5) / ((documentFrequency.get(term) ?? 0) + 0.5));

  return ({ question, courseId = null, lectureId = null, limit = 3 }) => {
    const query = [...new Set(tokens(question))];
    const topics = query.filter(term => !GENERIC.has(term));
    if (!topics.length) return [];
    const requiredTopics = topics.filter(term => CORE_TOPICS.has(term));
    const matches = documents.filter(doc => (!courseId || doc.lecture.courseId === courseId) && (!lectureId || doc.lecture.id === lectureId))
      .map(doc => {
        let score = 0;
        let matched = 0;
        let topicMatches = 0;
        for (const term of query) {
          const frequency = doc.frequencies.get(term) ?? 0;
          if (frequency) {
            matched++;
            if (topics.includes(term)) topicMatches++;
            score += idf(term) * (frequency * 2.2) / (frequency + 1.2 * (0.25 + 0.75 * doc.terms.length / Math.max(averageLength, 1)));
            // Prefer the section introducing a topic over later sections merely mentioning it.
            if (doc.titleTerms[0] === term) score += idf(term) * 0.9;
          }
          if (frequency && doc.metadata.has(term)) score += idf(term) * 0.2;
        }
        // Lecture-wide keywords alone cannot create a timestamp match.
        const coverage = matched / query.length;
        const supportCoverage = topicMatches / topics.length;
        const requiredTopicsPresent = requiredTopics.every(term => doc.frequencies.has(term));
        score *= 0.5 + coverage;
        let cue = null;
        let bestCueScore = 0;
        for (const item of doc.segment.cues ?? []) {
          const cueTerms = new Set(tokens(item.text));
          const cueScore = query.reduce((sum, term) => sum + (cueTerms.has(term) ? idf(term) : 0), 0);
          if (cueScore > bestCueScore) { cue = item; bestCueScore = cueScore; }
        }
        return { ...doc, score, coverage, supportCoverage, requiredTopicsPresent, matched, topicMatches, start: cue?.start ?? doc.segment.start };
      }).filter(item => item.topicMatches > 0 && item.requiredTopicsPresent && item.coverage >= 0.25)
      .sort((a, b) => b.score - a.score || b.coverage - a.coverage || a.start - b.start);
    if (!matches.length) return [];
    // Suppress weak tangential matches; expose scores as scores, not probabilities.
    return matches.filter(item => item.score >= matches[0].score * 0.45).slice(0, limit);
  };
}
