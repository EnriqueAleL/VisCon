/**
 * End to end with the REAL Python tool in qa/ and the real OpenAI client, against a local fake of the OpenAI API.
 * Skipped when Python with qa/requirements.txt is not installed (point QA_PYTHON at an interpreter that has it).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { createAdminService } from '../admin/service';
import { initSubmissionSchema } from '../submissions/schema';
import { receiveUpload, uploadLimits, type Slot } from '../submissions/files';
import { createSubmissionService } from '../submissions/service';
import { startFakeOpenAI } from './fake-openai';
import { createPythonRunner } from './runner';
import { createIndexingService } from './service';

const root = fileURLToPath(new URL('../', import.meta.url));
function findPython(): string | null {
  for (const candidate of [process.env.QA_PYTHON, join(root, '.venv/bin/python'), 'python3']) {
    if (!candidate) continue;
    const probe = spawnSync(candidate, ['-c', 'import openai, pydantic, pypdf'], { cwd: join(root, 'qa'), stdio: 'ignore' });
    if (probe.status === 0) return candidate;
  }
  return null;
}
const python = findPython();
const skip = python ? false : 'Python with the qa/requirements.txt packages is not available (set QA_PYTHON)';

/** A real, minimal PDF with one line of text per page (an empty string gives a page without text). */
function makePdf(pages: string[]): Buffer {
  const objects: string[] = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(`<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + 2 * i} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  const font = 3 + 2 * pages.length;
  pages.forEach((text, i) => {
    const stream = `BT /F1 18 Tf 40 700 Td (${text}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${4 + 2 * i} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => { const at = out.length; out += `${i + 1} 0 obj\n${body}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
const VTT = (cues = 40) => Buffer.from('WEBVTT\n\n' + Array.from({ length: cues }, (_, i) => {
  const t = (s: number) => `00:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.000`;
  return `${t(i * 20)} --> ${t(i * 20 + 18)}\nSentence ${i} about pipelining hazards ${randomBytes(3).toString('hex')}.\n`;
}).join('\n'));
const MP4 = () => Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypisom'), randomBytes(2000)]);

async function world(openaiUrl: string, options: { maxAttempts?: number } = {}) {
  const uploads = mkdtempSync(join(tmpdir(), 'e2e-up-')), courses = mkdtempSync(join(tmpdir(), 'e2e-co-'));
  const db = new DatabaseSync(':memory:');
  initSubmissionSchema(db);
  for (const name of ['riordache', 'ben']) db.prepare("INSERT INTO accounts (username,playerId,passwordHash,createdAt,verifiedAt) VALUES (?,?,'x',1,1)").run(name, `p-${name}`);
  let time = 1_800_000_000_000;
  const admin = createAdminService(db, { rootAdmins: new Set(['riordache']), clock: () => time });
  admin.createCourse('riordache', { name: 'Physics' });
  const runner = createPythonRunner({ python: python!, qaDir: join(root, 'qa'), env: { PATH: process.env.PATH, OPENAI_API_KEY: 'sk-test', OPENAI_BASE_URL: openaiUrl, QA_INDEX_MODEL: 'fake-model' } });
  let indexing!: ReturnType<typeof createIndexingService>;
  const submissions = createSubmissionService(db, admin, { uploadsDir: uploads, limits: uploadLimits({}), clock: () => time, onRemoved: s => indexing.unpublish(s) });
  indexing = createIndexingService(db, admin, { runner, submissions, coursesDir: courses, clock: () => time, maxAttempts: options.maxAttempts ?? 3, retryBaseSeconds: 0 });
  async function approved(type: 'lecture' | 'slides' | 'script', number: number | undefined, files: [Slot, Buffer][]) {
    const sub = submissions.create('ben', 'physics', { type, title: `${type} ${number ?? ''} e2e`, number });
    for (const [slot, data] of files) {
      const prepared = submissions.prepareUpload('ben', sub.id, slot, data.length);
      await submissions.ensureDir(sub.id);
      await submissions.commitFile('ben', sub.id, slot, await receiveUpload(Readable.from([data]), prepared.tmpPath, slot, prepared.max, data.length), `${slot}.bin`, prepared.tmpPath);
    }
    submissions.submit('ben', sub.id);
    time += 1000;
    submissions.approve('riordache', sub.id);
    return sub.id;
  }
  const state = (id: string) => db.prepare('SELECT indexState, indexAttempts, indexError FROM submissions WHERE id=?').get(id) as { indexState: string; indexAttempts: number; indexError: string | null };
  const cleanup = () => { rmSync(uploads, { recursive: true, force: true }); rmSync(courses, { recursive: true, force: true }); };
  return { db, admin, submissions, indexing, approved, state, courses, uploads, cleanup, tickAll: async () => { while (await indexing.tick()); } };
}

test('real pipeline: a lecture gets a chapter index, a script its text, a scan fails clearly, and removal cleans up', { skip }, async () => {
  const fake = await startFakeOpenAI();
  const w = await world(fake.url);
  try {
    const lecture = await w.approved('lecture', 7, [['transcript', VTT()], ['video', MP4()]]);
    const script = await w.approved('script', undefined, [['script', makePdf(['Pipelining overlaps instruction phases', 'A load-use hazard needs one bubble'])]]);
    const scan = await w.approved('slides', 2, [['slides', makePdf(['', ''])]]);
    await w.tickAll();

    // lecture: chapter index written by the real Python tool, using this course's own folder
    assert.deepEqual([w.state(lecture).indexState, w.state(lecture).indexError], ['done', null]);
    const indexFile = join(w.courses, 'physics', 'qa', 'index.json');
    const index = JSON.parse(readFileSync(indexFile, 'utf8'));
    assert.deepEqual(Object.keys(index.lectures), ['7']);
    assert.deepEqual(index.lectures['7'].chapters.map((c: { title: string }) => c.title), ['Introduction', 'Main topic']);
    assert.equal(index.lectures['7'].model, 'fake-model');
    assert.ok(index.lectures['7'].chapters.every((c: { start: number; end: number }) => c.end > c.start), 'timestamps come from the transcript');
    assert.ok(existsSync(join(w.courses, 'physics', 'qa', 'chapters', 'lec7.chapters.vtt')), 'chapter markers for the player were exported');
    assert.deepEqual(readdirSync(join(w.courses, 'physics', 'lectures')).sort(), ['lec7.mp4', 'lec7.vtt']);
    assert.equal(fake.requests.length, 1, 'exactly one model call per lecture');
    assert.equal(fake.requests[0].body.model, 'fake-model');
    assert.equal(fake.requests[0].body.text.format.name, 'ChapterDrafts');

    // script: text per page
    assert.equal(w.state(script).indexState, 'done');
    const doc = JSON.parse(readFileSync(join(w.courses, 'physics', 'qa', 'documents', `${script}.json`), 'utf8'));
    assert.deepEqual([doc.page_count, doc.pages_with_text], [2, 2]);
    assert.match(doc.pages[1].text, /load-use hazard needs one bubble/);

    // a scan has no text: a clear message, no pointless retries
    const failed = w.state(scan);
    assert.deepEqual([failed.indexState, failed.indexAttempts], ['failed', 1]);
    assert.match(failed.indexError!, /no extractable text/);

    // removing the lecture takes it out of the index, the markers and the course folder
    await w.submissions.remove('riordache', lecture, 'Takedown request');
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(indexFile, 'utf8')).lectures), []);
    assert.ok(!existsSync(join(w.courses, 'physics', 'qa', 'chapters', 'lec7.chapters.vtt')));
    assert.deepEqual(readdirSync(join(w.courses, 'physics', 'lectures')), []);
  } finally { w.cleanup(); await fake.close(); }
});

test('real pipeline: a model/API failure is retried, then reported without leaking the key', { skip }, async () => {
  const fake = await startFakeOpenAI({ failWith: 401 });
  const w = await world(fake.url, { maxAttempts: 2 });
  try {
    const lecture = await w.approved('lecture', 8, [['transcript', VTT()]]);
    await w.tickAll();
    const s = w.state(lecture);
    assert.deepEqual([s.indexState, s.indexAttempts], ['failed', 2]);
    assert.match(s.indexError!, /AuthenticationError|401/);
    assert.ok(!/SECRET|sk-proj/.test(s.indexError!), `the key must not appear in the stored message: ${s.indexError}`);
    assert.equal(fake.requests.length, 2, 'one model call per attempt');
    assert.ok(!existsSync(join(w.courses, 'physics', 'qa', 'index.json')) || !('8' in JSON.parse(readFileSync(join(w.courses, 'physics', 'qa', 'index.json'), 'utf8')).lectures));
  } finally { w.cleanup(); await fake.close(); }
});
