import type { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AdminError } from '../admin/errors';
import type { AdminService } from '../admin/service';
import { ALL_SLOTS, SLOTS, safeName, uploadLimits, type Slot, type StoredUpload, type SubmissionType, type UploadLimits } from './files';

export type SubmissionStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'removed';
export interface SubmissionFile { slot: Slot; size: number; sha256: string; originalName: string; mime: string }
export interface Submission {
  id: string; courseId: string; type: SubmissionType; title: string; number: number | null; notes: string; status: SubmissionStatus;
  submitter: string; createdAt: string; submittedAt: string | null; reviewedBy: string | null; reviewedAt: string | null; reviewNote: string | null;
  indexState: 'none' | 'queued' | 'indexing' | 'done' | 'failed'; indexError: string | null; indexedAt: string | null; files: SubmissionFile[]; missing: Slot[];
}
export interface SubmissionOptions {
  uploadsDir: string; limits?: UploadLimits; clock?: () => number;
  /** Lecture numbers that already exist outside the submission system (the original DDCA recordings). */
  isNumberReserved?: (courseId: string, number: number) => boolean;
  /** Called after material was approved (queue it for indexing) or removed (take it out of the index again). */
  onApproved?: (submission: Submission) => void;
  onRemoved?: (submission: Submission) => void | Promise<void>;
}

interface Row {
  id: string; courseId: string; submitter: string; type: SubmissionType; title: string; number: number | null; notes: string; status: SubmissionStatus;
  createdAt: number; submittedAt: number | null; reviewedBy: string | null; reviewedAt: number | null; reviewNote: string | null; indexState: Submission['indexState']; indexError: string | null; indexedAt: number | null;
}
interface FileRow { slot: Slot; size: number; sha256: string; originalName: string; mime: string; ext: string }

const iso = (seconds: number | null) => seconds === null ? null : new Date(seconds * 1000).toISOString();
const LIVE = "('draft','pending','approved')";

