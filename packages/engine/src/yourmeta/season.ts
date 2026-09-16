import type { BattleSet, LoggedBattle, Season } from './types.js';

export const SEASON_STALE_DAYS = 100;

function ms(iso: string): number {
  return Date.parse(iso);
}

function byStart(seasons: Season[]): Season[] {
  return [...seasons].sort((a, b) => ms(a.start) - ms(b.start));
}

/** The last season whose start is at or before now, or null. */
export function currentSeason(seasons: Season[], now: Date = new Date()): Season | null {
  let cur: Season | null = null;
  for (const s of byStart(seasons)) {
    if (ms(s.start) <= now.getTime()) {
      cur = s;
    }
  }
  return cur;
}

/**
 * The ISO time from which battles count as "this season": the later of the season start and
 * the player's fresh mark. Null when nothing bounds it.
 */
export function seasonWindow(
  seasons: Season[],
  freshFrom: string | null,
  now: Date = new Date(),
): string | null {
  const cur = currentSeason(seasons, now);
  const candidates = [cur?.start ?? null, freshFrom].filter((x): x is string => x !== null);
  if (candidates.length === 0) {
    return null;
  }
  return candidates.reduce((a, b) => (ms(b) > ms(a) ? b : a));
}

/** Every battle across the sets at or after `from`, in set order then battle order. */
export function battlesInWindow(sets: BattleSet[], from: string | null): LoggedBattle[] {
  const lo = from === null ? null : ms(from);
  const out: LoggedBattle[] = [];
  for (const s of sets) {
    for (const b of s.battles) {
      if (lo === null || ms(b.at) >= lo) {
        out.push(b);
      }
    }
  }
  return out;
}

export interface SeasonBucket {
  label: string;
  /** Sets with only the battles that fall in this bucket. Sets with none are left out. */
  sets: BattleSet[];
}

function slice(sets: BattleSet[], lo: number | null, hi: number | null): BattleSet[] {
  return sets
    .map((s) => ({
      ...s,
      battles: s.battles.filter((b) => {
        const t = ms(b.at);
        return (lo === null || t >= lo) && (hi === null || t < hi);
      }),
    }))
    .filter((s) => s.battles.length > 0);
}

/**
 * Current season first, then earlier buckets newest first: the part of this season before a
 * fresh mark, each earlier listed season, and everything before the oldest listed season.
 */
export function bucketBySeason(
  sets: BattleSet[],
  seasons: Season[],
  freshFrom: string | null,
  now: Date = new Date(),
): { current: SeasonBucket; earlier: SeasonBucket[] } {
  const sorted = byStart(seasons);
  const cur = currentSeason(sorted, now);
  const from = seasonWindow(sorted, freshFrom, now);
  const fromT = from === null ? null : ms(from);
  const current: SeasonBucket = {
    label: cur ? cur.name : 'All battles',
    sets: slice(sets, fromT, null),
  };
  const earlier: SeasonBucket[] = [];
  if (cur && fromT !== null && fromT > ms(cur.start)) {
    earlier.push({
      label: `${cur.name}, before you started fresh`,
      sets: slice(sets, ms(cur.start), fromT),
    });
  }
  const past = cur ? sorted.filter((s) => ms(s.start) < ms(cur.start)).reverse() : [];
  let hi: number | null = cur ? ms(cur.start) : fromT;
  for (const s of past) {
    earlier.push({ label: s.name, sets: slice(sets, ms(s.start), hi) });
    hi = ms(s.start);
  }
  if (hi !== null) {
    const oldest = past[past.length - 1] ?? cur;
    earlier.push({
      label: oldest ? `Before ${oldest.name}` : 'Before you started fresh',
      sets: slice(sets, null, hi),
    });
  }
  return { current, earlier: earlier.filter((b) => b.sets.length > 0) };
}

/** True when the newest listed season started more than SEASON_STALE_DAYS ago, or no list. */
export function seasonListStale(seasons: Season[], now: Date = new Date()): boolean {
  const sorted = byStart(seasons);
  const newest = sorted[sorted.length - 1];
  if (!newest) {
    return true;
  }
  return now.getTime() - ms(newest.start) > SEASON_STALE_DAYS * 86_400_000;
}
