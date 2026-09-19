import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  define: { __META_BUILD__: JSON.stringify('test') },
  test: {
    name: 'meta',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    environment: 'jsdom',
    setupFiles: ['../../packages/ui/src/test-setup.ts'],
  },
});
