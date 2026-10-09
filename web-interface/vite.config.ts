import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The embedded document viewer (public/translation/, an iframe at the same origin) calls
// /api/translate with relative paths. Proxy those to the standalone translation backend
// (`cd ../translation && .venv/bin/python -m viscon_translate serve`) instead of letting
// Vite 404 them -- that process still owns the PDF translation pipeline and its own data/.
const translationApiProxy = { '/api': 'http://127.0.0.1:8788' };

export default defineConfig({
  plugins: [react()],
  server: { proxy: translationApiProxy },
  preview: { proxy: translationApiProxy },
});