export function createSubmissionService(db: DatabaseSync, admin: AdminService, options: SubmissionOptions) {
  const limits = options.limits ?? uploadLimits();
  const clock = options.clock ?? Date.now;
  const now = () => Math.floor(clock() / 1000);
  const root = resolve(options.uploadsDir);
  const dirFor = (id: string) => join(root, id);
  const bad = (message: string) => new AdminError('invalid_input', message);

  const row = (id: unknown) => typeof id === 'string' ? db.prepare('SELECT * FROM submissions WHERE id=?').get(id) as unknown as Row | undefined : undefined;
  const filesOf = (id: string) => db.prepare('SELECT slot,size,sha256,originalName,mime,ext FROM submission_files WHERE submissionId=? ORDER BY slot').all(id) as unknown as FileRow[];
  function present(r: Row, files = filesOf(r.id)): Submission {
    const spec = SLOTS[r.type];
    return {
      id: r.id, courseId: r.courseId, type: r.type, title: r.title, number: r.number, notes: r.notes, status: r.status, submitter: r.submitter,
      createdAt: iso(r.createdAt)!, submittedAt: iso(r.submittedAt), reviewedBy: r.reviewedBy, reviewedAt: iso(r.reviewedAt), reviewNote: r.reviewNote, indexState: r.indexState, indexError: r.indexError, indexedAt: iso(r.indexedAt),
      files: files.map(({ slot, size, sha256, originalName, mime }) => ({ slot, size, sha256, originalName, mime })),
      missing: spec.required.filter(slot => !files.some(f => f.slot === slot)),
    };
  }
  /** Lists load every file in one query instead of one per submission. */
  function presentAll(rows: Row[]): Submission[] {
    const bySubmission = new Map<string, FileRow[]>(rows.map(r => [r.id, []]));
    if (rows.length) {
      const all = db.prepare('SELECT submissionId,slot,size,sha256,originalName,mime,ext FROM submission_files WHERE submissionId IN (SELECT value FROM json_each(?)) ORDER BY slot')
        .all(JSON.stringify(rows.map(r => r.id))) as unknown as (FileRow & { submissionId: string })[];
      for (const { submissionId, ...file } of all) bySubmission.get(submissionId)?.push(file);
    }
    return rows.map(r => present(r, bySubmission.get(r.id)));
  }
  const isReviewer = (actor: string, r: Row) => admin.canManage(actor, r.courseId);
  /** Submitters see their own (drafts included); reviewers see everything except other people's drafts. */
  function visible(actor: string, id: unknown): Row {
    const r = row(id);
    if (!r || !(r.submitter === actor || (r.status !== 'draft' && isReviewer(actor, r)))) throw new AdminError('not_found', 'There is no such submission.');
    return r;
  }
  function owned(actor: string, id: unknown): Row {
    const r = row(id);
    if (!r || r.submitter !== actor) throw new AdminError('not_found', 'There is no such submission.');
    return r;
  }

  function cleanText(input: unknown, label: string, min: number, max: number) {
    const text = typeof input === 'string' ? input.trim().replace(/[ \t]+/g, ' ') : '';
    if (text.length < min || text.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f<>]/.test(text)) throw bad(`${label} must be ${min}-${max} characters of plain text.`);
    return text;
  }

  // ---- creating and uploading
  function create(actor: string, courseId: unknown, input: { type?: unknown; title?: unknown; number?: unknown; notes?: unknown }): Submission {
    const course = admin.getCourse(actor, courseId);
    if (course.status !== 'active') throw new AdminError('conflict', 'Material can only be submitted to active courses.');
    const type = input.type;
    if (type !== 'lecture' && type !== 'slides' && type !== 'script') throw bad('The type must be lecture, slides or script.');
    const title = cleanText(input.title, 'The title', 3, 120);
    const notes = input.notes === undefined || input.notes === null || input.notes === '' ? '' : cleanText(input.notes, 'The note', 1, 1000);
    let number: number | null = null;
    if (input.number !== undefined && input.number !== null && input.number !== '') {
      if (type === 'script') throw bad('A script has no lecture number.');
      number = Number(input.number);
      if (!Number.isInteger(number) || number < 1 || number > 999) throw bad('The lecture number must be a whole number from 1 to 999.');
    } else if (type === 'lecture') throw bad('A lecture needs its lecture number.');

    const open = (db.prepare("SELECT COUNT(*) AS n FROM submissions WHERE submitter=? AND status IN ('draft','pending')").get(actor) as { n: number }).n;
    if (open >= limits.pendingPerUser) throw new AdminError('rate_limited', `You already have ${open} submissions in progress. Wait for a review or withdraw one.`);
    const lastHour = (db.prepare('SELECT COUNT(*) AS n FROM submissions WHERE submitter=? AND createdAt>?').get(actor, now() - 3600) as { n: number }).n;
    if (lastHour >= 20) throw new AdminError('rate_limited', 'You are creating submissions too quickly.', 3600);

    const id = randomUUID();
    db.prepare("INSERT INTO submissions (id,courseId,submitter,type,title,number,notes,status,createdAt) VALUES (?,?,?,?,?,?,?,'draft',?)").run(id, course.id, actor, type, title, number, notes, now());
    return present(row(id)!);
  }

  /** Checks everything that can be checked before a single byte is accepted. */
  function prepareUpload(actor: string, id: unknown, slot: unknown, declaredLength: number) {
    const r = owned(actor, id);
    if (r.status !== 'draft') throw new AdminError('conflict', 'Files can only be added while the submission is a draft.');
    const spec = SLOTS[r.type];
    if (typeof slot !== 'string' || ![...spec.required, ...spec.optional].includes(slot as Slot)) throw bad(`A ${r.type} takes: ${[...spec.required, ...spec.optional].join(', ')}.`);
    const max = limits[slot as Slot];
    if (declaredLength > max) throw new AdminError('too_large', `The file is larger than the limit of ${Math.floor(max / 1048576)} MB.`);
    const usedToday = (db.prepare('SELECT COALESCE(SUM(f.size),0) AS n FROM submission_files f JOIN submissions s ON s.id=f.submissionId WHERE s.submitter=? AND f.createdAt>?').get(actor, now() - 86_400) as { n: number }).n;
    if (usedToday + declaredLength > limits.userPerDay) throw new AdminError('rate_limited', 'You reached today\'s upload limit. Try again tomorrow.', 3600);
    const total = (db.prepare(`SELECT COALESCE(SUM(f.size),0) AS n FROM submission_files f JOIN submissions s ON s.id=f.submissionId WHERE s.status IN ${LIVE}`).get() as { n: number }).n;
    if (total + declaredLength > limits.total) throw new AdminError('rate_limited', 'The platform is out of upload space right now. Tell an administrator.', 3600);
    return { submission: r, slot: slot as Slot, max, dir: dirFor(r.id), tmpPath: join(dirFor(r.id), `.${slot}.${randomBytes(6).toString('hex')}.part`) };
  }
  /** Drafts with an upload streaming in right now; purgeStaleDrafts leaves them alone. */
  const uploading = new Map<string, number>();
  /** Marks an upload as running until the returned function is called (always call it, in a finally). */
  function holdDraft(id: string) {
    uploading.set(id, (uploading.get(id) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const left = (uploading.get(id) ?? 1) - 1;
      if (left > 0) uploading.set(id, left); else uploading.delete(id);
    };
  }
  async function ensureDir(id: string) { await mkdir(dirFor(id), { recursive: true, mode: 0o750 }); }

  /** Called after the bytes were streamed and verified: moves the file into place and records it. */
  async function commitFile(actor: string, id: string, slot: Slot, stored: StoredUpload, originalName: unknown, tmpPath: string): Promise<Submission> {
    try {
      const r = owned(actor, id);
      if (r.status !== 'draft') throw new AdminError('conflict', 'Files can only be added while the submission is a draft.');
      if (slot === 'transcript') {
        const cues = ((await readFile(tmpPath, 'utf8')).match(/-->/g) ?? []).length;
        if (cues < 3) throw bad('The transcript has no usable timestamps (expected lines like 00:01:02.000 --> 00:01:05.000).');
      }
      const previous = filesOf(id).find(f => f.slot === slot);
      const finalPath = join(dirFor(id), `${slot}.${stored.sniffed.ext}`);
      await rename(tmpPath, finalPath);
      if (previous && previous.ext !== stored.sniffed.ext) await rm(join(dirFor(id), `${slot}.${previous.ext}`), { force: true });
      db.prepare('INSERT OR REPLACE INTO submission_files (submissionId,slot,size,sha256,originalName,mime,ext,createdAt) VALUES (?,?,?,?,?,?,?,?)')
        .run(id, slot, stored.size, stored.sha256, safeName(originalName, `${slot}.${stored.sniffed.ext}`), stored.sniffed.mime, stored.sniffed.ext, now());
      return present(row(id)!);
    } catch (error) { await rm(tmpPath, { force: true }); throw error; }
  }

  async function removeFiles(id: string) { await rm(dirFor(id), { recursive: true, force: true }); }

  /** Draft -> pending: complete, not a duplicate, and its lecture number is still free. */
  function submit(actor: string, id: unknown): Submission {
    const r = owned(actor, id);
    if (r.status !== 'draft') throw new AdminError('conflict', 'This submission was already sent.');
    const sub = present(r);
    if (sub.missing.length) throw bad(`Still missing: ${sub.missing.join(', ')}.`);
    const course = admin.getCourse(actor, r.courseId);
    if (course.status !== 'active') throw new AdminError('conflict', 'This course is not accepting material right now.');
    for (const file of sub.files) {
      const dup = db.prepare(`SELECT s.id FROM submission_files f JOIN submissions s ON s.id=f.submissionId
        WHERE s.courseId=? AND s.id<>? AND f.sha256=? AND f.slot=? AND s.status IN ('pending','approved') LIMIT 1`).get(r.courseId, r.id, file.sha256, file.slot);
      if (dup) throw new AdminError('conflict', `This ${file.slot} file was already submitted for this course.`);
    }
    assertNumberFree(r);
    db.prepare("UPDATE submissions SET status='pending', submittedAt=? WHERE id=?").run(now(), r.id);
    return present(row(r.id)!);
  }
  function assertNumberFree(r: Row) {
    if (r.type !== 'lecture') return;
    if (r.number !== null && options.isNumberReserved?.(r.courseId, r.number)) throw new AdminError('conflict', `Lecture ${r.number} already exists among the original recordings of this course.`);
    const taken = db.prepare("SELECT 1 FROM submissions WHERE courseId=? AND type='lecture' AND number=? AND status='approved' AND id<>?").get(r.courseId, r.number, r.id);
    if (taken) throw new AdminError('conflict', `Lecture ${r.number} already exists in this course. An administrator has to remove it before it can be replaced.`);
  }

  async function withdraw(actor: string, id: unknown): Promise<Submission> {
    const r = owned(actor, id);
    if (!['draft', 'pending'].includes(r.status)) throw new AdminError('conflict', 'Only drafts and submissions waiting for review can be withdrawn.');
    db.prepare("UPDATE submissions SET status='withdrawn' WHERE id=?").run(r.id);
    await removeFiles(r.id);
    return present(row(r.id)!);
  }

  // ---- review
  function reviewable(actor: string, id: unknown): Row {
    const r = row(id);
    if (!r || r.status === 'draft' || !isReviewer(actor, r)) throw new AdminError('not_found', 'There is no such submission.');
    if (r.status !== 'pending') throw new AdminError('conflict', `This submission is ${r.status}, not waiting for review.`);
    if (r.submitter === actor && !admin.isAdmin(actor)) throw new AdminError('forbidden', 'You cannot review your own submission. Another course admin or an administrator has to.');
    return r;
  }
  /** Approving makes the material part of the course and queues it for indexing (the indexer itself comes later). */
  function approve(actor: string, id: unknown, note?: unknown): Submission {
    const r = reviewable(actor, id);
    if (admin.getCourse(actor, r.courseId).status !== 'active') throw new AdminError('conflict', 'This course is not active.');
    assertNumberFree(r);
    const text = note === undefined || note === null || note === '' ? null : cleanText(note, 'The note', 1, 500);
    db.prepare("UPDATE submissions SET status='approved', reviewedBy=?, reviewedAt=?, reviewNote=?, indexState='queued' WHERE id=?").run(actor, now(), text, r.id);
    admin.audit(actor, 'submission.approve', r.id, { course: r.courseId, type: r.type, submitter: r.submitter });
    const approved = present(row(r.id)!);
    options.onApproved?.(approved);
    return approved;
  }
  async function reject(actor: string, id: unknown, note: unknown): Promise<Submission> {
    const r = reviewable(actor, id);
    const text = cleanText(note, 'The reason', 3, 500);
    db.prepare("UPDATE submissions SET status='rejected', reviewedBy=?, reviewedAt=?, reviewNote=? WHERE id=?").run(actor, now(), text, r.id);
    await removeFiles(r.id);
    admin.audit(actor, 'submission.reject', r.id, { course: r.courseId, type: r.type, submitter: r.submitter });
    return present(row(r.id)!);
  }
  /** Administrators can take approved material down again (takedown requests, mistakes). */
  async function remove(actor: string, id: unknown, reason: unknown): Promise<Submission> {
    if (!admin.isAdmin(actor)) throw new AdminError('forbidden', 'Only administrators can remove approved material.');
    const r = row(id);
    if (!r || r.status !== 'approved') throw new AdminError('not_found', 'There is no approved submission with that id.');
    const text = cleanText(reason, 'The reason', 3, 500);
    db.prepare("UPDATE submissions SET status='removed', reviewNote=?, reviewedBy=?, reviewedAt=?, indexState='none' WHERE id=?").run(text, actor, now(), r.id);
    await removeFiles(r.id);
    admin.audit(actor, 'submission.remove', r.id, { course: r.courseId, type: r.type, submitter: r.submitter, reason: text });
    const removed = present(row(r.id)!);
    try { await options.onRemoved?.(removed); } catch (error) { console.error('submissions: cleanup after removal failed', error instanceof Error ? error.message : error); }
    return removed;
  }

  // ---- reading
  const get = (actor: string, id: unknown) => present(visible(actor, id));
  const listMine = (actor: string) => presentAll(db.prepare('SELECT * FROM submissions WHERE submitter=? ORDER BY createdAt DESC LIMIT 200').all(actor) as unknown as Row[]);
  function listForCourse(actor: string, courseId: unknown, status?: unknown): Submission[] {
    const course = admin.getCourse(actor, courseId);
    if (!admin.canManage(actor, course.id)) throw new AdminError('forbidden', 'Only administrators and this course\'s admins can see its submissions.');
    const wanted = typeof status === 'string' ? status : 'pending';
    if (!['pending', 'approved', 'rejected', 'withdrawn', 'removed'].includes(wanted)) throw bad('Unknown status.');
    return presentAll(db.prepare('SELECT * FROM submissions WHERE courseId=? AND status=? ORDER BY COALESCE(submittedAt,createdAt) DESC LIMIT 500').all(course.id, wanted) as unknown as Row[]);
  }
  /** For the download route: only while the file still exists, and only for people who may see the submission. */
  function fileForDownload(actor: string, id: unknown, slot: unknown) {
    const r = visible(actor, id);
    if (!['draft', 'pending', 'approved'].includes(r.status)) throw new AdminError('not_found', 'This file is no longer available.');
    const file = typeof slot === 'string' ? filesOf(r.id).find(f => f.slot === slot) : undefined;
    const path = file && join(dirFor(r.id), `${file.slot}.${file.ext}`);
    if (!file || !path || !existsSync(path)) throw new AdminError('not_found', 'There is no such file.');
    return { path, mime: file.mime, filename: safeName(file.originalName, `${file.slot}.${file.ext}`), size: file.size };
  }

  /**
   * Drafts nobody touched for a day are deleted with their files. "Touched" is the creation or the last finished upload,
   * and a draft with an upload in progress is never deleted. Safe to call often.
   */
  function purgeStaleDrafts(maxAgeSeconds = 86_400): number {
    const stale = (db.prepare(`SELECT s.id FROM submissions s WHERE s.status='draft'
      AND MAX(s.createdAt, COALESCE((SELECT MAX(f.createdAt) FROM submission_files f WHERE f.submissionId=s.id), 0))<?`).all(now() - maxAgeSeconds) as { id: string }[])
      .filter(({ id }) => !uploading.has(id));
    for (const { id } of stale) {
      rmSync(dirFor(id), { recursive: true, force: true });
      db.prepare('DELETE FROM submission_files WHERE submissionId=?').run(id);
      db.prepare('DELETE FROM submissions WHERE id=?').run(id);
    }
    return stale.length;
  }

  /** Server-side only (the indexer): where a submission's stored files are, without any user permission check. */
  function internalFiles(id: string): { slot: Slot; path: string; ext: string; size: number }[] {
    return filesOf(id).map(f => ({ slot: f.slot, ext: f.ext, size: f.size, path: join(dirFor(id), `${f.slot}.${f.ext}`) })).filter(f => existsSync(f.path));
  }

  return { internalFiles, create, prepareUpload, holdDraft, ensureDir, commitFile, submit, withdraw, approve, reject, remove, get, listMine, listForCourse, fileForDownload, purgeStaleDrafts, limits, slots: ALL_SLOTS };
}
export type SubmissionService = ReturnType<typeof createSubmissionService>;
