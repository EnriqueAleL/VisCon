import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import { createAdminService } from '../admin/service';
import { initSubmissionSchema } from '../submissions/schema';
import { receiveUpload, uploadLimits } from '../submissions/files';
import { createSubmissionService } from '../submissions/service';
import { createIndexingService } from './service';
import type { IndexRunner } from './runner';

const VTT = () => Buffer.from('WEBVTT\n\n' + [0, 1, 2, 3].map(i => `00:00:0${i}.000 --> 00:00:0${i + 1}.000\nline ${i} ${randomBytes(4).toString('hex')}\n`).join('\n'));
const MP4 = () => Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypisom'), randomBytes(200_000)]);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Removing material at every possible moment of an indexing run must never leave files or index entries behind. */
test('removal racing with publishing and indexing leaves nothing behind', async () => {
  for (const delay of [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89]) {
    const uploads = mkdtempSync(join(tmpdir(), 'race-up-')), courses = mkdtempSync(join(tmpdir(), 'race-co-'));
    try {
      const db = new DatabaseSync(':memory:');
      initSubmissionSchema(db);
      for (const name of ['riordache', 'ben']) db.prepare("INSERT INTO accounts (username,playerId,passwordHash,createdAt,verifiedAt) VALUES (?,?,'x',1,1)").run(name, `p-${name}`);
      let time = 1_800_000_000_000;
      const admin = createAdminService(db, { rootAdmins: new Set(['riordache']), clock: () => time });
      admin.createCourse('riordache', { name: 'Physics' });
      const indexed = new Set<number>();
      const runner: IndexRunner = {
        readiness: async () => ({ ok: true }),
        indexLecture: async job => { await sleep(30); mkdirSync(join(job.indexPath, '..'), { recursive: true }); indexed.add(job.number); writeFileSync(job.indexPath, JSON.stringify([...indexed])); },
        unindexLecture: async job => { await sleep(5); indexed.delete(job.number); },
        extractDocument: async () => ({ pages: 1 }),
      };
      let indexing!: ReturnType<typeof createIndexingService>;
      const submissions = createSubmissionService(db, admin, { uploadsDir: uploads, limits: uploadLimits({}), clock: () => time, onRemoved: s => indexing.unpublish(s) });
      indexing = createIndexingService(db, admin, { runner, submissions, coursesDir: courses, clock: () => time });

      const sub = submissions.create('ben', 'physics', { type: 'lecture', title: 'Race lecture', number: 5 });
      for (const [slot, data] of [['transcript', VTT()], ['video', MP4()]] as const) {
        const prepared = submissions.prepareUpload('ben', sub.id, slot, data.length);
        await submissions.ensureDir(sub.id);
        await submissions.commitFile('ben', sub.id, slot, await receiveUpload(Readable.from([data]), prepared.tmpPath, slot, prepared.max, data.length), `${slot}.bin`, prepared.tmpPath);
      }
      submissions.submit('ben', sub.id);
      time += 1000;
      submissions.approve('riordache', sub.id);

      const running = indexing.tick();           // publishing + indexing starts now
      await sleep(delay);                        // ...and the removal lands at a different moment each round
      await submissions.remove('riordache', sub.id, 'Takedown request');
      await running;
      await sleep(80);

      const leftovers = (() => { try { return readdirSync(join(courses, 'physics', 'lectures')); } catch { return []; } })();
      assert.deepEqual(leftovers, [], `files left behind when removed after ${delay} ms: ${leftovers}`);
      assert.deepEqual([...indexed], [], `index entry left behind when removed after ${delay} ms`);
      const row = db.prepare('SELECT status, indexState FROM submissions WHERE id=?').get(sub.id) as { status: string; indexState: string };
      assert.equal(row.status, 'removed');
      assert.notEqual(row.indexState, 'done');
    } finally { rmSync(uploads, { recursive: true, force: true }); rmSync(courses, { recursive: true, force: true }); }
  }
});
