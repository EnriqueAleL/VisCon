import http from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { InputError, loadCatalog } from './catalog.mjs';
import { createAnswerService, createOllamaExplainer } from './answers.mjs';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webm': 'video/webm', '.vtt': 'text/vtt; charset=utf-8' };

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

async function body(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? '')) throw new InputError('Content-Type application/json erwartet.', 415);
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16384) throw new InputError('Anfrage ist zu gross.', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new InputError('Ungültiges JSON.'); }
}

async function serveFile(req, res, base, relative) {
  const basePath = await realpath(base);
  let target;
  try { target = await realpath(path.resolve(basePath, relative)); }
  catch (error) { if (error.code === 'ENOENT') throw new InputError('Datei nicht gefunden.', 404); throw error; }
  if (!target.startsWith(`${basePath}${path.sep}`)) throw new InputError('Datei nicht gefunden.', 404);
  const info = await stat(target);
  if (!info.isFile()) throw new InputError('Datei nicht gefunden.', 404);
  let start = 0;
  let end = info.size - 1;
  let status = 200;
  const headers = { 'Content-Type': TYPES[path.extname(target)] ?? 'application/octet-stream', 'Accept-Ranges': 'bytes' };
  if (req.headers.range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (!match || (!match[1] && !match[2])) {
      res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); res.end(); return;
    }
    if (!match[1]) start = Math.max(0, info.size - Number(match[2]));
    else start = Number(match[1]);
    if (match[1] && match[2]) end = Math.min(end, Number(match[2]));
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= info.size) {
      res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); res.end(); return;
    }
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
  }
  headers['Content-Length'] = end - start + 1;
  res.writeHead(status, headers);
  if (req.method === 'HEAD') { res.end(); return; }
  await pipeline(createReadStream(target, { start, end }), res);
}

export function createServer({ catalog, explain = null, mediaRoot = path.join(ROOT, 'media'), frontendOrigin = 'http://127.0.0.1:5173' }) {
  const ask = createAnswerService(catalog, { explain });
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.headers.origin === frontendOrigin) {
      res.setHeader('Access-Control-Allow-Origin', frontendOrigin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    } else if (req.headers.origin) {
      try {
        if (new URL(req.headers.origin).host !== req.headers.host) { json(res, 403, { error: 'Diese Origin ist nicht freigegeben.' }); return; }
      } catch { json(res, 403, { error: 'Ungültige Origin.' }); return; }
    }
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/api/health') {
        json(res, 200, { status: 'ok', lectureCount: catalog.lectures.length, answerMode: explain ? 'ollama' : 'extractive', demo: catalog.lectures.every(item => item.demo === true) });
      } else if (req.method === 'GET' && url.pathname === '/api/courses') {
        json(res, 200, { courses: catalog.courses });
      } else if (req.method === 'GET' && url.pathname === '/api/lectures') {
        const courseId = url.searchParams.get('courseId');
        if (courseId && courseId !== 'all' && !catalog.courses.some(item => item.id === courseId)) throw new InputError('Unbekannter Kurs.', 404);
        json(res, 200, { lectures: catalog.lectures.filter(item => !courseId || courseId === 'all' || item.courseId === courseId).map(({ segments, keywords, ...lecture }) => ({ ...lecture, segmentCount: segments.length })) });
      } else if (req.method === 'POST' && ['/api/ask', '/api/search'].includes(url.pathname)) {
        json(res, 200, await ask(await body(req)));
      } else if (['GET', 'HEAD'].includes(req.method) && url.pathname.startsWith('/media/')) {
        await serveFile(req, res, mediaRoot, decodeURIComponent(url.pathname.slice('/media/'.length)));
      } else if (['GET', 'HEAD'].includes(req.method) && /^\/design\/(?:tokens\.css|base\.css|fonts\.css|fonts\/inter-latin-(?:400|500|600|700)-normal\.woff2)$/.test(url.pathname)) {
        await serveFile(req, res, path.resolve(ROOT, '../shared/design'), url.pathname.slice('/design/'.length));
      } else if (['GET', 'HEAD'].includes(req.method) && ['/', '/demo', '/demo.js', '/demo.css', '/client.mjs'].includes(url.pathname)) {
        const relative = { '/': 'index.html', '/demo': 'index.html', '/client.mjs': '../client/client.mjs' }[url.pathname] ?? url.pathname.slice(1);
        if (url.pathname === '/client.mjs') await serveFile(req, res, path.join(ROOT, 'client'), 'client.mjs');
        else await serveFile(req, res, path.join(ROOT, 'demo'), relative);
      } else {
        throw new InputError('Route nicht gefunden.', 404);
      }
    } catch (error) {
      if (res.headersSent) { res.destroy(); return; }
      json(res, error instanceof InputError ? error.status : 500, { error: error instanceof InputError ? error.message : 'Interner Fehler beim Verarbeiten der Anfrage.' });
    }
  });
}

export async function start() {
  const catalog = await loadCatalog(path.resolve(ROOT, process.env.CATALOG_PATH ?? 'data/demo-catalog.json'));
  const explain = process.env.OLLAMA_MODEL ? createOllamaExplainer({
    model: process.env.OLLAMA_MODEL,
    baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434',
    timeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS ?? 30000),
  }) : null;
  const server = createServer({ catalog, explain, frontendOrigin: process.env.FRONTEND_ORIGIN });
  const port = Number(process.env.PORT ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Ungültiger Port.');
  server.requestTimeout = 45000;
  server.headersTimeout = 10000;
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, process.env.HOST ?? '127.0.0.1', () => {
    console.log(`Video Pull-up: http://${process.env.HOST ?? '127.0.0.1'}:${port}/demo`);
    console.log(`${catalog.lectures.length} Vorlesungen · ${explain ? `lokales Modell ${process.env.OLLAMA_MODEL}` : 'Transkript-Erklärungen'}`);
  });
  return server;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  start().catch(error => { console.error(error.message); process.exitCode = 1; });
}
