import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** `retryable`: another attempt may succeed (network, rate limit, model hiccup). False for files that are simply unusable. */
export class RunnerError extends Error {
  constructor(message: string, readonly retryable: boolean) { super(message); this.name = 'RunnerError'; }
}
export type Readiness = { ok: true } | { ok: false; reason: string };
export type JobKind = 'lecture' | 'document';

export interface LectureJob { number: number; lecturesDir: string; indexPath: string }
export interface DocumentJob { pdfPath: string; outPath: string }
/** The only thing the worker knows about the Python tool; tests replace it with a fake. */
export interface IndexRunner {
  readiness(kind: JobKind): Promise<Readiness>;
  indexLecture(job: LectureJob): Promise<void>;
  unindexLecture(job: { number: number; indexPath: string }): Promise<void>;
  extractDocument(job: DocumentJob): Promise<{ pages: number }>;
}

export interface PythonRunnerConfig {
  python: string;
  /** Folder that contains the `viscon_qa` package. */
  qaDir: string;
  env: NodeJS.ProcessEnv;
  timeouts?: { lecture: number; document: number; unindex: number };
}

const DEFAULT_TIMEOUTS = { lecture: 20 * 60_000, document: 5 * 60_000, unindex: 60_000 };
/** Only these variables reach the Python process: no cookies, session secrets or SMTP passwords. */
const PASS_THROUGH = ['PATH', 'LANG', 'LC_ALL', 'TMPDIR', 'SYSTEMROOT', 'HOME', 'OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_ORG_ID', 'QA_INDEX_MODEL', 'QA_ANSWER_MODEL', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'SSL_CERT_FILE', 'REQUESTS_CA_BUNDLE'];

/** The environment for a Python child: only what it needs, plus job-specific values. Shared with the Q&A bridge. */
export function buildPythonEnv(source: NodeJS.ProcessEnv, extra: Record<string, string> = {}, passThrough: readonly string[] = PASS_THROUGH): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { PYTHONDONTWRITEBYTECODE: '1', PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' };
  for (const key of passThrough) if (source[key]) env[key] = source[key];
  return { ...env, ...extra };
}

export function pythonConfigFromEnv(root: string, env: NodeJS.ProcessEnv = process.env): PythonRunnerConfig {
  const local = join(root, '.venv/bin/python');
  return { python: env.QA_PYTHON || (existsSync(local) ? local : 'python3'), qaDir: join(root, 'qa'), env };
}

/** The last meaningful line of the tool's error output, with anything key-shaped removed, short enough to store and show. */
export function summarizeFailure(stderr: string): string {
  const lines = stderr.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const line = [...lines].reverse().find(l => /^Error:/.test(l)) ?? lines.at(-1) ?? 'The indexing tool failed without a message.';
  return line.replace(/\b(sk|rk|pk)-[A-Za-z0-9_-]{6,}/g, '[key]').replace(/Bearer\s+\S+/gi, 'Bearer [hidden]').replace(/https?:\/\/[^\s/]*:[^\s/@]*@/g, 'https://[hidden]@').slice(0, 300);
}

