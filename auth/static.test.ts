import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { request, type Server } from 'node:http';
import express from 'express';
import { mountStatic, publicAuthFiles } from '../server/static';
import type { VerifiedGuard } from './guard';

let dist: string, base: string, server: Server;
const guard = (enabled: boolean) => ({ enabled, accessFor: (cookie?: string) => cookie === 'ok' ? 'ok' : 'login_required' }) as unknown as VerifiedGuard;

function serve(enabled: boolean) {
  const app = express();
  mountStatic(app, guard(enabled), dist);
  app.use((_req, res) => res.status(404).send('fell through'));
  return new Promise<void>(resolve => { server = app.listen(0, () => { base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; resolve(); }); });
}
/** Sends the path exactly as written; fetch() would normalise %2e%2e and ../ away before it reaches the server. */
const raw = (path: string, cookie?: string) => new Promise<{ status: number; text: string }>((resolve, reject) => {
  const { port } = new URL(base);
  const req = request({ host: '127.0.0.1', port, path, method: 'GET', headers: cookie ? { cookie } : {} }, res => {
    let text = ''; res.on('data', chunk => { text += chunk; }); res.on('end', () => resolve({ status: res.statusCode ?? 0, text }));
  });
  req.on('error', reject); req.end();
});
const get = async (path: string, cookie?: string) => { const r = await fetch(base + path, { headers: cookie ? { cookie } : {}, redirect: 'manual' }); return { status: r.status, text: await r.text(), headers: r.headers }; };

before(() => {
  dist = mkdtempSync(join(tmpdir(), 'dist-'));
  for (const dir of ['assets', '.vite', 'globe', 'galaxy']) mkdirSync(join(dist, dir));
  const files: Record<string, string> = {
    'galaxy/index.html': 'APP-GALAXY', 'galaxy/app.js': 'GALAXY-JS', 'index.html': 'APP-MANIA', 'learn.html': 'APP-LEARN', 'auth.html': 'SIGN-IN',
    'favicon.svg': '<svg/>', 'assets/auth.js': 'auth-js', 'assets/shared.js': 'shared-js', 'assets/auth.css': 'css',
    'assets/app.js': 'COURSE-DATA', 'assets/Inter.woff2': 'font', 'globe/earth.jpg': 'jpg',     '.vite/manifest.json': JSON.stringify({
      'auth.html': { file: 'assets/auth.js', css: ['assets/auth.css'], imports: ['_shared.js'] },
      '_shared.js': { file: 'assets/shared.js' },
      'index.html': { file: 'assets/app.js' },
    }),
  };
  writeFileSync(join(dist, '..', `${dist.split(/[\\/]/).pop()}-secret.txt`), 'OUTSIDE-SECRET');
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dist, name), body);
});
after(() => { rmSync(dist, { recursive: true, force: true }); rmSync(`${dist}-secret.txt`, { force: true }); });

test('the public file set is exactly what the sign-in page imports', () => {
  assert.deepEqual([...publicAuthFiles(dist)].sort(), ['/assets/auth.css', '/assets/auth.js', '/assets/shared.js', '/auth.html', '/favicon.svg']);
});

test('visitors without a verified account get only the sign-in page and its files', async () => {
  await serve(true);
  try {
    for (const page of ['/', '/learn', '/learn/', '/learn.html', '/index.html', '/arena', '/room/AB12', '/history', '/some/deep/route', '/.vite/manifest.json', '/assets/missing.js.html', '/galaxy', '/galaxy/', '/world']) {
      const res = await get(page);
      assert.equal(res.text, 'SIGN-IN', page);
      assert.match(res.headers.get('cache-control') ?? '', /no-store/, page);
    }
    const name = `${dist.split(/[\\/]/).pop()}-secret.txt`;
    for (const attack of [`/../${name}`, `/%2e%2e/${name}`, `/..%2f${name}`, `/assets/../../${name}`, `/assets/%2e%2e/%2e%2e/${name}`, `/%2e%2e%5c${name}`, '/%00', '/%']) {
      const res = await raw(attack);
      assert.doesNotMatch(res.text, /OUTSIDE-SECRET/, attack);
    }
    for (const asset of ['/assets/auth.js', '/assets/shared.js', '/assets/auth.css', '/favicon.svg', '/assets/Inter.woff2']) assert.equal((await get(asset)).status, 200, asset);
    for (const asset of ['/assets/app.js', '/globe/earth.jpg', '/assets/app.js?x=1', '/galaxy/app.js']) {
      const res = await get(asset);
      assert.equal(res.status, 401, asset);
      assert.doesNotMatch(res.text, /COURSE-DATA/);
    }
    assert.equal((await get('/api/anything')).text, 'fell through', 'API and media are left to their own guard');
  } finally { server.close(); }
});

test('a verified account gets the real app, with the right page per route', async () => {
  await serve(true);
  try {
    for (const front of ['/', '/galaxy', '/galaxy/', '/galaxy/index.html']) assert.equal((await get(front, 'ok')).text, 'APP-GALAXY', front);
    assert.equal((await get('/galaxy/app.js', 'ok')).text, 'GALAXY-JS');
    assert.equal((await get('/arena', 'ok')).text, 'APP-MANIA');
    assert.equal((await get('/world', 'ok')).text, 'APP-MANIA');
    for (const learn of ['/learn', '/learn/', '/learn.html']) assert.equal((await get(learn, 'ok')).text, 'APP-LEARN', learn);
    assert.equal((await get('/assets/app.js', 'ok')).text, 'COURSE-DATA');
    assert.equal((await get('/globe/earth.jpg', 'ok')).status, 200);
    assert.equal((await get('/.vite/manifest.json', 'ok')).text, 'APP-MANIA', 'hidden build files are never served');
    const name = `${dist.split(/[\\/]/).pop()}-secret.txt`;
    for (const attack of [`/../${name}`, `/%2e%2e/${name}`, `/..%2f${name}`, `/assets/../../${name}`, `/assets/%2e%2e/%2e%2e/${name}`]) assert.doesNotMatch((await raw(attack, 'ok')).text, /OUTSIDE-SECRET/, attack);
  } finally { server.close(); }
});

test('with the guard disabled for development everything is served as before', async () => {
  await serve(false);
  try {
    assert.equal((await get('/')).text, 'APP-GALAXY');
    assert.equal((await get('/assets/app.js')).text, 'COURSE-DATA');
  } finally { server.close(); }
});

test('refuses to start without the sign-in page when the guard is on', () => {
  const empty = mkdtempSync(join(tmpdir(), 'dist-'));
  writeFileSync(join(empty, 'index.html'), 'x');
  assert.throws(() => mountStatic(express(), guard(true), empty), /auth\.html is missing/);
  assert.doesNotThrow(() => mountStatic(express(), guard(false), empty));
  rmSync(empty, { recursive: true, force: true });
});
