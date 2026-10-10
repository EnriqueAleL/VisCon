import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPythonRunner, summarizeFailure, RunnerError } from './runner';

const script = (dir: string, body: string) => { const path = join(dir, 'fakepython'); writeFileSync(path, `#!/bin/sh\n${body}\n`); chmodSync(path, 0o755); return path; };
const job = (dir: string) => ({ pdfPath: join(dir, 'in.pdf'), outPath: join(dir, 'out', 'doc.json') });

test('failure messages are short, readable and never contain keys or credentials', () => {
  assert.equal(summarizeFailure('noise\nError: The PDF has no pages.\n'), 'Error: The PDF has no pages.');
  assert.equal(summarizeFailure('Traceback (most recent call last):\n  File "x"\nopenai.AuthenticationError: Incorrect API key provided: sk-proj-ABCDEF123456.'), 'openai.AuthenticationError: Incorrect API key provided: [key].');
  assert.equal(summarizeFailure('failed: Authorization: Bearer abc.def-ghi'), 'failed: Authorization: Bearer [hidden]');
  assert.equal(summarizeFailure('cannot reach https://user:hunter2@proxy.example:8080/x'), 'cannot reach https://[hidden]@proxy.example:8080/x');
  assert.equal(summarizeFailure('x'.repeat(1000)).length, 300);
  assert.match(summarizeFailure(''), /without a message/);
});

test('the Python process only receives what it needs, never the app\'s secrets', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'runner-'));
  try {
    const dump = join(dir, 'env.txt');
    const python = script(dir, `env > ${dump}\necho "Error: stop here" >&2\nexit 1`);
    const runner = createPythonRunner({ python, qaDir: dir, env: { PATH: process.env.PATH, OPENAI_API_KEY: 'sk-test-123456', QA_INDEX_MODEL: 'm', AUTH_SMTP_PASSWORD: 'smtp-secret', SESSION_SECRET: 'cookie-secret', COOKIE_SECURE: 'true', DATABASE_PATH: '/x.sqlite' } });
    await assert.rejects(runner.extractDocument(job(dir)), (e: RunnerError) => e instanceof RunnerError && e.message === 'Error: stop here');
    const env = readFileSync(dump, 'utf8');
    assert.match(env, /OPENAI_API_KEY=sk-test-123456/);
    assert.match(env, /QA_INDEX_MODEL=m/);
    assert.match(env, /PYTHONDONTWRITEBYTECODE=1/);
    for (const secret of ['smtp-secret', 'cookie-secret', 'AUTH_SMTP_PASSWORD', 'SESSION_SECRET', 'DATABASE_PATH']) assert.ok(!env.includes(secret), `${secret} must not reach Python`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a tool that reports a clean error is not retried; a crash or timeout is', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'runner-'));
  try {
    const clean = createPythonRunner({ python: script(dir, 'echo "Error: The PDF has no pages." >&2; exit 1'), qaDir: dir, env: { PATH: process.env.PATH } });
    await assert.rejects(clean.extractDocument(job(dir)), (e: RunnerError) => e.retryable === false);
    const crash = createPythonRunner({ python: script(dir, 'printf "Traceback (most recent call last):\\nMemoryError\\n" >&2; exit 1'), qaDir: dir, env: { PATH: process.env.PATH } });
    await assert.rejects(crash.extractDocument(job(dir)), (e: RunnerError) => e.retryable === true && e.message === 'MemoryError');
    const slow = createPythonRunner({ python: script(dir, 'sleep 30'), qaDir: dir, env: { PATH: process.env.PATH }, timeouts: { lecture: 300, document: 300, unindex: 300, summary: 300 } });
    const started = Date.now();
    await assert.rejects(slow.extractDocument(job(dir)), (e: RunnerError) => e.retryable === true && /too long/.test(e.message));
    assert.ok(Date.now() - started < 5000, 'the stuck process was stopped');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a tool that exits cleanly without producing output is still an error', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'runner-'));
  try {
    const runner = createPythonRunner({ python: script(dir, 'exit 0'), qaDir: dir, env: { PATH: process.env.PATH, OPENAI_API_KEY: 'k', QA_INDEX_MODEL: 'm' } });
    await assert.rejects(runner.extractDocument(job(dir)), /No text could be extracted/);
    await assert.rejects(runner.indexLecture({ number: 1, lecturesDir: dir, indexPath: join(dir, 'nope', 'index.json') }), /produced no chapters/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('readiness explains what is missing instead of failing jobs', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'runner-'));
  try {
    const noKey = createPythonRunner({ python: script(dir, 'exit 0'), qaDir: dir, env: { PATH: process.env.PATH, QA_INDEX_MODEL: 'm' } });
    assert.deepEqual(await noKey.readiness('lecture'), { ok: false, reason: 'OPENAI_API_KEY is not set.' });
    assert.deepEqual(await noKey.readiness('document'), { ok: true }, 'documents need no key');
    const noModel = createPythonRunner({ python: script(dir, 'exit 0'), qaDir: dir, env: { PATH: process.env.PATH, OPENAI_API_KEY: 'k' } });
    assert.deepEqual(await noModel.readiness('lecture'), { ok: false, reason: 'QA_INDEX_MODEL is not set.' });
    const noPython = createPythonRunner({ python: join(dir, 'does-not-exist'), qaDir: dir, env: { PATH: process.env.PATH, OPENAI_API_KEY: 'k', QA_INDEX_MODEL: 'm' } });
    assert.match((await noPython.readiness('lecture') as { reason: string }).reason, /not installed/);
    const noPackages = createPythonRunner({ python: script(dir, 'exit 1'), qaDir: dir, env: { PATH: process.env.PATH, OPENAI_API_KEY: 'k', QA_INDEX_MODEL: 'm' } });
    assert.match((await noPackages.readiness('lecture') as { reason: string }).reason, /qa\/requirements\.txt/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
