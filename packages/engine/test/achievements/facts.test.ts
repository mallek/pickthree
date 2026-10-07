import { describe, expect, it } from 'vitest';
import type { BattleSet, LoggedBattle, Season } from '../../src/yourmeta/types.js';
import { buildFacts, DAILY_CAP, streakOf, type FactsInput } from '../../src/achievements/facts.js';

/** Local noon on a day, plus minutes, as an ISO string. */
function at(y: number, m: number, d: number, min = 0): string {
  return new Date(y, m - 1, d, 12, min).toISOString();
}

function battle(id: string, when: string, tanked = false): LoggedBattle {
  return { id, at: when, opponents: [], result: tanked ? null : 'win', tanked };
}

function set(
  id: string,
  battles: LoggedBattle[],
  league = 'great',
  species = ['a', 'b', 'c'],
): BattleSet {
  return {
    id,
    league,
    startedAt: battles[0]?.at ?? at(2026, 9, 10),
    team: { species: species as [string, string, string] },
    battles,
    closed: battles.length >= 5,
  };
}

const SEASONS: Season[] = [
  { id: 28, name: 'S28', start: at(2026, 9, 1) },
  { id: 29, name: 'S29', start: at(2026, 12, 1) },
  { id: 30, name: 'S30', start: at(2027, 3, 1) },
];

function input(over: Partial<FactsInput>): FactsInput {
  return {
    sets: [],
    seasons: SEASONS,
    metaGroups: {},
    hasCollection: false,
    marks: [],
    now: new Date(at(2026, 9, 20)),
    ...over,
  };
}

describe('buildFacts', () => {
  it('counts at most 25 battles a day and never a tanked one', () => {
    const many = Array.from({ length: 40 }, (_, i) => battle(`b${i}`, at(2026, 9, 10, i)));
    const f = buildFacts(
      input({ sets: [set('s', [...many, battle('t', at(2026, 9, 11), true)])] }),
    );
    expect(f.countedBattles).toBe(DAILY_CAP);
    expect(f.distinctDays).toBe(1);
  });

  it('counts distinct local days', () => {
    const f = buildFacts(
      input({
        sets: [
          set('a', [battle('1', at(2026, 9, 10)), battle('2', at(2026, 9, 10, 30))]),
          set('b', [battle('3', at(2026, 9, 12))]),
        ],
      }),
    );
    expect(f.distinctDays).toBe(2);
  });

  it('marks a full set, a cup set and a meta set', () => {
    const five = Array.from({ length: 5 }, (_, i) => battle(`f${i}`, at(2026, 9, 10, i)));
    const f = buildFacts(
      input({
        sets: [
          set('full', five),
          set('cup', [battle('c', at(2026, 9, 11))], 'ultra', ['x', 'y', 'z']),
        ],
        metaGroups: { ultra: ['x', 'y', 'z', 'w'] },
      }),
    );
    expect(f.fullSet).toBe(true);
    expect(f.cupRunner).toBe(true);
    expect(f.metaPlayer).toBe(true);
  });

  it('does not count a meta set with only a tanked battle, or a league with no group', () => {
    const f = buildFacts(
      input({
        sets: [
          set('t', [battle('t', at(2026, 9, 10), true)], 'great', ['x', 'y', 'z']),
          set('n', [battle('n', at(2026, 9, 10))], 'little', ['x', 'y', 'z']),
        ],
        metaGroups: { great: ['x', 'y', 'z'] },
      }),
    );
    expect(f.metaPlayer).toBe(false);
  });

  it('unlocks Your meta at 15 counted battles in one league in one season', () => {
    const fourteen = Array.from({ length: 14 }, (_, i) => battle(`g${i}`, at(2026, 9, 10, i)));
    const one = [battle('u', at(2026, 9, 10, 50))];
    const f14 = buildFacts(input({ sets: [set('g', fourteen), set('u', one, 'ultra')] }));
    expect(f14.yourMetaStreak.best).toBe(0);
    expect(f14.bestLeagueSeasonBattles).toBe(14);
    const f15 = buildFacts(
      input({ sets: [set('g', [...fourteen, battle('g15', at(2026, 9, 11))])] }),
    );
    expect(f15.yourMetaStreak).toEqual({ best: 1, current: 1 });
    expect(f15.bestLeagueSeasonBattles).toBe(15);
  });

  it('keeps the best league-season total apart from other seasons and leagues', () => {
    const sep = Array.from({ length: 6 }, (_, i) => battle(`s${i}`, at(2026, 9, 10, i)));
    const dec = Array.from({ length: 8 }, (_, i) => battle(`d${i}`, at(2026, 12, 10, i)));
    const ultra = Array.from({ length: 3 }, (_, i) => battle(`u${i}`, at(2026, 9, 11, i)));
    const f = buildFacts(input({ sets: [set('s', sep), set('d', dec), set('u', ultra, 'ultra')] }));
    expect(f.bestLeagueSeasonBattles).toBe(8);
  });

  it('counts a plain Pokemon against a meta group that lists its Shadow, and the reverse', () => {
    const one = [battle('1', at(2026, 9, 10))];
    const plain = buildFacts(
      input({
        sets: [set('p', one, 'great', ['annihilape', 'b', 'c'])],
        metaGroups: { great: ['annihilape_shadow', 'b', 'c'] },
      }),
    );
    expect(plain.metaPlayer).toBe(true);
    const shadow = buildFacts(
      input({
        sets: [set('s', one, 'great', ['annihilape_shadow', 'b', 'c'])],
        metaGroups: { great: ['annihilape', 'b', 'c'] },
      }),
    );
    expect(shadow.metaPlayer).toBe(true);
  });

  it('keeps the streak alive before the first battle of a new season', () => {
    const sets = [
      set('a', [battle('1', at(2026, 9, 10))]),
      set('b', [battle('2', at(2026, 12, 10))]),
    ];
    expect(buildFacts(input({ sets, now: new Date(at(2026, 12, 20)) })).seasonStreak).toEqual({
      best: 2,
      current: 2,
    });
    expect(buildFacts(input({ sets, now: new Date(at(2027, 3, 5)) })).seasonStreak).toEqual({
      best: 2,
      current: 2,
    });
  });

  it('breaks the streak across a season with no battles', () => {
    const sets = [
      set('a', [battle('1', at(2026, 9, 10))]),
      set('c', [battle('3', at(2027, 3, 10))]),
    ];
    expect(buildFacts(input({ sets, now: new Date(at(2027, 3, 20)) })).seasonStreak).toEqual({
      best: 1,
      current: 1,
    });
  });

  it('survives no seasons and battles before the first season', () => {
    const sets = [set('a', [battle('1', at(2026, 8, 1))])];
    const none = buildFacts(input({ sets, seasons: [] }));
    expect(none.seasonStreak).toEqual({ best: 0, current: 0 });
    expect(none.distinctDays).toBe(1);
    const early = buildFacts(input({ sets, now: new Date(at(2026, 8, 2)) }));
    expect(early.seasonStreak).toEqual({ best: 0, current: 0 });
  });
});

describe('streakOf', () => {
  it('finds the longest run and the live one', () => {
    expect(streakOf(new Set([0, 1, 2, 5, 6]), 6)).toEqual({ best: 3, current: 2 });
    expect(streakOf(new Set([0, 1]), 2)).toEqual({ best: 2, current: 2 });
    expect(streakOf(new Set([0, 1]), 3)).toEqual({ best: 2, current: 0 });
    expect(streakOf(new Set(), null)).toEqual({ best: 0, current: 0 });
  });
});
