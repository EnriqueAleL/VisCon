import express from 'express';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import type { VerifiedGuard } from '../auth/guard';

/** Files the sign-in page needs: everything reachable from the `auth` entry in Vite's build manifest. */
export function publicAuthFiles(distDir: string): Set<string> {
  const files = new Set<string>(['/favicon.svg', '/auth.html']);
  const manifestPath = join(distDir, '.vite', 'manifest.json');
  if (!existsSync(manifestPath)) return files;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, { file: string; css?: string[]; assets?: string[]; imports?: string[] }>;
  const seen = new Set<string>();
  const visit = (key: string) => {
    const chunk = manifest[key];
    if (!chunk || seen.has(key)) return;
    seen.add(key);
    for (const file of [chunk.file, ...(chunk.css ?? []), ...(chunk.assets ?? [])]) files.add(`/${file}`);
    chunk.imports?.forEach(visit);
  };
  visit('auth.html');
  return files;
}

/**
 * Serves the built front end, but only to verified accounts. Everyone else gets the small sign-in page for any
 * page URL, and a 401 for every other file, so none of the app's code or course structure leaves the server.
 */
export function mountStatic(app: express.Express, guard: VerifiedGuard, distDir = 'dist') {
  const dist = resolve(distDir);
  if (!existsSync(join(dist, 'index.html'))) return;
  const open = publicAuthFiles(dist);
  const isFont = (path: string) => /\.woff2?$/i.test(path); // licensed OFL, referenced from CSS so not in the manifest
  if (guard.enabled && !existsSync(join(dist, 'auth.html'))) throw new Error('dist/auth.html is missing: rebuild with `npm run build` (the sign-in page is required while AUTH_REQUIRE_VERIFIED is on).');

  /** A real, non-HTML, non-hidden file inside dist; page routes (including *.html) are handled separately. */
  function assetFile(urlPath: string): string | null {
    let decoded: string;
    try { decoded = decodeURIComponent(urlPath); } catch { return null; }
    if (decoded.includes('\0') || decoded.split('/').some(part => part.startsWith('.') || part === '..') || /\.html?$/i.test(decoded)) return null;
    const file = resolve(dist, '.' + decoded);
    if (!file.startsWith(dist + sep)) return null;
    try { return statSync(file).isFile() ? file : null; } catch { return null; }
  }

  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (/^\/(api|media|socket\.io)(\/|$)/.test(req.path)) return next();
    const verified = !guard.enabled || guard.accessFor(req.headers.cookie) === 'ok';
    if (assetFile(req.path)) {
      if (verified || open.has(req.path) || isFont(req.path)) return next();
      return res.status(401).json({ error: 'Log in with your ETH account to continue.', code: 'login_required' });
    }
    const learn = /^\/(learn(\/|\.html)?)$/.test(req.path);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Cookie');
    res.sendFile(join(dist, verified ? (learn ? 'learn.html' : 'index.html') : 'auth.html'));
  });
  app.use(express.static(dist, { index: false, dotfiles: 'ignore' }));
}
