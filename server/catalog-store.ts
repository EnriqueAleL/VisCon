import type { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createAnswerService } from '../video-pull-up/src/answers.mjs';
import { activeCourses, catalogFingerprint, courseKey, lecturesDir, loadPublishedCourse, mergeCatalog, qaDir, type PublishedCourse } from './course-catalog';
import { lecturePreview, type CatalogLecture, type LectureCatalog } from './lecture-catalog';
import { join } from 'node:path';

export type Ask = ReturnType<typeof createAnswerService>;
/** How to point the Python Q&A tool at one course: extra environment variables for the child process. */
export interface QAWorkspace { env: Record<string, string> }
export interface ListEntry { body: Buffer; gzip: Buffer; etag: string }

export interface Snapshot {
  catalog: LectureCatalog;
  ask: Ask;
  version: string;
  skipped: string[];
  /** The lecture list as sent to the browser: the same shape as always, serialised and compressed once per version. */
  list(courseId: string | null): ListEntry;
  workspace(courseId: string): QAWorkspace | null;
  summaryFile(lecture: CatalogLecture): string | null;
}
export interface CatalogStoreOptions {
  /** The original DDCA catalogue (plus the demo courses). Loaded once; never rebuilt. */
  legacy: LectureCatalog;
  db: DatabaseSync;
  coursesDir: string;
  provider: string;
  explain?: unknown;
  clock?: () => number;
  retryAfterMs?: number;
}

const ORIGINAL_COURSE = 'computer-architecture';

/**
 * The catalogue the app serves: the original course plus every published course. It notices changes by itself
 * (approvals, removals, finished indexing, renamed or archived courses): each request compares a cheap fingerprint and
 * rebuilds only when it changed, only the affected course, never twice at once. If a rebuild ever fails, the last good
 * catalogue keeps being served.
 */
export function createCatalogStore(options: CatalogStoreOptions) {
  const clock = options.clock ?? Date.now;
  const retryAfter = options.retryAfterMs ?? 30_000;
  let current: Snapshot | undefined;
  let version = '';
  let building: Promise<Snapshot> | null = null;
  let failed: { version: string; at: number } | null = null;
  const perCourse = new Map<string, { key: string; data: PublishedCourse }>();

  function snapshotOf(catalog: LectureCatalog, skipped: string[], fingerprint: string): Snapshot {
    const lists = new Map<string, ListEntry>();
    const ask = createAnswerService(catalog, { explain: options.explain ?? null } as never);
    const publishedIds = new Set(catalog.courses.map(c => c.id));
    return {
      catalog, ask, version: fingerprint, skipped,
      list(courseId) {
        const key = courseId ?? '*';
        let entry = lists.get(key);
        if (!entry) {
          const lectures = catalog.lectures.filter(item => !courseId || item.courseId === courseId).map(lecturePreview);
          const body = Buffer.from(JSON.stringify({ lectures, provider: options.provider }));
          entry = { body, gzip: gzipSync(body, { level: 6 }), etag: `W/"${fingerprint.slice(0, 16)}-${key}-${body.length}"` };
          lists.set(key, entry);
        }
        return entry;
      },
      workspace(courseId): QAWorkspace | null {
        if (!publishedIds.has(courseId)) return null;
        const hasIndex = existsSync(join(qaDir(options.coursesDir, courseId), 'index.json'));
        const lectures = lecturesDir(options.coursesDir, courseId), index = join(qaDir(options.coursesDir, courseId), 'index.json');
        if (courseId === ORIGINAL_COURSE) { const env: Record<string, string> = hasIndex ? { QA_EXTRA_INDEX_PATH: index, QA_EXTRA_LECTURES_DIR: lectures } : {}; return { env }; }
        if (!hasIndex || !catalog.lectures.some(item => item.courseId === courseId)) return null;
        return { env: { QA_LECTURES_DIR: lectures, QA_INDEX_PATH: index } };
      },
      summaryFile(lecture) {
        if (/^lec\d+$/.test(lecture.id)) return null; // the original recordings keep their own summaries folder
        const file = join(qaDir(options.coursesDir, lecture.courseId), 'summaries', `lec${lecture.episode}.json`);
        return existsSync(file) ? file : null;
      },
    };
  }

  async function rebuild(fingerprint: string): Promise<Snapshot> {
    const rows = activeCourses(options.db);
    const published: PublishedCourse[] = [];
    for (const row of rows) {
      const key = await courseKey(options.db, options.coursesDir, row);
      let entry = perCourse.get(row.id);
      if (!entry || entry.key !== key) {
        try { entry = { key, data: await loadPublishedCourse(options.db, options.coursesDir, row) }; perCourse.set(row.id, entry); }
        catch (error) {
          // One damaged course (say a corrupt index file) must not freeze the others: keep what we had for it, or leave it out.
          console.error(`catalog: could not load course ${row.id}:`, error instanceof Error ? error.message : error);
          if (!entry) continue;
        }
      }
      published.push(entry.data);
    }
    for (const id of [...perCourse.keys()]) if (!rows.some(row => row.id === id)) perCourse.delete(id);
    const skipped = published.flatMap(item => item.skipped);
    for (const line of skipped) console.warn(`catalog: skipped ${line}`);
    return snapshotOf(mergeCatalog(options.legacy, published), skipped, fingerprint);
  }

  /** The current catalogue, rebuilt first if anything it depends on has changed. */
  async function snapshot(): Promise<Snapshot> {
    const fingerprint = catalogFingerprint(options.db);
    if (current && fingerprint === version) return current;
    if (building) return building;
    if (current && failed && failed.version === fingerprint && clock() - failed.at < retryAfter) return current;
    building = rebuild(fingerprint).then(next => { current = next; version = fingerprint; failed = null; return next; })
      .catch(error => {
        console.error('catalog: rebuild failed, keeping the previous catalogue:', error instanceof Error ? error.message : error);
        failed = { version: fingerprint, at: clock() };
        if (!current) throw error;
        return current;
      }).finally(() => { building = null; });
    return building;
  }

  return { snapshot };
}
export type CatalogStore = ReturnType<typeof createCatalogStore>;
