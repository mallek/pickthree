import { describe, expect, it } from 'vitest';
import { isWorkerPath } from '../src/meta.js';

describe('isWorkerPath', () => {
  it('is true for every known worker path', () => {
    for (const p of ['/hit', '/count', '/error', '/errors', '/battles', '/meta']) {
      expect(isWorkerPath(p)).toBe(true);
    }
  });

  it('is true for any /api/ path, whatever the version', () => {
    expect(isWorkerPath('/api/v1/meta')).toBe(true);
    expect(isWorkerPath('/api/v2/anything')).toBe(true);
  });

  it('is false for site paths', () => {
    for (const p of [
      '/',
      '/great',
      '/great/p/azumarill',
      '/about',
      '/assets/index-abc123.js',
      '/favicon.svg',
    ]) {
      expect(isWorkerPath(p)).toBe(false);
    }
  });
});
