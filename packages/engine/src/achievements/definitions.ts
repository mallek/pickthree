import type { AchievementFacts } from './facts.js';
import type { AchievementTier } from './types.js';

export interface AchievementDef {
  /** Permanent: never reused or renumbered. */
  id: string;
  name: string;
  /** How to earn it, as one line on the page. */
  howTo: string;
  tier: AchievementTier;
  /** Earned from an event mark rather than the log; the nudge never points at it. */
  mark?: string;
  /** Singular and plural unit for the nudge's "N more" line, on counted achievements. */
  unit?: readonly [string, string];
  test(f: AchievementFacts): boolean;
  progress(f: AchievementFacts): { have: number; need: number };
}

type Base = Pick<AchievementDef, 'id' | 'name' | 'howTo' | 'tier'>;

/** A one-step achievement: done or not. */
function step(base: Base, test: (f: AchievementFacts) => boolean, mark?: string): AchievementDef {
  return {
    ...base,
    ...(mark !== undefined ? { mark } : {}),
    test,
    progress: (f) => ({ have: test(f) ? 1 : 0, need: 1 }),
  };
}

/** Battles logged on `n` different days. */
export function distinctDays(n: number, base: Base): AchievementDef {
  return {
    ...base,
    unit: ['day', 'days'],
    test: (f) => f.distinctDays >= n,
    progress: (f) => ({ have: Math.min(f.distinctDays, n), need: n }),
  };
}

/** Battles logged in `n` seasons in a row. Progress shows the run alive now. */
export function seasonStreak(n: number, base: Base): AchievementDef {
  return {
    ...base,
    unit: ['season', 'seasons'],
    test: (f) => f.seasonStreak.best >= n,
    progress: (f) => ({
      have: f.seasonStreak.best >= n ? n : Math.min(f.seasonStreak.current, n),
      need: n,
    }),
  };
}

/** Your meta unlocked in `n` seasons in a row. */
export function yourMetaStreak(n: number, base: Base): AchievementDef {
  return {
    ...base,
    unit: ['season', 'seasons'],
    test: (f) => f.yourMetaStreak.best >= n,
    progress: (f) => ({
      have: f.yourMetaStreak.best >= n ? n : Math.min(f.yourMetaStreak.current, n),
      need: n,
    }),
  };
}

/** The list, in page order. Add an entry (and a test) to add an achievement. */
export const ACHIEVEMENTS: readonly AchievementDef[] = [
  step(
    {
      id: 'trainer',
      name: 'Trainer',
      howTo: 'Import your collection or add a Pokemon by hand',
      tier: 'easy',
    },
    (f) => f.hasCollection,
  ),
  step(
    { id: 'first-battle', name: 'First battle', howTo: 'Log one battle', tier: 'easy' },
    (f) => f.countedBattles >= 1,
  ),
  step(
    { id: 'full-set', name: 'Full set', howTo: 'Log a complete set of 5', tier: 'easy' },
    (f) => f.fullSet,
  ),
  step(
    { id: 'team-builder', name: 'Team builder', howTo: 'Analyze a team in Build', tier: 'easy' },
    (f) => f.marks.has('analyzed'),
    'analyzed',
  ),
  step(
    {
      id: 'meta-player',
      name: 'Meta player',
      howTo: "Log a set with all three in the league's meta group",
      tier: 'mid',
    },
    (f) => f.metaPlayer,
  ),
  step(
    { id: 'cup-runner', name: 'Cup runner', howTo: 'Log a set outside Great League', tier: 'mid' },
    (f) => f.cupRunner,
  ),
  distinctDays(10, {
    id: 'days-10',
    name: 'Ten days',
    howTo: 'Log battles on 10 different days',
    tier: 'mid',
  }),
  step(
    {
      id: 'your-meta',
      name: 'Your meta',
      howTo: 'Log 15 battles in one league in a season',
      tier: 'mid',
    },
    (f) => f.yourMetaStreak.best >= 1,
  ),
  seasonStreak(2, {
    id: 'seasons-2',
    name: 'Back again',
    howTo: 'Log in 2 seasons in a row',
    tier: 'hard',
  }),
  yourMetaStreak(2, {
    id: 'your-meta-seasons-2',
    name: 'Still reading',
    howTo: 'Unlock Your meta in 2 seasons in a row',
    tier: 'hard',
  }),
  seasonStreak(3, {
    id: 'seasons-3',
    name: 'Three-peat',
    howTo: 'Log in 3 seasons in a row',
    tier: 'elite',
  }),
];
