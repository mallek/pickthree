import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const build = process.env.PICK3_BUILD ?? process.env.GITHUB_SHA?.slice(0, 7) ?? 'dev';

/** In production the API is the same origin; in dev it is the deployed worker. */
const API = 'https://pickthree-counter.travis-c82.workers.dev';

export default defineConfig({
  base: '/',
  define: { __META_BUILD__: JSON.stringify(build) },
  plugins: [react()],
  build: { target: 'es2022', sourcemap: true },
  server: {
    port: 5174,
    proxy: { '/api': { target: API, changeOrigin: true } },
  },
  preview: {
    port: 4174,
    proxy: { '/api': { target: API, changeOrigin: true } },
  },
});
