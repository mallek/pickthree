import { describe, expect, it } from 'vitest';
import { readSeasons, seasonsStale } from '../src/seasons.js';

describe('seasons.json', () => {
  const seasons = readSeasons();

  it('has unique ids, ISO starts with offsets, sorted by start', () => {
    expect(seasons.length).toBeGreaterThanOrEqual(1);
    const ids = new Set(seasons.map((s) => s.id));
    expect(ids.size).toBe(seasons.length);
    for (const s of seasons) {
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.start).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
      expect(Number.isNaN(Date.parse(s.start))).toBe(false);
    }
    for (let i = 1; i < seasons.length; i++) {
      expect(Date.parse(seasons[i]!.start)).toBeGreaterThan(Date.parse(seasons[i - 1]!.start));
    }
  });

  it('flags a list whose newest season is older than the given days', () => {
    const list = [{ id: 1, name: 'One', start: '2026-01-01T13:00:00-08:00' }];
    expect(seasonsStale(list, new Date('2026-03-01T00:00:00Z'), 90)).toBe(false);
    expect(seasonsStale(list, new Date('2026-04-15T00:00:00Z'), 90)).toBe(true);
    expect(seasonsStale([], new Date('2026-04-15T00:00:00Z'), 90)).toBe(true);
  });
});
