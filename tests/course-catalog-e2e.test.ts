/**
 * The whole chain on the real stack: a submitted lecture is approved, indexed by the REAL Python tool, listed by the catalogue,
 * and a question is answered by the real Python Q&A tool pointed at that one course (OpenAI is a local fake).
 * Skipped unless Python with qa/requirements.txt is available (set QA_PYTHON).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { startFakeOpenAI } from '../indexing/fake-openai';
import { vtt } from './catalog-fixtures';

const root = fileURLToPath(new URL('../', import.meta.url));
const python = [process.env.QA_PYTHON, join(root, '.venv/bin/python'), 'python3'].filter(Boolean).find(candidate =>
  spawnSync(candidate!, ['-c', 'import openai, pydantic, pypdf'], { cwd: join(root, 'qa'), stdio: 'ignore' }).status === 0) ?? null;
const skip = python ? false : 'Python with the qa/requirements.txt packages is not available (set QA_PYTHON)';

test('approve -> index -> catalogue -> model-backed answer, per course', { skip }, async () => {
  const fake = await startFakeOpenAI();
  Object.assign(process.env, { DATABASE_PATH: ':memory:', LECTURE_QA_PROVIDER: 'python', QA_PYTHON: python!, OPENAI_API_KEY: 'sk-test', OPENAI_BASE_URL: fake.url, QA_INDEX_MODEL: 'fake-model', QA_ANSWER_MODEL: 'fake-model' });
  const { db } = await import('../server/store');
  const { createAdminService } = await import('../admin/service');
  const { createSubmissionService } = await import('../submissions/service');
  const { receiveUpload, uploadLimits } = await import('../submissions/files');
  const { createIndexingService } = await import('../indexing/service');
  const { createPythonRunner, pythonConfigFromEnv } = await import('../indexing/runner');
  const { mountLectures } = await import('../server/lectures');

  const uploads = mkdtempSync(join(tmpdir(), 'cc-up-')), courses = mkdtempSync(join(tmpdir(), 'cc-co-'));
  let server: import('node:http').Server | undefined;
  try {
    for (const name of ['riordache', 'ben']) db.prepare("INSERT OR IGNORE INTO accounts (username,playerId,passwordHash,createdAt,verifiedAt) VALUES (?,?,'x',1,1)").run(name, `p-${name}`);
    let time = 1_800_000_000_000;
    const admin = createAdminService(db, { rootAdmins: new Set(['riordache']), clock: () => time });
    admin.createCourse('riordache', { name: 'Physics' });
    admin.createCourse('riordache', { name: 'Chemistry' });
    const submissions = createSubmissionService(db, admin, { uploadsDir: uploads, limits: uploadLimits({}), clock: () => time });
    const indexing = createIndexingService(db, admin, { runner: createPythonRunner(pythonConfigFromEnv(root, process.env)), submissions, coursesDir: courses, clock: () => time, retryBaseSeconds: 0 });

    async function approve(course: string, number: number, word: string) {
      const sub = submissions.create('ben', course, { type: 'lecture', title: `Lecture ${number}: ${word}`, number });
      const data = Buffer.from(vtt(40, word));
      const prepared = submissions.prepareUpload('ben', sub.id, 'transcript', data.length);
      await submissions.ensureDir(sub.id);
      await submissions.commitFile('ben', sub.id, 'transcript', await receiveUpload(Readable.from([data]), prepared.tmpPath, 'transcript', prepared.max, data.length), 't.vtt', prepared.tmpPath);
      submissions.submit('ben', sub.id);
      time += 1000;
      submissions.approve('riordache', sub.id);
      while (await indexing.tick());
      assert.equal((db.prepare('SELECT indexState FROM submissions WHERE id=?').get(sub.id) as { indexState: string }).indexState, 'done');
    }
    await approve('physics', 7, 'thermodynamics');
    await approve('chemistry', 8, 'stoichiometry');
    await approve('computer-architecture', 25, 'superscalar');

    const app = express();
    app.use(express.json());
    await mountLectures(app, { db, coursesDir: courses });
    server = app.listen(0);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const get = async (path: string) => (await fetch(base + path)).json() as Promise<any>;
    const ask = async (question: string, courseId: string | null, lectureId?: string) =>
      (await fetch(base + '/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question, courseId, lectureId }) })).json() as Promise<any>;
    const pickInputs = () => fake.requests.filter(r => r.body.text?.format?.name === 'ChapterPick').map(r => String(r.body.input));

    // 1. the catalogue lists them
    const lectures = (await get('/api/lectures')).lectures.map((l: { id: string }) => l.id);
    for (const id of ['physics-lec7', 'chemistry-lec8', 'computer-architecture-lec25', 'lec7']) assert.ok(lectures.includes(id), id);
    assert.equal((await get('/api/courses')).courses.find((c: { id: string }) => c.id === 'physics').videoCount, 1);
    // the study notes were made automatically after indexing, and the app can read them
    const physics7 = (await get('/api/lectures')).lectures.find((l: { id: string }) => l.id === 'physics-lec7');
    assert.equal(physics7.hasSummary, true);
    const notes = (await get('/api/lectures/physics-lec7/summary')).summary;
    assert.ok(notes.overview && notes.sections.length > 0, JSON.stringify(notes).slice(0, 200));

    // 2. a question to one course reaches the real Python Q&A tool, which reads only that course's index
    const answer = await ask('How does thermodynamics work?', 'physics');
    assert.equal(answer.status, 'answered', JSON.stringify(answer).slice(0, 300));
    assert.equal(answer.answer.mode, 'generated');
    assert.equal(answer.sources[0].lectureId, 'physics-lec7');
    assert.equal(answer.sources[0].courseId, 'physics');
    assert.ok(answer.sources[0].start >= 0 && answer.sources[0].end > answer.sources[0].start);
    const [physicsPick] = pickInputs();
    assert.match(physicsPick, /Lecture 7 \|/, 'the physics index was shown to the model');
    assert.ok(!/Lecture 8 \|/.test(physicsPick), 'chemistry\'s chapters were NOT shown');
    assert.ok(!/Lecture 25 \|/.test(physicsPick));

    // 3. the other course is answered from its own index
    const chem = await ask('stoichiometry?', 'chemistry');
    assert.equal(chem.sources[0].lectureId, 'chemistry-lec8');
    const chemPick = pickInputs().at(-1)!;
    assert.ok(/Lecture 8 \|/.test(chemPick) && !/Lecture 7 \|/.test(chemPick));

    // 4. a restricted question (one lecture) is sent with that course's local lecture number
    const one = await ask('thermodynamics?', 'physics', 'physics-lec7');
    assert.equal(one.sources[0].lectureId, 'physics-lec7');

    // 5. the original course reads its own index AND the lectures submitted later
    const ddca = await ask('anything about pipelining?', 'computer-architecture');
    assert.equal(ddca.status, 'answered');
    const ddcaPick = pickInputs().at(-1)!;
    assert.match(ddcaPick, /Lecture 1 \|/, 'the original recordings are there');
    assert.match(ddcaPick, /Lecture 25 \|/, 'and the submitted lecture too');
    assert.equal(ddca.sources[0].lectureId, 'lec1', 'the original ids are unchanged');
    const noCourse = await ask('anything about pipelining?', null);
    assert.equal(noCourse.status, 'answered', 'no course chosen still means the original recordings');
    assert.match(pickInputs().at(-1)!, /Lecture 25 \|/);

    // 6. when the model service fails, the student still gets the local transcript search
    await fake.close();
    const failing = await startFakeOpenAI({ failWith: 500 });
    process.env.OPENAI_BASE_URL = failing.url;
    const fallback = await ask('thermodynamics', 'physics');
    assert.equal(fallback.answer.mode, 'extractive_fallback');
    assert.ok(fallback.sources.length > 0 && fallback.sources[0].lectureId === 'physics-lec7', 'local search found it');
    await failing.close();
  } finally { server?.close(); rmSync(uploads, { recursive: true, force: true }); rmSync(courses, { recursive: true, force: true }); await fake.close().catch(() => {}); }
});
