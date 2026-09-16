import { facingWeight, type MetaRank } from '../gamedata/metaRank.js';
import type { MetaEntry, RankingEntry } from '../gamedata/types.js';
import { blendWeights } from './blend.js';
import type { LoggedBattle } from './types.js';

export interface ProfileOptions {
  minBattles: number;
  /** Most recent counted battles that take part. */
  window: number;
  halfLife: number;
  maxOutsiders: number;
  minSightings: number;
}

export const DEFAULT_PROFILE_OPTIONS: ProfileOptions = {
  minBattles: 15,
  window: 150,
  halfLife: 30,
  maxOutsiders: 8,
  minSightings: 2,
};

export interface ProfileInput {
  /** Battles already windowed to the season for one league. */
  battles: LoggedBattle[];
  /** Matrix columns in matrix order. A species may appear twice (two movesets). */
  opponents: string[];
  ranks: Map<string, MetaRank>;
  /** The league's overall rankings: outsider movesets and legality. */
  rankings: RankingEntry[];
  blend: boolean;
}

export type ProfileReason = 'engaged' | 'off' | 'too-few';

export interface FacingProfile {
  /** Weight per matrix column id. */
  weights: Map<string, number>;
  /** Most-faced species with no matrix column, with their ranking moveset. */
  outsiders: MetaEntry[];
  outsiderWeights: Map<string, number>;
  /** Counted battles: not tanked, inside the window. */
  battles: number;
  /** Opponent slots filled across counted battles. */
  sightings: number;
  engaged: boolean;
  reason: ProfileReason;
}

/** Not tanked, most recent first, at most `window`. */
export function countedBattles(battles: LoggedBattle[], window: number): LoggedBattle[] {
  return battles
    .filter((b) => !b.tanked)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, window);
}

/** Battles each species appeared in. A species twice in one battle counts once. */
export function countSightings(battles: LoggedBattle[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const b of battles) {
    for (const id of new Set(b.opponents)) {
      out.set(id, (out.get(id) ?? 0) + 1);
    }
  }
  return out;
}

/** What recommend.ts built before the log existed: 1 / sqrt(rank) per column. */
export function plainWeights(
  opponents: string[],
  ranks: Map<string, MetaRank>,
): Map<string, number> {
  return new Map(
    opponents.map((id) => [id, facingWeight(ranks.get(id)?.overall ?? null)] as const),
  );
}

export function buildFacingProfile(
  input: ProfileInput,
  options: Partial<ProfileOptions> = {},
): FacingProfile {
  const opts: ProfileOptions = { ...DEFAULT_PROFILE_OPTIONS, ...options };
  const counted = countedBattles(input.battles, opts.window);
  const sightings = countSightings(counted);
  let total = 0;
  for (const n of sightings.values()) {
    total += n;
  }
  const plain = (reason: ProfileReason): FacingProfile => ({
    weights: plainWeights(input.opponents, input.ranks),
    outsiders: [],
    outsiderWeights: new Map(),
    battles: counted.length,
    sightings: total,
    engaged: false,
    reason,
  });
  if (!input.blend) {
    return plain('off');
  }
  if (counted.length < opts.minBattles) {
    return plain('too-few');
  }

  const matrixSpecies = [...new Set(input.opponents)];
  const inMatrix = new Set(matrixSpecies);
  const entryOf = new Map<string, RankingEntry>();
  for (const e of input.rankings) {
    if (!entryOf.has(e.speciesId)) {
      entryOf.set(e.speciesId, e);
    }
  }
  const rankOf = (id: string): number => input.ranks.get(id)?.overall ?? Number.MAX_SAFE_INTEGER;
  const outsiders: MetaEntry[] = [...sightings.entries()]
    .filter(([id, n]) => {
      const e = entryOf.get(id);
      return (
        !inMatrix.has(id) && n >= opts.minSightings && e !== undefined && e.moveset.length >= 2
      );
    })
    .sort((a, b) => b[1] - a[1] || rankOf(a[0]) - rankOf(b[0]) || a[0].localeCompare(b[0]))
    .slice(0, opts.maxOutsiders)
    .map(([id]) => {
      const e = entryOf.get(id) as RankingEntry;
      return {
        speciesId: id,
        fastMove: e.moveset[0] as string,
        chargedMoves: e.moveset.slice(1, 3),
      };
    });

  const species = [...matrixSpecies, ...outsiders.map((o) => o.speciesId)];
  const perSpecies = blendWeights(
    {
      species,
      ranks: new Map(species.map((id) => [id, input.ranks.get(id)?.overall ?? null] as const)),
      sightings,
      battles: counted.length,
    },
    { minBattles: opts.minBattles, halfLife: opts.halfLife },
  );
  return {
    weights: new Map(input.opponents.map((id) => [id, perSpecies.get(id) ?? 0] as const)),
    outsiders,
    outsiderWeights: new Map(
      outsiders.map((o) => [o.speciesId, perSpecies.get(o.speciesId) ?? 0] as const),
    ),
    battles: counted.length,
    sightings: total,
    engaged: true,
    reason: 'engaged',
  };
}

/** The assumptions sentence. `mode` is 'teams' (outsiders simulated) or 'counters' (counted only). */
export function facingLine(
  p: FacingProfile,
  mode: 'teams' | 'counters' = 'teams',
  minBattles: number = DEFAULT_PROFILE_OPTIONS.minBattles,
): string {
  if (p.reason === 'off') {
    return 'PvPoke weights only (your log is switched off)';
  }
  if (p.reason === 'too-few') {
    return `PvPoke weights only (${p.battles} of ${minBattles} battles logged)`;
  }
  const head = `Weighted by your log: ${p.battles} battles this season`;
  if (mode === 'counters') {
    return p.outsiders.length === 0
      ? `${head}, no opponents outside PvPoke's list`
      : `${head}; opponents outside PvPoke's list counted, not simulated`;
  }
  const n = p.outsiders.length;
  if (n === 0) {
    return `${head}, no opponents outside PvPoke's list`;
  }
  return `${head}, ${n} ${n === 1 ? 'opponent' : 'opponents'} outside PvPoke's list simulated`;
}
