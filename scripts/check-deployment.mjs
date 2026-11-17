#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { io } from 'socket.io-client';

const args = process.argv.slice(2);
const help = args.includes('--help');
if (help) {
  console.log(`Usage: npm run check:deployment -- [BASE_URL] [--require-videos] [--ask] [--load=N]

Defaults to CHECK_BASE_URL or http://127.0.0.1:8080. Tests health, built pages,
the Versus question banks, lecture captions, available video byte ranges, and the
Versus Socket.IO connection with its DEFAULT transports.
--require-videos fails unless every real DDCA recording is playable.
--ask makes one Q&A request (may incur a model charge if enabled).
--load=N adds N health requests, at most 100, with concurrency at most 4.
For an authenticated managed URL, set CHECK_COOKIE or CHECK_COOKIE_FILE locally.
Cookies and response bodies containing identities are never printed.`);
  process.exit(0);
}
const unknown = args.filter(arg => arg.startsWith('--') && !['--require-videos', '--ask'].includes(arg) && !/^--load=\d+$/.test(arg));
if (unknown.length) throw new Error(`Unknown option: ${unknown.join(', ')}. Use --help.`);
const positional = args.filter(arg => !arg.startsWith('--'));
if (positional.length > 1) throw new Error('Supply one base URL. Use --help.');
const base = new URL(positional[0] || process.env.CHECK_BASE_URL || 'http://127.0.0.1:8080');
if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error('BASE_URL must be an HTTP(S) origin without credentials, path, query, or hash.');
const loadSamples = Number(args.find(arg => arg.startsWith('--load='))?.slice(7) || 0);
if (loadSamples > 100) throw new Error('--load is bounded to 100 health requests.');
const cookieInput = process.env.CHECK_COOKIE_FILE ? await readFile(process.env.CHECK_COOKIE_FILE, 'utf8') : process.env.CHECK_COOKIE || '';
const cookies = new Map(cookieInput.trim().split(';').filter(Boolean).map(part => {
  const separator = part.indexOf('=');
  if (separator < 1) throw new Error('The cookie file must contain a Cookie header value.');
  return [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
}));
const cookieHeader = () => [...cookies].map(([key, value]) => `${key}=${value}`).join('; ');
let failures = 0;
const warn = message => console.warn(`WARN  ${message}`);
const pass = message => console.log(`PASS  ${message}`);
function assert(condition, message) { if (!condition) throw new Error(message); }
async function request(path, options = {}) {
  const headers = { Origin: base.origin, ...(cookieHeader() ? { Cookie: cookieHeader() } : {}), ...options.headers };
  const response = await fetch(new URL(path, base), { ...options, headers, redirect: 'manual', signal: AbortSignal.timeout(15_000) });
  if (response.status >= 300 && response.status < 400) throw new Error('Request redirected. Log in at the managed URL and supply CHECK_COOKIE_FILE, then retry.');
  assert(response.status !== 401 && response.status !== 403, `${path} needs a logged-in ETH account (HTTP ${response.status}). Log in at the managed URL and supply CHECK_COOKIE_FILE with the ba_session cookie, then retry.`);
  assert(response.ok, `${path} returned HTTP ${response.status}`);
  for (const header of response.headers.getSetCookie()) {
    const value = header.split(';', 1)[0];
    const separator = value.indexOf('=');
    if (separator > 0) cookies.set(value.slice(0, separator), value.slice(separator + 1));
  }
  return response;
}
async function json(path, options) {
  const response = await request(path, options);
  assert(response.headers.get('content-type')?.includes('application/json'), `${path} did not return JSON; check routing and authentication.`);
  return response.json();
}
async function check(label, action) {
  try { await action(); pass(label); }
  catch (error) { failures++; console.error(`FAIL  ${label}: ${error.message}`); }
}
console.log(`Checking ${base.origin} with Node ${process.versions.node}`);
let catalog;
await check('Health endpoint', async () => assert((await json('/api/health')).ok === true, 'Health is not OK.'));
await check('Built semester and lecture pages', async () => {
  const galaxy = await (await request('/')).text();
  assert(galaxy.includes('id="scene"') && galaxy.includes('/galaxy/app.js') && galaxy.includes('id="versus-link"'), '/ is not the built course galaxy. Run npm run build.');
  for (const path of ['/learn', '/arena']) {
    const body = await (await request(path)).text();
    assert(body.includes('id="root"') && /\/assets\/[^"']+\.js/.test(body), `${path} is not the production Vite page. Run npm run build.`);
  }
});
await check('Player profile and Versus question banks', async () => {
  const bootstrap = await json('/api/bootstrap');
  assert(bootstrap.profile?.id, 'The player profile is missing.');
  const ddca = bootstrap.subjects?.find(subject => subject.id === 'ddca');
  assert(ddca && ddca.count > 0 && ddca.topics?.length >= 20, 'The DDCA Versus bank is missing.');
  pass(`${bootstrap.subjects.length} question banks / DDCA: ${ddca.count} questions across ${ddca.topics.length} topics`);
});
await check('Lecture index, captions, and available media', async () => {
  catalog = await json('/api/lectures?courseId=computer-architecture');
  const real = catalog.lectures?.filter(lecture => !lecture.demo) || [];
  assert(real.length === 24, 'Expected all 24 real DDCA lectures.');
  const captions = await (await request(real[0].captionsUrl)).text();
  assert(captions.startsWith('WEBVTT'), 'Original captions are unavailable.');
  const playable = real.filter(lecture => lecture.mediaUrl);
  pass(`${playable.length}/${real.length} real DDCA recordings available`);
  if (args.includes('--require-videos')) assert(playable.length === real.length, 'Download all Git LFS video files before deployment.');
  if (!playable.length) warn('DDCA videos are missing or are Git LFS pointers. Transcript search still works.');
  else {
    const response = await request(playable[0].mediaUrl, { headers: { Range: 'bytes=0-63' } });
    assert(response.status === 206 && /^bytes 0-63\//.test(response.headers.get('content-range') || ''), 'Video byte-range seeking is unavailable.');
    assert((await response.arrayBuffer()).byteLength === 64, 'Unexpected range response size.');
    pass('Real video byte-range seeking');
  }
});
await check('Versus Socket.IO with default transports', async () => {
  assert(cookies.size > 0, 'Player session cookie was not created.');
  await new Promise((resolve, reject) => {
    // Do not force websocket transport: managed VIScon proxy needs polling fallback.
    const socket = io(base.origin, { autoConnect: false, forceNew: true, reconnection: false,
      extraHeaders: { Cookie: cookieHeader(), Origin: base.origin } });
    const timer = setTimeout(() => finish(new Error('Versus Socket.IO connection timed out.')), 12_000);
    function finish(error) { clearTimeout(timer); socket.disconnect(); error ? reject(error) : resolve(); }
    socket.once('connect_error', () => finish(new Error('Versus Socket.IO connection failed. Check managed-origin allowlist, login cookie, and proxy polling.')));
    socket.once('connect', () => {
      pass(`Socket.IO established via ${socket.io.engine?.transport.name || 'default transport'}`);
      finish();
    });
    socket.connect();
  });
});
if (args.includes('--ask')) await check('Cited lecture Q&A', async () => {
  const result = await json('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: 'why does a load followed by add stall even with forwarding?', courseId: 'computer-architecture' }) });
  assert(Array.isArray(result.sources) && result.sources.length > 0 && result.sources.every(source => Number.isFinite(source.start)), 'No timestamped lecture sources returned.');
});
if (loadSamples) await check(`${loadSamples} health requests with bounded concurrency`, async () => {
  const times = []; let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, loadSamples) }, async () => {
    while (next++ < loadSamples) {
      const start = performance.now();
      assert((await json('/api/health')).ok === true, 'Health failed under load.');
      times.push(performance.now() - start);
    }
  }));
  times.sort((a, b) => a - b);
  pass(`Health p95 ${Math.round(times[Math.max(0, Math.ceil(times.length * 0.95) - 1)])} ms (smoke check, not a capacity claim)`);
});
console.log(failures ? `${failures} deployment check(s) failed.` : 'Deployment smoke checks passed.');
process.exitCode = failures ? 1 : 0;
