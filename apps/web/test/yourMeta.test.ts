import type { BattleSet } from '@pickthree/engine';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/storage/db.ts';
import { newId, yourMetaFrom } from '../src/state/yourMeta.ts';

const seasons = [{ id: 28, name: 'Twilight Trails', start: '2026-09-08T13:00:00-07:00' }];
const sets: BattleSet[] = [
  {
    id: 's',
    league: 'great',
    startedAt: '2026-09-01T00:00:00Z',
    team: { species: ['a', 'b', 'c'] },
    battles: [
      { id: '1', at: '2026-09-01T10:00:00Z', opponents: ['x'], result: 'win', tanked: false },
      { id: '2', at: '2026-09-10T10:00:00Z', opponents: ['y'], result: 'win', tanked: false },
      { id: '3', at: '2026-09-14T10:00:00Z', opponents: ['z'], result: 'win', tanked: false },
    ],
    closed: false,
  },
];
const now = new Date('2026-09-16T00:00:00Z');

describe('yourMetaFrom', () => {
  it('windows to the season and reads the switch', () => {
    const m = yourMetaFrom(sets, seasons, DEFAULT_SETTINGS, 'great', now);
    expect(m.battles.map((b) => b.id)).toEqual(['2', '3']);
    expect(m.blend).toBe(true);
  });
  it('honours a fresh mark for the league only', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      yourMeta: { blend: false, freshFrom: { great: '2026-09-12T00:00:00Z' } },
    };
    expect(yourMetaFrom(sets, seasons, settings, 'great', now).battles.map((b) => b.id)).toEqual([
      '3',
    ]);
    expect(yourMetaFrom(sets, seasons, settings, 'ultra', now).battles.map((b) => b.id)).toEqual([
      '2',
      '3',
    ]);
    expect(yourMetaFrom(sets, seasons, settings, 'great', now).blend).toBe(false);
  });
});

describe('newId', () => {
  it('is unique', () => {
    expect(newId()).not.toBe(newId());
  });
});
