import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  resolve: { dedupe: ['react', 'react-dom'] },
  plugins: [react()],
  server: { proxy: { '/api': 'http://127.0.0.1:3001', '/media': 'http://127.0.0.1:3001' } },
});
