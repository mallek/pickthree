import { facingWeight } from '../gamedata/metaRank.js';
import { bucketBySeason, type SeasonBucket } from './season.js';
import { teamKey, type BattleSet, type LoggedBattle, type Season, type TeamRef } from './types.js';

export interface SpeciesRecord {
  speciesId: string;
  /** Non-tanked battles it appeared in. */
  faced: number;
  wins: number;
  losses: number;
}

export interface TeamRecord {
  team: TeamRef;
  key: string;
  battles: number;
  wins: number;
  losses: number;
}

export interface SeasonStats {
  label: string;
  battles: number;
  sightings: number;
  /** Most faced first, then most losses. */
  species: SpeciesRecord[];
  /** Most battles first. */
  teams: TeamRecord[];
}

export interface YourMetaStats {
  current: SeasonStats;
  earlier: SeasonStats[];
  /** Distinct species faced, newest first, padded with the fallback up to the limit. */
  recent: string[];
  openSet: BattleSet | null;
}

export interface StatsInput {
  /** Every set for one league, any season. */
  sets: BattleSet[];
  seasons: Season[];
  freshFrom: string | null;
  /** Pads the recent list: the meta group by rank, so a full grid is always one tap away. */
  fallback: string[];
  now?: Date;
}

/** Three rows of five on the Log a battle grid; the grid scrolls only while searching. */
export const RECENT_LIMIT = 15;

function seasonStats(bucket: SeasonBucket): SeasonStats {
  const species = new Map<string, SpeciesRecord>();
  const teams = new Map<string, TeamRecord>();
  let battles = 0;
  let sightings = 0;
  for (const s of bucket.sets) {
    const key = teamKey(s.team.species);
    let t = teams.get(key);
    if (!t) {
      t = { team: s.team, key, battles: 0, wins: 0, losses: 0 };
      teams.set(key, t);
    }
    for (const b of s.battles) {
      if (b.tanked) {
        continue;
      }
      battles += 1;
      t.battles += 1;
      if (b.result === 'win') {
        t.wins += 1;
      } else if (b.result === 'loss') {
        t.losses += 1;
      }
      for (const id of new Set(b.opponents)) {
        sightings += 1;
        let r = species.get(id);
        if (!r) {
          r = { speciesId: id, faced: 0, wins: 0, losses: 0 };
          species.set(id, r);
        }
        r.faced += 1;
        if (b.result === 'win') {
          r.wins += 1;
        } else if (b.result === 'loss') {
          r.losses += 1;
        }
      }
    }
  }
  return {
    label: bucket.label,
    battles,
    sightings,
    species: [...species.values()].sort(
      (a, b) => b.faced - a.faced || b.losses - a.losses || a.speciesId.localeCompare(b.speciesId),
    ),
    teams: [...teams.values()].sort((a, b) => b.battles - a.battles || a.key.localeCompare(b.key)),
  };
}

/** A rank 1 meta species is worth this many fresh sightings on the recent grid. */
export const RECENT_PRIOR_SCALE = 5;
/** A sighting counts half as much after this many later battles. */
export const RECENT_HALF_LIFE = 40;

/**
 * The opponents most worth one tap on Log a battle, best first: PvPoke's facing weight for the
 * species' rank (scaled so rank 1 equals five sightings, rank 9 two, rank 25 one, unranked
 * nothing) plus your own sightings, each fading with a half-life of RECENT_HALF_LIFE battles.
 * One sighting of something off-meta does not push a top-15 meta species out; two or three
 * recent ones do, and a rank 1 species needs five to be displaced.
 *
 * `fallback` is the meta group by rank; `ranks` gives overall ranks for anything ranked, and
 * a species missing from it takes its position in `fallback`, or counts as unranked.
 */
export function recentOpponents(
  sets: BattleSet[],
  fallback: string[],
  limit: number,
  ranks?: Record<string, number | null>,
): string[] {
  const all: LoggedBattle[] = [];
  for (const s of sets) {
    all.push(...s.battles);
  }
  all.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const rankOf = (id: string): number | null => {
    const r = ranks?.[id];
    if (typeof r === 'number') {
      return r;
    }
    const i = fallback.indexOf(id);
    return i >= 0 ? i + 1 : null;
  };
  const score = new Map<string, number>();
  for (const id of fallback) {
    const rank = rankOf(id);
    score.set(id, rank === null ? 0 : RECENT_PRIOR_SCALE * facingWeight(rank));
  }
  all.forEach((b, age) => {
    const w = Math.pow(0.5, age / RECENT_HALF_LIFE);
    for (const id of b.opponents) {
      if (!score.has(id)) {
        const rank = rankOf(id);
        score.set(id, rank === null ? 0 : RECENT_PRIOR_SCALE * facingWeight(rank));
      }
      score.set(id, (score.get(id) as number) + w);
    }
  });
  return [...score.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([id]) => id);
}

export function yourMetaStats(input: StatsInput): YourMetaStats {
  const now = input.now ?? new Date();
  const buckets = bucketBySeason(input.sets, input.seasons, input.freshFrom, now);
  return {
    current: seasonStats(buckets.current),
    earlier: buckets.earlier.map(seasonStats),
    recent: recentOpponents(input.sets, input.fallback, RECENT_LIMIT),
    openSet: input.sets.find((s) => !s.closed) ?? null,
  };
}
