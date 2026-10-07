import { SET_SIZE, type BattleSet, type LoggedBattle, type Season } from '../yourmeta/types.js';

/** At most this many battles count per day: GO's five sets of five. */
export const DAILY_CAP = 25;
/** Battles in one league within one season that unlock Your meta (the blend's minBattles). */
export const YOUR_META_BATTLES = 15;

export interface FactsInput {
  /** Every set in every league. */
  sets: readonly BattleSet[];
  seasons: readonly Season[];
  /** League id to the species ids of that league's meta group. A missing league has none. */
  metaGroups: Readonly<Record<string, readonly string[]>>;
  /** True when the phone holds at least one Pokemon (imported or added by hand). */
  hasCollection: boolean;
  marks: readonly string[];
  now: Date;
}

/** A run of consecutive seasons: the longest ever and the one alive now. */
export interface Streak {
  best: number;
  current: number;
}

export interface AchievementFacts {
  hasCollection: boolean;
  marks: ReadonlySet<string>;
  /** Battles that count, after the daily cap. Tanked battles never count. */
  countedBattles: number;
  /** Local calendar days with at least one counted battle. */
  distinctDays: number;
  /** Some set holds five battles (tanked ones included: the set was played). */
  fullSet: boolean;
  /** Some set with a counted battle has all three of its team in its league's meta group. */
  metaPlayer: boolean;
  /** Some set with a counted battle is outside Great League. */
  cupRunner: boolean;
  /** Seasons with at least one counted battle. */
  seasonStreak: Streak;
  /** Seasons where Your meta unlocked in some league. */
  yourMetaStreak: Streak;
}

/** The device's local calendar date of an ISO time. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/**
 * The longest run of consecutive indices in `hit`, and the run counting back from `currentIdx`.
 * If the current season has no hit yet, the run ending at the season before it is still alive.
 */
export function streakOf(hit: ReadonlySet<number>, currentIdx: number | null): Streak {
  let best = 0;
  for (const i of hit) {
    if (!hit.has(i - 1)) {
      let n = 1;
      while (hit.has(i + n)) {
        n += 1;
      }
      best = Math.max(best, n);
    }
  }
  let current = 0;
  if (currentIdx !== null) {
    let i = hit.has(currentIdx) ? currentIdx : currentIdx - 1;
    while (hit.has(i)) {
      current += 1;
      i -= 1;
    }
  }
  return { best, current };
}

interface Counted {
  battle: LoggedBattle;
  league: string;
}

/** Non-tanked battles, at most DAILY_CAP per local day, the earliest of each day kept. */
function capped(sets: readonly BattleSet[]): Counted[] {
  const all: Counted[] = [];
  for (const s of sets) {
    for (const b of s.battles) {
      if (!b.tanked) {
        all.push({ battle: b, league: s.league });
      }
    }
  }
  all.sort((a, b) => Date.parse(a.battle.at) - Date.parse(b.battle.at));
  const perDay = new Map<string, number>();
  const out: Counted[] = [];
  for (const c of all) {
    const k = dayKey(c.battle.at);
    const n = perDay.get(k) ?? 0;
    if (n < DAILY_CAP) {
      perDay.set(k, n + 1);
      out.push(c);
    }
  }
  return out;
}

/** Index into `sorted` of the latest season starting at or before `t`, or null before them all. */
function seasonIndex(sorted: readonly Season[], t: number): number | null {
  let idx: number | null = null;
  sorted.forEach((s, i) => {
    if (Date.parse(s.start) <= t) {
      idx = i;
    }
  });
  return idx;
}

export function buildFacts(input: FactsInput): AchievementFacts {
  const sorted = [...input.seasons].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const counted = capped(input.sets);
  const days = new Set(counted.map((c) => dayKey(c.battle.at)));
  const logged = new Set<number>();
  const perSeasonLeague = new Map<string, number>();
  const yourMeta = new Set<number>();
  for (const c of counted) {
    const idx = seasonIndex(sorted, Date.parse(c.battle.at));
    if (idx === null) {
      continue;
    }
    logged.add(idx);
    const key = `${idx}|${c.league}`;
    const n = (perSeasonLeague.get(key) ?? 0) + 1;
    perSeasonLeague.set(key, n);
    if (n >= YOUR_META_BATTLES) {
      yourMeta.add(idx);
    }
  }
  const played = input.sets.filter((s) => s.battles.some((b) => !b.tanked));
  const inGroup = (s: BattleSet): boolean => {
    const group = input.metaGroups[s.league];
    return group !== undefined && s.team.species.every((id) => group.includes(id));
  };
  const currentIdx = seasonIndex(sorted, input.now.getTime());
  return {
    hasCollection: input.hasCollection,
    marks: new Set(input.marks),
    countedBattles: counted.length,
    distinctDays: days.size,
    fullSet: input.sets.some((s) => s.battles.length >= SET_SIZE),
    metaPlayer: played.some(inGroup),
    cupRunner: played.some((s) => s.league !== 'great'),
    seasonStreak: streakOf(logged, currentIdx),
    yourMetaStreak: streakOf(yourMeta, currentIdx),
  };
}
