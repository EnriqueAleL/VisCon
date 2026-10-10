import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cpSync, createReadStream, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';

const GALAXY_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

export default defineConfig({
  publicDir: 'web-interface/public',
  // Both frontends must share React, even with legacy web-interface/node_modules present.
  resolve: { dedupe: ['react', 'react-dom'] },
  plugins: [react(), {
    name: 'viscon-learn-route',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '';
        if (/^\/learn\/?(?:\?|$)/.test(url)) {
          req.url = url.replace(/^\/learn\/?/, '/learn.html');
          return next();
        }
        // The galaxy is the front page. It is a plain page with classic scripts and
        // vendored three.js, served straight from disk rather than through Vite's
        // pipeline, which would hand back its stylesheet wrapped as a JS module and
        // leave the page unstyled. Its own asset URLs are absolute, so the same file
        // works whether it is reached at / or at /galaxy/.
        const [rawPath] = url.split('?');
        const isGalaxyPage = rawPath === '/' || rawPath === '/galaxy' || rawPath === '/galaxy/';
        if (isGalaxyPage) {
          try {
            const response = await fetch('http://127.0.0.1:3001/api/auth/me', {
              headers: { cookie: req.headers.cookie || '' },
              signal: AbortSignal.timeout(5000),
            });
            if (!response.ok) throw new Error('Account service unavailable');
            const status = await response.json() as { required: boolean; account: { verified: boolean } | null };
            if (status.required && !status.account?.verified) {
              req.url = '/auth.html';
              return next();
            }
          } catch {
            res.statusCode = 503;
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            return res.end('Der Lernraum ist vorübergehend nicht erreichbar. Bitte starte den API-Server und lade die Seite neu.');
          }
        }
        if (isGalaxyPage || /^\/galaxy\//.test(rawPath)) {
          const relative = isGalaxyPage ? 'galaxy/index.html' : decodeURIComponent(rawPath).slice(1);
          const file = resolve(relative);
          const root = resolve('galaxy') + sep;
          if (!file.startsWith(root)) {
            res.statusCode = 403;
            return res.end('Forbidden');
          }
          try {
            if (!statSync(file).isFile()) throw new Error('not a file');
          } catch {
            res.statusCode = 404;
            return res.end('Not found');
          }
          const ext = file.slice(file.lastIndexOf('.'));
          res.setHeader('Content-Type', GALAXY_TYPES[ext] || 'application/octet-stream');
          res.setHeader('Cache-Control', 'no-cache');
          return createReadStream(file).pipe(res);
        }
        next();
      });
    },
  }, {
    // The galaxy is a standalone page with classic scripts and its own vendored
    // three.js, so it ships as-is rather than through the bundler. Copying it keeps
    // it runnable both from dist and straight out of galaxy/ on its own.
    name: 'viscon-galaxy-page',
    apply: 'build',
    closeBundle() {
      cpSync(resolve('galaxy'), resolve('dist/galaxy'), {
        recursive: true,
        filter: (src) => !/README\.md$/.test(src),
      });
    },
  }],
  // `auth` is the only entry served to anonymous visitors; the manifest lets the server tell its files from the app's.
  build: { manifest: true, rollupOptions: { input: { arena: resolve('index.html'), learn: resolve('learn.html'), auth: resolve('auth.html') } } },
  server: { port: 5173, strictPort: true, proxy: {
    // The Node gateway verifies the account before forwarding document requests to Python.
    '/translate-api': {
      target: 'http://127.0.0.1:3001',
      configure(proxy) {
        proxy.on('error', (_error, _req, res) => {
          if ('writeHead' in res && !res.headersSent) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'The reading companion is temporarily unavailable. You can keep reading and try again shortly.' }));
          }
        });
      },
    },
    '/api': 'http://127.0.0.1:3001', '/media': 'http://127.0.0.1:3001',
    '/socket.io': { target: 'http://127.0.0.1:3001', ws: true },
  } },
});
