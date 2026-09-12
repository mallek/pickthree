import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  plugins: [react()],
  worker: {
    // Classic worker so the vendored PvPoke bundle can be pulled in with importScripts.
    format: 'iife',
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  server: {
    port: 5173,
  },
});
