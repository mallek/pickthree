import { describe, expect, it } from 'vitest';
import { readLock } from '../src/lock.js';

describe('pvpoke.lock.json', () => {
  it('pins a full 40-char commit sha and an ISO date', () => {
    const lock = readLock();
    expect(lock.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(lock.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(lock.repository).toBe('https://github.com/pvpoke/pvpoke.git');
  });
});
