import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createAdminService } from '../admin/service';
import { initSubmissionSchema } from '../submissions/schema';

/** A tiny, valid transcript: `cues` lines of 20 s each, every line containing `word`. */
export function vtt(cues: number, word = 'pipelining'): string {
  const t = (s: number) => `00:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.000`;
  return 'WEBVTT\n\n' + Array.from({ length: cues }, (_, i) => `${t(i * 20)} --> ${t(i * 20 + 18)}\nSentence ${i} about ${word} and caches.\n`).join('\n');
}
export function srt(cues: number, word = 'pipelining'): string {
  const t = (s: number) => `00:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')},000`;
  return Array.from({ length: cues }, (_, i) => `${i + 1}\n${t(i * 20)} --> ${t(i * 20 + 18)}\nSentence ${i} about ${word}.\n`).join('\n');
}

export interface Fixture {
  db: DatabaseSync; coursesDir: string; time: { now: number };
  admin: ReturnType<typeof createAdminService>;
  /** Registers an approved, indexed lecture and writes the files the indexer would have published. */
  lecture(course: string, number: number, options?: { title?: string; transcript?: string; ext?: 'vtt' | 'srt'; video?: boolean; chapters?: boolean; index?: boolean; status?: string; indexState?: string; type?: string; duration?: number }): void;
}

export function fixture(existing?: DatabaseSync): Fixture {
  const db = existing ?? new DatabaseSync(':memory:');
  initSubmissionSchema(db);
  const time = { now: 1_800_000_000_000 };
  for (const name of ['riordache', 'ben']) db.prepare("INSERT OR IGNORE INTO accounts (username,playerId,passwordHash,createdAt,verifiedAt) VALUES (?,?,'x',1,1)").run(name, `p-${name}`);
  const admin = createAdminService(db, { rootAdmins: new Set(['riordache']), clock: () => time.now });
  for (const name of ['Physics', 'Linear Algebra: Vectors, Matrices and Eigenvalues']) { try { admin.createCourse('riordache', { name }); } catch { /* already there */ } }
  const coursesDir = mkdtempSync(join(tmpdir(), 'catalog-'));
  let counter = 0;
  const lecture: Fixture['lecture'] = (course, number, o = {}) => {
    counter++;
    db.prepare("INSERT INTO submissions (id,courseId,submitter,type,title,number,status,createdAt,reviewedAt,indexState,indexedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .run(`s${counter}`, course, 'ben', o.type ?? 'lecture', o.title ?? `Lecture ${number}`, number, o.status ?? 'approved', 1, 2, o.indexState ?? 'done', time.now / 1000 + counter);
    const dir = join(coursesDir, course), ext = o.ext ?? 'vtt';
    mkdirSync(join(dir, 'lectures'), { recursive: true });
    mkdirSync(join(dir, 'qa', 'chapters'), { recursive: true });
    writeFileSync(join(dir, 'lectures', `lec${number}.${ext}`), o.transcript ?? (ext === 'srt' ? srt(10) : vtt(10)));
    if (o.video !== false) writeFileSync(join(dir, 'lectures', `lec${number}.mp4`), Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypisom'), Buffer.alloc(5000, 7)]));
    if (o.chapters !== false) writeFileSync(join(dir, 'qa', 'chapters', `lec${number}.chapters.vtt`), 'WEBVTT\n\n00:00:00.000 --> 00:03:00.000\nIntroduction\n');
    if (o.index !== false) {
      const file = join(dir, 'qa', 'index.json');
      let index: { version: number; lectures: Record<string, unknown> } = { version: 1, lectures: {} };
      try { index = JSON.parse(readFileSync(file, 'utf8')); } catch { /* first lecture of this course */ }
      index.lectures[String(number)] = { lecture: number, title: `Lecture ${number}`, duration: o.duration ?? 200, chapters: [
        { id: `${number}.1`, title: 'Introduction', summary: 'What it is about.', key_terms: ['overview', 'pipelining'], start_line: 0, end_line: 2, start: 0, end: 100 },
        { id: `${number}.2`, title: 'The main idea', summary: 'The core explanation.', key_terms: ['hazard'], start_line: 3, end_line: 9, start: 100, end: 200 },
      ] };
      writeFileSync(file, JSON.stringify(index));
    }
  };
  return { db, coursesDir, time, admin, lecture };
}
