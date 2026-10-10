import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Two backends sit behind this dev server. The app server owns /api; the standalone
// translation service (`cd ../translation && .venv/bin/python -m viscon_translate serve`)
// gets its own /translate-api prefix, rewritten back to /api on the way out, so the two
// never collide over route names.
const translationProxy = {
  target: 'http://127.0.0.1:8788',
  rewrite: (path: string) => path.replace(/^\/translate-api/, '/api'),
};

export default defineConfig({
  resolve: { dedupe: ['react', 'react-dom'] },
  plugins: [react()],
  server: {
    proxy: {
      '/translate-api': translationProxy,
      '/api': 'http://127.0.0.1:3001',
      '/media': 'http://127.0.0.1:3001',
    },
  },
  preview: {
    proxy: {
      '/translate-api': translationProxy,
      '/api': 'http://127.0.0.1:3001',
      '/media': 'http://127.0.0.1:3001',
    },
  },
});
