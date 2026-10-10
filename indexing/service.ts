import type { DatabaseSync } from 'node:sqlite';
import { copyFile, link, mkdir, readdir, rename, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AdminError } from '../admin/errors';
import type { AdminService } from '../admin/service';
import type { Submission, SubmissionService } from '../submissions/service';
import { RunnerError, type IndexRunner, type JobKind } from './runner';

export interface IndexingOptions {
  runner: IndexRunner;
  submissions: SubmissionService;
  /** Where published course material and the per-course indexes live (`<coursesDir>/<course id>/...`). */
  coursesDir: string;
  clock?: () => number;
  maxAttempts?: number;
  retryBaseSeconds?: number;
  pollMs?: number;
  enabled?: boolean;
  /**
   * Shared budget across all courses: at most this many paid (LLM) indexing runs, ever. Every attempt counts, retries included.
   * Undefined = no limit. When it is used up, lectures wait and only the free PDF extraction goes on.
   */
  maxPaidRuns?: number;
}
interface Job { id: string; courseId: string; type: 'lecture' | 'slides' | 'script'; number: number | null; indexAttempts: number }

const SLUG = /^[a-z0-9][a-z0-9-]{0,47}$/;
const VIDEO_EXTS = ['mp4', 'mov', 'webm', 'mkv'];
const TRANSCRIPT_EXTS = ['vtt', 'srt'];
const kindOf = (type: Job['type']): JobKind => type === 'lecture' ? 'lecture' : 'document';
/** Only lectures call the model; PDF extraction is local and free. */
const isPaid = (type: Job['type']) => kindOf(type) === 'lecture';

