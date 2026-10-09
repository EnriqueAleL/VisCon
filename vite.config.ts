import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  publicDir: 'web-interface/public',
  plugins: [react(), {
    name: 'viscon-learn-route',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (/^\/learn\/?(?:\?|$)/.test(req.url || '')) req.url = req.url!.replace(/^\/learn\/?/, '/learn.html');
        next();
      });
    },
  }],
  build: { rollupOptions: { input: { arena: resolve('index.html'), learn: resolve('learn.html') } } },
  server: { port: 5173, strictPort: true, proxy: {
    '/api': 'http://127.0.0.1:3001', '/media': 'http://127.0.0.1:3001',
    '/socket.io': { target: 'http://127.0.0.1:3001', ws: true },
  } },
});
