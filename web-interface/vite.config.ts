import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The app gateway checks ETH verification before forwarding document requests to Python.
const translationProxy = { target: 'http://127.0.0.1:3001' };

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
