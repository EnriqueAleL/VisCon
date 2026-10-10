import { readFile, readdir, open } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCatalog } from '../video-pull-up/src/catalog.mjs';
import { chunkCues, parseSubtitles, type Cue } from '../video-pull-up/src/transcripts.mjs';
import type { Course, Lecture, LectureSummary } from '../web-interface/src/types';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export interface CatalogLecture extends Lecture {
  segments: (Lecture['segments'][number] & { cues?: Cue[] })[];
}
export interface LectureCatalog { courses: Course[]; lectures: CatalogLecture[] }
interface IndexedChapter { id: string; start: number; end: number; title: string; summary: string; key_terms: string[] }
interface IndexedLecture { lecture: number; title: string; duration: number; chapters: IndexedChapter[] }

async function playable(file: string) {
  let handle;
  try {
    handle = await open(file, 'r');
    const buffer = Buffer.alloc(100);
    const { bytesRead } = await handle.read(buffer, 0, 100, 0);
    return bytesRead > 0 && !buffer.toString().startsWith('version https://git-lfs.github.com/spec/v1');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  } finally { await handle?.close(); }
}

/** Reuses the Q&A chapter index and original VTTs; no generated catalogue to keep in sync. */
export async function loadLectureCatalog(root = projectRoot): Promise<LectureCatalog> {
  const index = JSON.parse(await readFile(join(root, 'qa/data/index.json'), 'utf8')) as { lectures: Record<string, IndexedLecture> };
  const cached = new Set(await readdir(join(root, 'qa/data/summaries')).catch(() => [] as string[]));
  const lectures: CatalogLecture[] = await Promise.all(Object.values(index.lectures)
    .sort((a, b) => a.lecture - b.lecture).map(async entry => {
      const id = `lec${entry.lecture}`;
      const cues = parseSubtitles(await readFile(join(root, `lectures/${id}.vtt`), 'utf8'));
      const duration = Math.max(entry.duration, ...cues.map(cue => cue.end));
      const segments = chunkCues(cues, id).map(segment => {
        const chapter = entry.chapters.find(item => segment.start >= item.start && segment.start < item.end);
        return { ...segment, title: chapter?.title ?? segment.title };
      });
      return {
        id, courseId: 'computer-architecture', title: entry.title, episode: entry.lecture,
        lecturer: 'Digital Design and Computer Architecture', date: '', thumbnail: '', duration,
        demo: false, mediaUrl: await playable(join(root, `lectures/${id}.mp4`)) ? `/media/lectures/${id}.mp4` : null,
        captionsUrl: `/media/lectures/${id}.vtt`, chaptersUrl: `/media/chapters/${id}.chapters.vtt`,
        hasSummary: cached.has(`${id}.json`),
        keywords: [...new Set(entry.chapters.flatMap(chapter => chapter.key_terms))],
        chapters: entry.chapters.map(chapter => ({
          id: `${id}-chapter-${chapter.id.replaceAll('.', '-')}`, title: chapter.title,
          start: chapter.start, end: chapter.end, summary: chapter.summary, transcript: '',
        })), segments,
      };
    }));
  const demo = JSON.parse(await readFile(join(root, 'video-pull-up/data/demo-catalog.json'), 'utf8')) as LectureCatalog;
  const colors = ['#526cb7', '#9a5933', '#24765a'];
  const courses: Course[] = [
    { id: 'computer-architecture', name: 'Digital Design & Computer Architecture', shortName: 'Computer Architecture', color: '#24765a', videoCount: lectures.length, degree: 'bsc' as const, studyYear: 1 as const, department: 'D-INFK', semester: 'autumn' as const },
    ...demo.courses.map((course, index) => ({ ...course, name: `${course.name} · Demo`, shortName: course.name, color: colors[index % colors.length], videoCount: demo.lectures.filter(lecture => lecture.courseId === course.id).length, degree: 'bsc' as const, studyYear: 1 as const, department: course.id === 'informatics' ? 'D-INFK' : 'D-MATH', semester: 'autumn' as const })),
  ];
  return validateCatalog({ courses, lectures: [...lectures, ...demo.lectures.map(lecture => ({ ...lecture, thumbnail: '', demo: true }))] });
}

/** Library metadata only. Full transcripts are fetched for the selected lecture. */
export function lecturePreview(lecture: CatalogLecture): Lecture {
  return { ...lecture, segments: lecture.segments.map(({ cues: _cues, ...segment }) => ({ ...segment, transcript: '' })) };
}

export async function readSummary(id: string, root = projectRoot): Promise<LectureSummary | null> {
  if (!/^lec\d+$/.test(id)) return null;
  try { return JSON.parse(await readFile(resolve(root, `qa/data/summaries/${id}.json`), 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
