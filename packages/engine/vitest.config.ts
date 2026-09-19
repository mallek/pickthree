import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'engine',
    include: ['test/**/*.test.ts'],
    // recommend.e2e and the golden sim run the real PvPoke simulator over the whole fixture.
    // They take four to six seconds of honest work, so vitest's 5s default leaves no headroom
    // and they time out when the full suite runs every project in parallel.
    testTimeout: 30_000,
  },
});
