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

export const RECENT_LIMIT = 20;

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

export function recentOpponents(sets: BattleSet[], fallback: string[], limit: number): string[] {
  const all: LoggedBattle[] = [];
  for (const s of sets) {
    all.push(...s.battles);
  }
  all.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const b of all) {
    for (const id of b.opponents) {
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
        if (out.length >= limit) {
          return out;
        }
      }
    }
  }
  // Pad with the most common meta species not already listed, so the grid is always full and
  // the next opponent is more likely to be one tap away.
  for (const id of fallback) {
    if (out.length >= limit) {
      break;
    }
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
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
