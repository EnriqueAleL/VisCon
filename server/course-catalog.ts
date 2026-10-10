import type { Express, Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { InputError, validateCatalog } from '../video-pull-up/src/catalog.mjs';
import { chunkCues, parseSubtitles, type Cue } from '../video-pull-up/src/transcripts.mjs';
import type { Course } from '../web-interface/src/types';
import type { CatalogLecture, LectureCatalog } from './lecture-catalog';

/** Courses that students and admins added through the platform: their lectures live under COURSES_DIR/<course id>/. */
export const COURSE_SLUG = /^[a-z0-9][a-z0-9-]{0,47}$/;
const VIDEO_EXTS = ['mp4', 'webm', 'mov', 'mkv'];
const COLORS = ['#526cb7', '#9a5933', '#24765a', '#8a5aa8', '#a8745a', '#4f8aa0', '#7a8a3c', '#b0566b'];

interface IndexedChapter { id: string; start: number; end: number; title: string; summary: string; key_terms: string[] }
interface IndexedLecture { lecture: number; duration: number; chapters: IndexedChapter[] }

export interface PublishedCourse { course: Course; lectures: CatalogLecture[]; skipped: string[] }
interface CourseRow { id: string; name: string; department?: string | null; degree?: 'bsc' | 'msc' | null; studyYear?: number | null; semester?: 'autumn' | 'spring' | null }
interface LectureRow { number: number; title: string; indexedAt: number | null; summaryAt: number | null }

export const courseColor = (id: string) => COLORS[createHash('sha1').update(id).digest()[0] % COLORS.length];
export function shortName(name: string): string {
  if (name.length <= 28) return name;
  const cut = name.slice(0, 27), space = cut.lastIndexOf(' ');
  return `${(space > 12 ? cut.slice(0, space) : cut).trim()}…`;
}

const root = (coursesDir: string) => resolve(coursesDir);
export const lecturesDir = (coursesDir: string, courseId: string) => join(root(coursesDir), courseId, 'lectures');
export const qaDir = (coursesDir: string, courseId: string) => join(root(coursesDir), courseId, 'qa');
const transcriptPath = (coursesDir: string, courseId: string, number: number) =>
  ['vtt', 'srt'].map(ext => join(lecturesDir(coursesDir, courseId), `lec${number}.${ext}`)).find(existsSync);
const videoExt = (coursesDir: string, courseId: string, number: number) =>
  VIDEO_EXTS.find(ext => existsSync(join(lecturesDir(coursesDir, courseId), `lec${number}.${ext}`)));

const placementKey = (row: CourseRow) => `${row.department}|${row.degree}|${row.studyYear}|${row.semester}`;
export function activeCourses(db: DatabaseSync): CourseRow[] {
  return db.prepare("SELECT id, name, department, degree, studyYear, semester FROM courses WHERE status='active' ORDER BY name").all() as unknown as CourseRow[];
}
const lectureRows = (db: DatabaseSync, courseId: string) =>
  db.prepare("SELECT number, title, indexedAt, summaryAt FROM submissions WHERE courseId=? AND type='lecture' AND status='approved' AND indexState='done' AND number IS NOT NULL ORDER BY number").all(courseId) as unknown as LectureRow[];

/** Changes whenever one course's lectures, titles, index or name change; used to rebuild only that course. */
export async function courseKey(db: DatabaseSync, coursesDir: string, row: CourseRow): Promise<string> {
  const hash = createHash('sha1').update(`${row.id}|${row.name}|${placementKey(row)}\n`);
  for (const lecture of lectureRows(db, row.id)) hash.update(`${lecture.number}|${lecture.title}|${lecture.indexedAt}|${lecture.summaryAt}\n`);
  try { hash.update(String((await stat(join(qaDir(coursesDir, row.id), 'index.json'))).mtimeMs)); } catch { /* no index yet */ }
  return hash.digest('hex');
}

/** A short fingerprint of everything the published catalog is built from. Cheap (two queries), so it can run on every request. */
export function catalogFingerprint(db: DatabaseSync): string {
  const hash = createHash('sha1');
  for (const course of activeCourses(db)) {
    hash.update(`c|${course.id}|${course.name}|${placementKey(course)}\n`);
    for (const row of lectureRows(db, course.id)) hash.update(`l|${course.id}|${row.number}|${row.title}|${row.indexedAt}|${row.summaryAt}\n`);
  }
  return hash.digest('hex');
}

async function readIndex(file: string): Promise<{ lectures: Record<string, IndexedLecture>; mtime: number } | null> {
  try { return { lectures: JSON.parse(await readFile(file, 'utf8')).lectures ?? {}, mtime: (await stat(file)).mtimeMs }; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}

/**
 * The lectures of one published course, ready for the catalog. Every lecture is validated on its own, so a
 * damaged transcript costs that lecture (and is reported in `skipped`), never the whole catalog.
 */
export async function loadPublishedCourse(db: DatabaseSync, coursesDir: string, row: CourseRow): Promise<PublishedCourse> {
  const course: Course = { id: row.id, name: row.name, shortName: shortName(row.name), color: courseColor(row.id), videoCount: 0,
    degree: row.degree ?? 'unspecified', studyYear: (row.studyYear ?? 0) as Course['studyYear'], department: row.department ?? null, semester: row.semester ?? null };
  const lectures: CatalogLecture[] = [], skipped: string[] = [];
  const index = await readIndex(join(qaDir(coursesDir, row.id), 'index.json'));
  for (const entry of lectureRows(db, row.id)) {
    const label = `${row.id} lecture ${entry.number}`;
    try {
      const indexed = index?.lectures[String(entry.number)];
      const file = transcriptPath(coursesDir, row.id, entry.number);
      if (!indexed || !file) { skipped.push(`${label}: files or index entry missing`); continue; }
      const id = `${row.id}-lec${entry.number}`;
      const cues = parseSubtitles(await readFile(file, 'utf8')) as Cue[];
      const duration = Math.max(indexed.duration ?? 0, ...cues.map(cue => cue.end));
      const segments = chunkCues(cues, id).map((segment: CatalogLecture['segments'][number]) => {
        const chapter = indexed.chapters.find(item => segment.start >= item.start && segment.start < item.end);
        return { ...segment, title: chapter?.title ?? segment.title };
      });
      const base = `/media/courses/${row.id}`;
      const ext = videoExt(coursesDir, row.id, entry.number);
      const lecture: CatalogLecture = {
        id, courseId: row.id, title: entry.title, episode: entry.number, lecturer: '', date: '', thumbnail: '', duration, demo: false,
        mediaUrl: ext ? `${base}/lectures/lec${entry.number}.${ext}` : null,
        captionsUrl: `${base}/captions/lec${entry.number}.vtt`,
        chaptersUrl: existsSync(join(qaDir(coursesDir, row.id), 'chapters', `lec${entry.number}.chapters.vtt`)) ? `${base}/chapters/lec${entry.number}.chapters.vtt` : undefined,
        hasSummary: existsSync(join(qaDir(coursesDir, row.id), 'summaries', `lec${entry.number}.json`)),
        keywords: [...new Set(indexed.chapters.flatMap(chapter => chapter.key_terms))],
        chapters: indexed.chapters.map(chapter => ({ id: `${id}-chapter-${chapter.id.replaceAll('.', '-')}`, title: chapter.title, start: chapter.start, end: chapter.end, summary: chapter.summary, transcript: '' })),
        segments,
      };
      validateCatalog({ courses: [course], lectures: [lecture] });
      lectures.push(lecture);
    } catch (error) {
      skipped.push(`${label}: ${error instanceof InputError || error instanceof Error ? error.message : 'unusable'}`);
    }
  }
  course.videoCount = lectures.length;
  return { course, lectures, skipped };
}

/** Original catalog + published courses. A published course with the id of an existing one (DDCA) adds its lectures to it. */
export function mergeCatalog(base: LectureCatalog, published: PublishedCourse[]): LectureCatalog {
  const courses = base.courses.map(course => ({ ...course }));
  const lectures = [...base.lectures];
  for (const item of published) {
    if (!item.lectures.length) continue;
    const existing = courses.find(course => course.id === item.course.id);
    if (existing) existing.videoCount += item.lectures.length; else courses.push(item.course);
    lectures.push(...item.lectures);
  }
  return validateCatalog({ courses, lectures });
}

// ---- media of published courses

const fmtTime = (seconds: number) => {
  const ms = Math.round(seconds * 1000), h = Math.floor(ms / 3_600_000), m = Math.floor(ms / 60_000) % 60, s = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
};
/** WebVTT for the browser's <track>, generated from the transcript (which may be SRT), with markup characters escaped. */
export function renderCaptions(cues: Cue[]): string {
  const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `WEBVTT\n\n${cues.map(cue => `${fmtTime(cue.start)} --> ${fmtTime(cue.end)}\n${escape(cue.text)}\n`).join('\n')}`;
}

/**
 * Videos, captions and chapter markers of published courses, under /media/courses/. These sit behind the same login guard as
 * all of /media. A file is served only for an approved lecture of an active course, with a strict name pattern.
 */
export function mountCourseMedia(app: Express, deps: { db: DatabaseSync; coursesDir: string }) {
  const base = root(deps.coursesDir);
  const approved = deps.db.prepare(`SELECT 1 AS ok FROM submissions s JOIN courses c ON c.id=s.courseId
    WHERE s.courseId=? AND s.number=? AND s.type='lecture' AND s.status='approved' AND s.indexState='done' AND c.status='active'`);
  const notFound = (res: Response) => res.status(404).json({ error: 'File not found.' });
  const send = (res: Response, file: string, type?: string) => {
    if (!file.startsWith(base + sep)) return notFound(res);
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=300', ...(type ? { 'Content-Type': type } : {}) });
    res.sendFile(file, { dotfiles: 'deny' }, error => {
      if (!error || res.headersSent) return;
      const failure = error as { status?: number; headers?: Record<string, string> };
      if (failure.status === 416) { res.set(failure.headers ?? {}); res.status(416).end(); return; } // a range beyond the end of the file
      notFound(res);
    });
  };
  app.get('/media/courses/:course/:kind/:file', async (req, res) => {
    const { course, kind, file } = req.params as Record<string, string>;
    try {
      const match = kind === 'lectures' ? /^lec(\d{1,3})\.(mp4|webm|mov|mkv)$/.exec(file) : kind === 'chapters' ? /^lec(\d{1,3})\.chapters\.vtt$/.exec(file) : kind === 'captions' ? /^lec(\d{1,3})\.vtt$/.exec(file) : null;
      if (!COURSE_SLUG.test(course) || !match || !approved.get(course, Number(match[1]))) return notFound(res);
      const number = Number(match[1]);
      if (kind === 'lectures') return send(res, join(lecturesDir(deps.coursesDir, course), file));
      if (kind === 'chapters') return send(res, join(qaDir(deps.coursesDir, course), 'chapters', file));
      const source = transcriptPath(deps.coursesDir, course, number);
      if (!source) return notFound(res);
      res.set({ 'Content-Type': 'text/vtt; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=300' });
      res.send(renderCaptions(parseSubtitles(await readFile(source, 'utf8')) as Cue[]));
    } catch { if (!res.headersSent) notFound(res); }
  });
}
