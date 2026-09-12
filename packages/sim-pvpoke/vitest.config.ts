import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: 'sim-pvpoke', include: ['test/**/*.test.ts'], testTimeout: 120_000 },
});