export function createIndexingService(db: DatabaseSync, admin: AdminService, options: IndexingOptions) {
  const clock = options.clock ?? Date.now;
  const now = () => Math.floor(clock() / 1000);
  const root = resolve(options.coursesDir);
  const maxAttempts = options.maxAttempts ?? 3;
  const retryBase = options.retryBaseSeconds ?? 60;
  let timer: ReturnType<typeof setInterval> | undefined;
  let busy = false;
  let enabled = options.enabled ?? true;

  /** Every operation on a course's index.json runs one at a time, so two writers can never interleave. */
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => { const run = chain.then(fn, fn); chain = run.catch(() => undefined); return run; };

  // ---- layout
  function courseDir(courseId: string) {
    if (!SLUG.test(courseId)) throw new RunnerError('Invalid course id.', false);
    return join(root, courseId);
  }
  const lecturesDir = (courseId: string) => join(courseDir(courseId), 'lectures');
  const indexPath = (courseId: string) => join(courseDir(courseId), 'qa', 'index.json');
  const documentPdf = (courseId: string, id: string) => join(courseDir(courseId), 'documents', `${id}.pdf`);
  const documentJson = (courseId: string, id: string) => join(courseDir(courseId), 'qa', 'documents', `${id}.json`);

  /** Hard link when possible (instant, no extra disk), else copy; always through a temporary name so a reader never sees half a file. */
  async function place(source: string, destination: string) {
    await mkdir(join(destination, '..'), { recursive: true, mode: 0o750 });
    const tmp = `${destination}.${process.pid}.tmp`;
    await rm(tmp, { force: true });
    try {
      try { await link(source, tmp); } catch { await copyFile(source, tmp); }
      await rename(tmp, destination);
    } finally {
      // rename() does nothing when both names already point at the same file (a re-index of unchanged material), and
      // leaves the temporary name behind; it must never survive.
      await rm(tmp, { force: true });
    }
  }
  async function dropFiles(dir: string, prefix: string, exts: string[], keep?: string) {
    for (const ext of exts) if (`${prefix}.${ext}` !== keep) await rm(join(dir, `${prefix}.${ext}`), { force: true });
  }

  async function publish(job: Job) {
    const files = options.submissions.internalFiles(job.id);
    if (!files.length) throw new RunnerError('The stored files of this submission are missing.', false);
    if (job.type === 'lecture') {
      const dir = lecturesDir(job.courseId), name = `lec${job.number}`;
      const transcript = files.find(f => f.slot === 'transcript');
      if (!transcript) throw new RunnerError('The submission has no transcript.', false);
      await place(transcript.path, join(dir, `${name}.${transcript.ext}`));
      await dropFiles(dir, name, TRANSCRIPT_EXTS, `${name}.${transcript.ext}`);
      const video = files.find(f => f.slot === 'video');
      if (video) { await place(video.path, join(dir, `${name}.${video.ext}`)); await dropFiles(dir, name, VIDEO_EXTS, `${name}.${video.ext}`); }
      else await dropFiles(dir, name, VIDEO_EXTS);
    } else {
      const pdf = files.find(f => f.slot === (job.type === 'slides' ? 'slides' : 'script'));
      if (!pdf) throw new RunnerError('The submission has no PDF.', false);
      await place(pdf.path, documentPdf(job.courseId, job.id));
    }
  }

  async function execute(job: Job) {
    await publish(job);
    if (job.type === 'lecture') await serial(() => options.runner.indexLecture({ number: job.number!, lecturesDir: lecturesDir(job.courseId), indexPath: indexPath(job.courseId) }));
    else await serial(() => options.runner.extractDocument({ pdfPath: documentPdf(job.courseId, job.id), outPath: documentJson(job.courseId, job.id) }));
  }

  // ---- budget
  const paidRunsUsed = () => Number((db.prepare('SELECT COUNT(*) AS n FROM indexing_runs').get() as { n: number }).n);
  function budget() {
    const used = paidRunsUsed(), limit = options.maxPaidRuns ?? null;
    return { used, limit, remaining: limit === null ? null : Math.max(0, limit - used) };
  }
  const budgetLeft = () => budget().remaining !== 0;
  const budgetReason = () => `The shared indexing budget is used up (${options.maxPaidRuns} paid runs). An administrator can raise INDEXING_MAX_PAID_RUNS.`;

  // ---- queue
  const dueJobs = () => db.prepare(`SELECT id, courseId, type, number, indexAttempts FROM submissions
    WHERE status='approved' AND indexState='queued' AND (indexNextAt IS NULL OR indexNextAt<=?) ORDER BY reviewedAt, id LIMIT 25`).all(now()) as unknown as Job[];
  function claim(job: Job): boolean {
    if (isPaid(job.type) && !budgetLeft()) return false;
    const claimed = Number(db.prepare("UPDATE submissions SET indexState='indexing', indexStartedAt=? WHERE id=? AND status='approved' AND indexState='queued'").run(now(), job.id).changes) === 1;
    // Counted before the run starts: a run that fails or is cut off may still have been billed.
    if (claimed && isPaid(job.type)) db.prepare('INSERT INTO indexing_runs (at, submissionId, courseId) VALUES (?,?,?)').run(now(), job.id, job.courseId);
    return claimed;
  }

  /** Runs at most one job. Resolves to whether it did something, so callers can keep draining the queue. */
  async function tick(): Promise<boolean> {
    if (!enabled || busy) return false;
    busy = true;
    try {
      let chosen: Job | undefined;
      for (const job of dueJobs()) {
        if (isPaid(job.type) && !budgetLeft()) continue; // waits, like a missing API key, until the budget is raised
        if ((await options.runner.readiness(kindOf(job.type))).ok) { chosen = job; break; }
      }
      if (!chosen || !claim(chosen)) return false;
      await finish(chosen);
      return true;
    } finally { busy = false; }
  }

  async function finish(job: Job) {
    let error: RunnerError | undefined;
    try { await execute(job); }
    catch (cause) { error = cause instanceof RunnerError ? cause : new RunnerError(cause instanceof Error ? cause.message.slice(0, 300) : 'Indexing failed.', true); }
    const current = db.prepare('SELECT status FROM submissions WHERE id=?').get(job.id) as { status: string } | undefined;
    if (!current || current.status !== 'approved') { await cleanup(job).catch(() => undefined); return; } // removed while it was running
    if (!error) {
      db.prepare("UPDATE submissions SET indexState='done', indexedAt=?, indexError=NULL, indexAttempts=?, indexNextAt=NULL WHERE id=?").run(now(), job.indexAttempts + 1, job.id);
      admin.audit('system', 'index.done', job.id, { course: job.courseId, type: job.type });
      return;
    }
    const attempts = job.indexAttempts + 1;
    if (error.retryable && attempts < maxAttempts) {
      db.prepare("UPDATE submissions SET indexState='queued', indexAttempts=?, indexError=?, indexNextAt=? WHERE id=?").run(attempts, error.message, now() + retryBase * 2 ** (attempts - 1), job.id);
    } else {
      db.prepare("UPDATE submissions SET indexState='failed', indexAttempts=?, indexError=?, indexNextAt=NULL WHERE id=?").run(attempts, error.message, job.id);
      admin.audit('system', 'index.failed', job.id, { course: job.courseId, type: job.type, error: error.message });
    }
  }

  /** Back to a clean state after a crash: whatever was running when the process died is simply queued again. */
  const recover = () => Number(db.prepare("UPDATE submissions SET indexState='queued' WHERE indexState='indexing'").run().changes);

  function start(pollMs = options.pollMs ?? 5000) {
    recover();
    if (timer) return;
    const drain = async () => { try { while (await tick()); } catch (error) { console.error('indexing: worker error', error instanceof Error ? error.message : error); } };
    timer = setInterval(() => void drain(), pollMs);
    timer.unref();
    void drain();
  }
  const stop = () => { if (timer) clearInterval(timer); timer = undefined; };
  const kick = () => { if (timer) setImmediate(() => void tick().catch(() => undefined)); };
  const setEnabled = (value: boolean) => { enabled = value; };

  // ---- removing material
  async function cleanup(job: Pick<Job, 'id' | 'courseId' | 'type' | 'number'>) {
    if (job.type === 'lecture' && job.number !== null) {
      await serial(() => options.runner.unindexLecture({ number: job.number!, indexPath: indexPath(job.courseId) }));
      const dir = lecturesDir(job.courseId);
      if (existsSync(dir)) await dropFiles(dir, `lec${job.number}`, [...TRANSCRIPT_EXTS, ...VIDEO_EXTS]);
    } else {
      await rm(documentPdf(job.courseId, job.id), { force: true });
      await rm(documentJson(job.courseId, job.id), { force: true });
    }
  }
  /** After an administrator removed approved material: it leaves the index and the course folder. */
  async function unpublish(submission: Submission) {
    await cleanup({ id: submission.id, courseId: submission.courseId, type: submission.type, number: submission.number });
  }

  // ---- reading and retrying
  function retry(actor: string, id: unknown): Submission {
    const row = typeof id === 'string' ? db.prepare('SELECT id, courseId, type, status, indexState FROM submissions WHERE id=?').get(id) as { id: string; courseId: string; type: Job['type']; status: string; indexState: string } | undefined : undefined;
    if (!row || row.status === 'draft' || !admin.canManage(actor, row.courseId)) throw new AdminError('not_found', 'There is no such submission.');
    if (row.status !== 'approved') throw new AdminError('conflict', 'Only approved material is indexed.');
    if (!['failed', 'done'].includes(row.indexState)) throw new AdminError('conflict', `Indexing is ${row.indexState}; nothing to retry.`);
    if (row.type === 'lecture' && !budgetLeft()) throw new AdminError('conflict', budgetReason());
    db.prepare("UPDATE submissions SET indexState='queued', indexAttempts=0, indexNextAt=NULL, indexError=NULL WHERE id=?").run(row.id);
    admin.audit(actor, 'index.retry', row.id, { course: row.courseId });
    kick();
    return options.submissions.get(actor, row.id) as Submission;
  }
  async function status(actor: string, courseId: unknown) {
    const course = admin.getCourse(actor, courseId);
    if (!admin.canManage(actor, course.id)) throw new AdminError('forbidden', 'Only administrators and this course\'s admins can see indexing.');
    const [ready, document] = await Promise.all([options.runner.readiness('lecture'), options.runner.readiness('document')]);
    const lecture: typeof ready = ready.ok && !budgetLeft() ? { ok: false, reason: budgetReason() } : ready;
    const rows = db.prepare(`SELECT id, type, title, number, submitter, indexState, indexAttempts, indexError, indexedAt FROM submissions WHERE courseId=? AND status='approved' ORDER BY COALESCE(number, 9999), title`).all(course.id) as unknown as
      { id: string; type: string; title: string; number: number | null; submitter: string; indexState: string; indexAttempts: number; indexError: string | null; indexedAt: number | null }[];
    const counts: Record<string, number> = { queued: 0, indexing: 0, done: 0, failed: 0 };
    for (const r of rows) counts[r.indexState] = (counts[r.indexState] ?? 0) + 1;
    return {
      workerEnabled: enabled, lectureIndexing: lecture, documentExtraction: document, budget: budget(), counts,
      items: rows.map(r => ({ ...r, indexedAt: r.indexedAt === null ? null : new Date(r.indexedAt * 1000).toISOString() })),
    };
  }
  /** Where a course's material ended up, for the future catalog: only what really exists. */
  async function courseFiles(courseId: string) {
    const dir = lecturesDir(courseId);
    return { indexPath: existsSync(indexPath(courseId)) ? indexPath(courseId) : null, lecturesDir: existsSync(dir) ? dir : null, lectures: existsSync(dir) ? (await readdir(dir)).sort() : [] };
  }

  return { start, stop, kick, tick, recover, retry, status, budget, unpublish, courseFiles, setEnabled, courseDir, indexPath, documentJson };
}
export type IndexingService = ReturnType<typeof createIndexingService>;