export function createPythonRunner(config: PythonRunnerConfig): IndexRunner {
  const timeouts = { ...DEFAULT_TIMEOUTS, ...config.timeouts };
  const baseEnv = () => buildPythonEnv(config.env);

  function run(args: string[], extraEnv: Record<string, string>, timeoutMs: number): Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }> {
    return new Promise((resolve, reject) => {
      let child;
      try { child = spawn(config.python, ['-m', 'viscon_qa', ...args], { cwd: config.qaDir, env: { ...baseEnv(), ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'], detached: true }); }
      catch (error) { return reject(new RunnerError(`Cannot start Python: ${(error as Error).message}`, false)); }
      let stdout = '', stderr = '', timedOut = false;
      const keep = (current: string, chunk: string) => (current + chunk).slice(-8000);
      child.stdout.setEncoding('utf8').on('data', c => { stdout = keep(stdout, c); });
      child.stderr.setEncoding('utf8').on('data', c => { stderr = keep(stderr, c); });
      // The tool runs in its own process group so a timeout stops anything it started too, not just the parent process.
      const stop = (signal: NodeJS.Signals) => { try { process.kill(-child.pid!, signal); } catch { try { child.kill(signal); } catch { /* already gone */ } } };
      const timer = setTimeout(() => { timedOut = true; stop('SIGTERM'); setTimeout(() => stop('SIGKILL'), 5000).unref(); }, timeoutMs);
      child.on('error', error => { clearTimeout(timer); reject(new RunnerError(`Cannot start Python (${config.python}): ${(error as NodeJS.ErrnoException).code ?? error.message}`, false)); });
      child.on('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr, timedOut }); });
    });
  }
  const failure = (result: { stderr: string; timedOut: boolean }, retryable: boolean) =>
    new RunnerError(result.timedOut ? 'The indexing tool took too long and was stopped.' : summarizeFailure(result.stderr), retryable || result.timedOut);

  const cache = new Map<JobKind, { at: number; value: Readiness }>();
  async function readiness(kind: JobKind): Promise<Readiness> {
    const hit = cache.get(kind);
    if (hit && Date.now() - hit.at < 60_000) return hit.value;
    let value: Readiness;
    if (kind === 'lecture' && !config.env.OPENAI_API_KEY) value = { ok: false, reason: 'OPENAI_API_KEY is not set.' };
    else if (kind === 'lecture' && !config.env.QA_INDEX_MODEL) value = { ok: false, reason: 'QA_INDEX_MODEL is not set.' };
    else {
      const probe = kind === 'lecture' ? 'import openai, pydantic, viscon_qa' : 'import pypdf, viscon_qa';
      value = await new Promise<Readiness>(resolve => {
        let child;
        try { child = spawn(config.python, ['-c', probe], { cwd: config.qaDir, env: baseEnv(), stdio: 'ignore' }); } catch { return resolve({ ok: false, reason: 'Python is not available.' }); }
        const timer = setTimeout(() => { child.kill(); resolve({ ok: false, reason: 'Python did not answer in time.' }); }, 15_000);
        child.on('error', () => { clearTimeout(timer); resolve({ ok: false, reason: `Python (${config.python}) is not installed.` }); });
        child.on('close', code => { clearTimeout(timer); resolve(code === 0 ? { ok: true } : { ok: false, reason: 'The Python packages for indexing are not installed (see qa/requirements.txt).' }); });
      });
    }
    cache.set(kind, { at: Date.now(), value });
    return value;
  }

  return {
    readiness,
    async indexLecture(job) {
      const result = await run(['index', '--lectures', String(job.number), '--force'], { QA_LECTURES_DIR: job.lecturesDir, QA_INDEX_PATH: job.indexPath }, timeouts.lecture);
      if (result.code !== 0) throw failure(result, true);
      // The tool exited cleanly: still check that it really produced chapters for this lecture.
      let chapters = 0;
      try { chapters = (JSON.parse(readFileSync(job.indexPath, 'utf8')).lectures?.[String(job.number)]?.chapters ?? []).length; } catch { /* handled below */ }
      if (chapters < 1) throw new RunnerError('Indexing finished but produced no chapters.', true);
    },
    async unindexLecture(job) {
      if (!existsSync(job.indexPath)) return;
      const result = await run(['unindex', String(job.number)], { QA_INDEX_PATH: job.indexPath }, timeouts.unindex);
      if (result.code !== 0) throw failure(result, true);
    },
    async extractDocument(job) {
      const result = await run(['extract', job.pdfPath, job.outPath], { QA_INDEX_PATH: join(job.outPath, '..', '..', 'index.json') }, timeouts.document);
      if (result.code !== 0) throw failure(result, /Traceback/.test(result.stderr)); // a clean "Error:" means this PDF will never work
      let pages = 0;
      try { pages = JSON.parse(readFileSync(job.outPath, 'utf8')).pages_with_text ?? 0; } catch { /* handled below */ }
      if (pages < 1) throw new RunnerError('No text could be extracted.', false);
      return { pages };
    },
  };
}
