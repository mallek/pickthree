import { describe, expect, it } from 'vitest';
import {
  battlesInWindow,
  bucketBySeason,
  currentSeason,
  seasonListStale,
  seasonWindow,
} from '../../src/yourmeta/season.js';
import {
  teamKey,
  type BattleSet,
  type LoggedBattle,
  type Season,
} from '../../src/yourmeta/types.js';

const seasons: Season[] = [
  { id: 28, name: 'Twilight Trails', start: '2026-09-08T13:00:00-07:00' },
  { id: 29, name: 'Season 29', start: '2026-12-01T13:00:00-08:00' },
];

function battle(
  at: string,
  opponents: string[],
  result: 'win' | 'loss' | null = 'win',
): LoggedBattle {
  return { id: `b-${at}`, at, opponents, result, tanked: result === null };
}

function set(id: string, battles: LoggedBattle[], league = 'great'): BattleSet {
  return {
    id,
    league,
    startedAt: battles[0]?.at ?? '2026-09-10T00:00:00Z',
    team: { species: ['tinkaton', 'azumarill', 'corsola_galarian'] },
    battles,
    closed: battles.length >= 5,
  };
}

describe('currentSeason', () => {
  it('picks the last season that has started', () => {
    expect(currentSeason(seasons, new Date('2026-09-16T00:00:00Z'))?.id).toBe(28);
    expect(currentSeason(seasons, new Date('2026-12-02T00:00:00Z'))?.id).toBe(29);
  });
  it('is null before the first season or with an empty list', () => {
    expect(currentSeason(seasons, new Date('2026-09-01T00:00:00Z'))).toBeNull();
    expect(currentSeason([], new Date('2026-09-16T00:00:00Z'))).toBeNull();
  });
  it('treats the exact start instant as started', () => {
    expect(currentSeason(seasons, new Date('2026-09-08T20:00:00Z'))?.id).toBe(28);
  });
});

describe('seasonWindow', () => {
  const now = new Date('2026-09-16T00:00:00Z');
  it('starts at the season start with no fresh mark', () => {
    expect(seasonWindow(seasons, null, now)).toBe('2026-09-08T13:00:00-07:00');
  });
  it('uses the later of season start and fresh mark', () => {
    expect(seasonWindow(seasons, '2026-09-12T00:00:00.000Z', now)).toBe('2026-09-12T00:00:00.000Z');
    expect(seasonWindow(seasons, '2026-09-01T00:00:00.000Z', now)).toBe(
      '2026-09-08T13:00:00-07:00',
    );
  });
  it('is null when nothing bounds it', () => {
    expect(seasonWindow([], null, now)).toBeNull();
    expect(seasonWindow([], '2026-09-12T00:00:00.000Z', now)).toBe('2026-09-12T00:00:00.000Z');
  });
});

describe('battlesInWindow', () => {
  it('keeps battles at or after the window start across sets', () => {
    const sets = [
      set('a', [
        battle('2026-09-07T10:00:00Z', ['tinkaton']),
        battle('2026-09-09T10:00:00Z', ['azumarill']),
      ]),
      set('b', [battle('2026-09-10T10:00:00Z', ['clodsire'])]),
    ];
    const got = battlesInWindow(sets, '2026-09-08T13:00:00-07:00');
    expect(got.map((b) => b.opponents[0])).toEqual(['azumarill', 'clodsire']);
    expect(battlesInWindow(sets, null)).toHaveLength(3);
  });
});

describe('bucketBySeason', () => {
  const now = new Date('2026-09-16T00:00:00Z');
  it('splits current season from earlier ones and drops empty buckets', () => {
    const sets = [
      set('old', [battle('2026-08-20T10:00:00Z', ['medicham'])]),
      set('mixed', [
        battle('2026-09-07T10:00:00Z', ['tinkaton']),
        battle('2026-09-09T10:00:00Z', ['azumarill']),
      ]),
    ];
    const b = bucketBySeason(sets, seasons, null, now);
    expect(b.current.label).toBe('Twilight Trails');
    expect(b.current.sets.map((s) => s.id)).toEqual(['mixed']);
    expect(b.current.sets[0]?.battles).toHaveLength(1);
    expect(b.earlier).toHaveLength(1);
    expect(b.earlier[0]?.label).toBe('Before Twilight Trails');
    expect(b.earlier[0]?.sets.map((s) => s.id)).toEqual(['old', 'mixed']);
  });
  it('puts battles before a fresh mark into their own bucket', () => {
    const sets = [
      set('s', [
        battle('2026-09-09T10:00:00Z', ['tinkaton']),
        battle('2026-09-13T10:00:00Z', ['azumarill']),
      ]),
    ];
    const b = bucketBySeason(sets, seasons, '2026-09-12T00:00:00.000Z', now);
    expect(b.current.sets[0]?.battles.map((x) => x.opponents[0])).toEqual(['azumarill']);
    expect(b.earlier[0]?.label).toBe('Twilight Trails, before you started fresh');
    expect(b.earlier[0]?.sets[0]?.battles.map((x) => x.opponents[0])).toEqual(['tinkaton']);
  });
  it('with no season list everything is current', () => {
    const sets = [set('s', [battle('2020-01-01T00:00:00Z', ['tinkaton'])])];
    const b = bucketBySeason(sets, [], null, now);
    expect(b.current.label).toBe('All battles');
    expect(b.current.sets).toHaveLength(1);
    expect(b.earlier).toEqual([]);
  });
});

describe('seasonListStale', () => {
  it('is stale 100 days after the newest start, or with no list', () => {
    expect(seasonListStale(seasons, new Date('2027-01-01T00:00:00Z'))).toBe(false);
    expect(seasonListStale(seasons, new Date('2027-03-15T00:00:00Z'))).toBe(true);
    expect(seasonListStale([], new Date('2026-09-16T00:00:00Z'))).toBe(true);
  });
});

describe('teamKey', () => {
  it('is order independent', () => {
    expect(teamKey(['b', 'a', 'c'])).toBe(teamKey(['c', 'b', 'a']));
    expect(teamKey(['b', 'a', 'c'])).toBe('a+b+c');
  });
});
