import { describe, expect, it } from 'vitest';
import type { League } from '@pickthree/engine';
import { seasonsFor } from '../src/state/seasonsFor.ts';
import { GREAT } from './fakeHost.ts';

const RETRO: League = {
  ...GREAT,
  id: 'retro',
  title: 'Retro Cup',
  short: 'Retro',
  cup: 'retro',
  kind: 'rotation',
};
const SEASONS = [{ id: 28, name: 'Twilight Trails', start: '2026-09-08T13:00:00-07:00' }];
const data = {
  leagues: [GREAT, RETRO],
  seasons: SEASONS,
  schedule: [
    {
      league: 'retro',
      cup: 'retro',
      cp: 1500,
      title: 'Retro Cup',
      start: '2026-09-22T20:00:00.000Z',
      end: '2026-09-29T20:00:00.000Z',
      season: 'Twilight Trails',
    },
  ],
};

describe('seasonsFor', () => {
  it('gives an open league the GBL seasons', () => {
    expect(seasonsFor(data, 'great')).toBe(SEASONS);
  });

  it("gives a cup its runs, so the window starts at the run's start", () => {
    expect(seasonsFor(data, 'retro')).toEqual([
      { id: -1, name: 'Retro Cup, Sep 22', start: '2026-09-22T20:00:00.000Z' },
    ]);
  });

  it('is empty before data loads', () => {
    expect(seasonsFor(null, 'retro')).toEqual([]);
  });
});
