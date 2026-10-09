import { readFile } from 'node:fs/promises';

const ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;

export class InputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new InputError(`${label} muss Text enthalten.`);
}

export function validateMediaUrl(value) {
  if (value === null || value === undefined) return;
  if (typeof value !== 'string') throw new InputError('mediaUrl muss eine URL oder null sein.');
  // Only native video URLs; a lecture page is not a playable media file.
  if (/^\/media\/[a-zA-Z0-9_./-]+$/.test(value) && !value.split('/').includes('..')) return;
  try {
    const url = new URL(value);
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return;
  } catch { /* Invalid URL handled below. */ }
  throw new InputError('mediaUrl muss eine HTTP(S)-Videodatei oder ein Pfad unter /media/ sein.');
}

export function validateCatalog(catalog) {
  if (!catalog || !Array.isArray(catalog.courses) || !Array.isArray(catalog.lectures)) {
    throw new InputError('Der Katalog braucht courses und lectures als Arrays.');
  }
  const courses = new Set();
  for (const course of catalog.courses) {
    if (typeof course.id !== 'string' || !ID.test(course.id) || course.id === 'all' || courses.has(course.id)) throw new InputError('Ungültige oder doppelte Kurs-ID.');
    text(course.name, 'Kursname');
    courses.add(course.id);
  }
  const lectures = new Set();
  const segments = new Set();
  for (const lecture of catalog.lectures) {
    if (typeof lecture.id !== 'string' || !ID.test(lecture.id) || lectures.has(lecture.id)) throw new InputError('Ungültige oder doppelte Vorlesungs-ID.');
    lectures.add(lecture.id);
    if (!courses.has(lecture.courseId)) throw new InputError(`Unbekannter Kurs für ${lecture.id}.`);
    text(lecture.title, 'Vorlesungstitel');
    if (!Number.isFinite(lecture.duration) || lecture.duration <= 0) throw new InputError('Ungültige Videodauer.');
    validateMediaUrl(lecture.mediaUrl);
    if (lecture.keywords !== undefined && (!Array.isArray(lecture.keywords) || lecture.keywords.some(item => typeof item !== 'string'))) {
      throw new InputError('keywords muss ein Text-Array sein.');
    }
    if (!Array.isArray(lecture.segments) || !lecture.segments.length) throw new InputError('Eine Vorlesung braucht Transkriptabschnitte.');
    let previousStart = -1;
    for (const segment of lecture.segments) {
      if (typeof segment.id !== 'string' || !ID.test(segment.id) || segments.has(segment.id)) throw new InputError('Ungültige oder doppelte Abschnitts-ID.');
      segments.add(segment.id);
      text(segment.title, 'Abschnittstitel');
      text(segment.transcript, 'Transkript');
      if (!Number.isFinite(segment.start) || !Number.isFinite(segment.end)
        || segment.start < 0 || segment.end <= segment.start || segment.end > lecture.duration
        || segment.start < previousStart) throw new InputError(`Ungültige Zeitmarken in ${segment.id}.`);
      previousStart = segment.start;
      if (segment.cues !== undefined) {
        if (!Array.isArray(segment.cues) || !segment.cues.length) throw new InputError('cues muss ein nichtleeres Array sein.');
        let cueStart = -1;
        for (const cue of segment.cues) {
          text(cue.text, 'Untertiteltext');
          if (!Number.isFinite(cue.start) || !Number.isFinite(cue.end)
            || cue.start < segment.start || cue.end > segment.end || cue.end <= cue.start
            || cue.start < cueStart) throw new InputError('Untertitelzeit liegt ausserhalb des Abschnitts.');
          cueStart = cue.start;
        }
      }
    }
  }
  return catalog;
}

export async function loadCatalog(path) {
  return validateCatalog(JSON.parse(await readFile(path, 'utf8')));
}

export function validateQuestion(input, catalog) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new InputError('JSON-Objekt erwartet.');
  text(input.question, 'Frage');
  const question = input.question.trim();
  if (question.length > 2000) throw new InputError('Die Frage darf maximal 2000 Zeichen enthalten.');
  const courseId = input.courseId === 'all' ? null : input.courseId ?? null;
  const lectureId = input.lectureId ?? null;
  if (courseId !== null && !catalog.courses.some(item => item.id === courseId)) throw new InputError('Unbekannter Kurs.', 404);
  const lecture = lectureId === null ? null : catalog.lectures.find(item => item.id === lectureId);
  if (lectureId !== null && !lecture) throw new InputError('Unbekannte Vorlesung.', 404);
  if (lecture && courseId !== null && lecture.courseId !== courseId) throw new InputError('Vorlesung gehört nicht zum gewählten Kurs.');
  const limit = input.limit ?? 3;
  if (!Number.isInteger(limit) || limit < 1 || limit > 5) throw new InputError('limit muss zwischen 1 und 5 liegen.');
  return { question, courseId, lectureId, limit };
}
