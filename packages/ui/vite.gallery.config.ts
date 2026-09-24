import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** The component gallery: a dev-only page, never part of either app's build. */
export default defineConfig({
  root: fileURLToPath(new URL('./gallery', import.meta.url)),
  base: './',
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL('./gallery-dist', import.meta.url)),
    emptyOutDir: true,
  },
  server: { port: 5175, strictPort: true },
  preview: { port: 4175, strictPort: true },
});
