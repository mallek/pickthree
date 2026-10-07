import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '../../src/achievements/definitions.js';
import { EMPTY_ACHIEVEMENTS } from '../../src/achievements/types.js';
import { nearest, newlyEarned, nudgeLine, statusAll } from '../../src/achievements/evaluate.js';
import { YOUR_META_BATTLES, type AchievementFacts } from '../../src/achievements/facts.js';

function facts(over: Partial<AchievementFacts> = {}): AchievementFacts {
  return {
    hasCollection: false,
    marks: new Set(),
    countedBattles: 0,
    distinctDays: 0,
    fullSet: false,
    metaPlayer: false,
    cupRunner: false,
    seasonStreak: { best: 0, current: 0 },
    yourMetaStreak: { best: 0, current: 0 },
    bestLeagueSeasonBattles: 0,
    ...over,
  };
}

describe('the starter list', () => {
  it('has the eleven starter ids, each unique with a name and a how-to line', () => {
    expect(ACHIEVEMENTS.map((d) => d.id)).toEqual([
      'trainer',
      'first-battle',
      'full-set',
      'team-builder',
      'meta-player',
      'cup-runner',
      'days-10',
      'your-meta',
      'seasons-2',
      'your-meta-seasons-2',
      'seasons-3',
    ]);
    for (const d of ACHIEVEMENTS) {
      expect(d.name.length).toBeGreaterThan(0);
      expect(d.howTo.length).toBeGreaterThan(0);
    }
  });
});

describe('newlyEarned', () => {
  it('earns what the facts satisfy and skips what is already earned', () => {
    const f = facts({ hasCollection: true, countedBattles: 1, distinctDays: 1 });
    expect(newlyEarned(f, new Set()).map((d) => d.id)).toEqual(['trainer', 'first-battle']);
    expect(newlyEarned(f, new Set(['trainer'])).map((d) => d.id)).toEqual(['first-battle']);
  });

  it('earns Team builder from the analyzed mark', () => {
    const f = facts({ marks: new Set(['analyzed']) });
    expect(newlyEarned(f, new Set()).map((d) => d.id)).toEqual(['team-builder']);
  });

  it('earns season achievements on the best run, even when it has ended', () => {
    const f = facts({ seasonStreak: { best: 3, current: 0 }, countedBattles: 3, distinctDays: 3 });
    const ids = newlyEarned(f, new Set()).map((d) => d.id);
    expect(ids).toContain('seasons-2');
    expect(ids).toContain('seasons-3');
  });
});

describe('progress and the nudge', () => {
  it('shows the live run for a locked streak and full for an earned one', () => {
    const f = facts({ seasonStreak: { best: 1, current: 1 } });
    const byId = new Map(statusAll(f, new Set(['days-10'])).map((s) => [s.def.id, s]));
    expect(byId.get('seasons-3')).toMatchObject({ have: 1, need: 3, earned: false });
    expect(byId.get('days-10')).toMatchObject({ have: 10, need: 10, earned: true });
  });

  it('points at the closest locked one, never at a mark', () => {
    const f = facts({ distinctDays: 7, seasonStreak: { best: 1, current: 1 } });
    const earned = new Set(['trainer', 'first-battle', 'full-set', 'meta-player', 'cup-runner']);
    const n = nearest(f, earned);
    expect(n?.def.id).toBe('days-10');
    expect(nudgeLine(n!)).toBe('Next: Ten days. 3 more days.');
  });

  it('counts Your meta in battles toward the 15 in one league in a season', () => {
    const at14 = facts({ bestLeagueSeasonBattles: 14 });
    const s = statusAll(at14, new Set()).find((x) => x.def.id === 'your-meta');
    expect(s).toMatchObject({ have: 14, need: YOUR_META_BATTLES, earned: false });
    expect(YOUR_META_BATTLES).toBe(15);
    const earned = new Set(['trainer', 'first-battle', 'full-set', 'meta-player', 'cup-runner']);
    const n = nearest(facts({ bestLeagueSeasonBattles: 14, distinctDays: 3 }), earned);
    expect(n?.def.id).toBe('your-meta');
    expect(nudgeLine(n!)).toBe('Next: Your meta. 1 more battle.');
  });

  it('caps Your meta progress at the 15 and earns it there', () => {
    const f = facts({ bestLeagueSeasonBattles: 40, yourMetaStreak: { best: 1, current: 1 } });
    const s = statusAll(f, new Set()).find((x) => x.def.id === 'your-meta');
    expect(s).toMatchObject({ have: 15, need: 15 });
    expect(newlyEarned(f, new Set()).map((d) => d.id)).toContain('your-meta');
  });

  it('words a one-step nudge with its how-to line', () => {
    const n = nearest(facts(), new Set());
    expect(n?.def.id).toBe('trainer');
    expect(nudgeLine(n!)).toBe('Next: Trainer. Import your collection or add a Pokémon by hand.');
  });

  it('is null when everything is earned', () => {
    expect(nearest(facts(), new Set(ACHIEVEMENTS.map((d) => d.id)))).toBeNull();
  });
});

describe('EMPTY_ACHIEVEMENTS', () => {
  it('is frozen, arrays and all, so a caller cannot change the shared record', () => {
    expect(Object.isFrozen(EMPTY_ACHIEVEMENTS)).toBe(true);
    expect(Object.isFrozen(EMPTY_ACHIEVEMENTS.earned)).toBe(true);
    expect(Object.isFrozen(EMPTY_ACHIEVEMENTS.marks)).toBe(true);
    expect(() => EMPTY_ACHIEVEMENTS.marks.push('analyzed')).toThrow();
    expect(EMPTY_ACHIEVEMENTS).toEqual({ earned: [], marks: [] });
  });
});
