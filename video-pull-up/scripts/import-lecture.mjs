import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { validateCatalog } from '../src/catalog.mjs';
import { parseSubtitles, chunkCues } from '../src/transcripts.mjs';

const { values } = parseArgs({ options: {
  metadata: { type: 'string' }, transcript: { type: 'string' }, out: { type: 'string', default: 'data/local-catalog.json' },
} });

try {
  if (!values.metadata || !values.transcript) throw new Error('Aufruf: npm run import -- --metadata lecture.json --transcript lecture.vtt --out data/local-catalog.json');
  const metadata = JSON.parse(await readFile(values.metadata, 'utf8'));
  const cues = parseSubtitles(await readFile(values.transcript, 'utf8'));
  let catalog = { courses: [], lectures: [] };
  try { catalog = JSON.parse(await readFile(values.out, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const { courseName, ...lecture } = metadata;
  if (!catalog.courses.some(course => course.id === lecture.courseId)) {
    if (!courseName) throw new Error('Für einen neuen Kurs ist courseName erforderlich.');
    catalog.courses.push({ id: lecture.courseId, name: courseName });
  }
  // Updating a lecture replaces its old timed segments, keeping lecture identity stable.
  lecture.segments = chunkCues(cues, lecture.id);
  catalog.lectures = [...catalog.lectures.filter(item => item.id !== lecture.id), lecture];
  validateCatalog(catalog);
  await mkdir(path.dirname(values.out), { recursive: true });
  const temporary = `${values.out}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(catalog, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, values.out);
  console.log(`${lecture.title}: ${cues.length} Untertitel → ${lecture.segments.length} Abschnitte in ${values.out}`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
