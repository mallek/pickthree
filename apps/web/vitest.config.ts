import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  define: {
    __PICK3_BUILD__: JSON.stringify('test'),
    __PICK3_BUILT_AT__: JSON.stringify('2026-01-01T00:00:00Z'),
  },
  resolve: {
    alias: {
      // vite-plugin-pwa provides this virtual module at build time only; Sheet.tsx and App.tsx
      // reach it through update.ts, so tests need a stand-in to resolve the import.
      'virtual:pwa-register': fileURLToPath(
        new URL('./test/stubs/pwaRegisterStub.ts', import.meta.url),
      ),
    },
  },
  test: {
    name: 'web',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    environment: 'jsdom',
    setupFiles: ['test/setup.ts'],
  },
});
