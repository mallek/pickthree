import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  readSeasons,
  seasonsStale,
  mergeSeasons,
  writeSeasons,
  SEASONS_PATH,
} from '../src/seasons.js';

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

describe('mergeSeasons', () => {
  const listed = [
    { id: 28, name: 'Twilight Trails', start: '2026-09-08T13:00:00-07:00' },
    { id: 29, name: 'Season 29', start: '2026-12-01T13:00:00-08:00' },
  ];

  it('changes nothing for a season already listed by name', () => {
    expect(
      mergeSeasons(listed, [{ name: 'Twilight Trails', start: '2026-09-22T20:00:00.000Z' }]),
    ).toEqual(listed);
  });

  it('renames a placeholder that starts within a day of the new season', () => {
    expect(
      mergeSeasons(listed, [{ name: 'Frost Fair', start: '2026-12-01T21:00:00.000Z' }]),
    ).toEqual([listed[0], { id: 29, name: 'Frost Fair', start: '2026-12-01T13:00:00-08:00' }]);
  });

  it('appends an unlisted season with the next id and an offset time', () => {
    const only = [listed[0]!];
    expect(mergeSeasons(only, [{ name: 'Frost Fair', start: '2026-12-01T21:00:00.000Z' }])).toEqual(
      [listed[0], { id: 29, name: 'Frost Fair', start: '2026-12-01T21:00:00+00:00' }],
    );
  });

  it('never appends the same season twice', () => {
    const once = mergeSeasons(
      [listed[0]!],
      [{ name: 'Frost Fair', start: '2026-12-01T21:00:00.000Z' }],
    );
    expect(mergeSeasons(once, [{ name: 'Frost Fair', start: '2026-12-01T21:00:00.000Z' }])).toEqual(
      once,
    );
  });
});

describe('writeSeasons', () => {
  it('outputs byte-identical to the original seasons.json when given readSeasons output', () => {
    const original = fs.readFileSync(SEASONS_PATH, 'utf8');
    const seasons = readSeasons();
    const temp = path.join(os.tmpdir(), `seasons-${Date.now()}.json`);
    try {
      writeSeasons(seasons, temp);
      const written = fs.readFileSync(temp, 'utf8');
      expect(written).toBe(original);
    } finally {
      if (fs.existsSync(temp)) {
        fs.unlinkSync(temp);
      }
    }
  });

  it('supports round-trip with mergeSeasons', () => {
    const seasons = readSeasons();
    const merged = mergeSeasons(seasons, [
      { name: 'New Season', start: '2026-12-15T21:00:00.000Z' },
    ]);
    const temp = path.join(os.tmpdir(), `seasons-roundtrip-${Date.now()}.json`);
    try {
      writeSeasons(merged, temp);
      const reread = readSeasons(temp);
      expect(reread).toEqual(merged);
      expect(reread.some((s) => s.name === 'New Season')).toBe(true);
    } finally {
      if (fs.existsSync(temp)) {
        fs.unlinkSync(temp);
      }
    }
  });
});
