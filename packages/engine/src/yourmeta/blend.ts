import { facingWeight } from '../gamedata/metaRank.js';

export interface BlendOptions {
  /** Below this many counted battles the log has no say. */
  minBattles: number;
  /** Battles at which the log and PvPoke's prior have an equal say. */
  halfLife: number;
  /**
   * Replaces the battle-count curve when the caller works the share out itself. meta.pick3.gg
   * caps the battle curve on contributing devices as well, which a battle count alone cannot
   * express; rather than keep a second copy of this formula there, it hands the answer in.
   * Clamped to 0..1.
   */
  share?: number;
  /**
   * Prior weight for a species with no PvPoke rank. Defaults to facingWeight(null), the rank-64
   * floor, which is right on device where it stops an unranked opponent vanishing. Pass 0 where
   * an unlisted species must ride entirely on how often it was actually measured, or the floor
   * would seat a never-listed species above genuinely listed ones near rank 64.
   */
  unrankedPrior?: number;
}

export const DEFAULT_BLEND_OPTIONS: BlendOptions = { minBattles: 15, halfLife: 30 };

/** The log's share of the say: 0 below the threshold, a third at 15, half at 30, two thirds at 60.
 *  An explicit `share` wins over the curve entirely. */
export function blendShare(battles: number, opts: BlendOptions = DEFAULT_BLEND_OPTIONS): number {
  if (opts.share !== undefined) {
    return Math.max(0, Math.min(1, opts.share));
  }
  if (battles < opts.minBattles) {
    return 0;
  }
  return battles / (battles + opts.halfLife);
}

export interface BlendInput {
  /** The species that get a weight. Duplicates are not expected. */
  species: string[];
  /** PvPoke overall rank per species, null when unranked. */
  ranks: Map<string, number | null>;
  /** Battles each species appeared in. Species outside `species` are ignored. */
  sightings: Map<string, number>;
  /** Counted (non-tanked, windowed) battles. */
  battles: number;
}

/**
 * weight_i = (1 - a) * prior_i + a * observed_i, where prior is PvPoke's 1 / sqrt(rank)
 * normalised over the set, observed is the sighting share over the set, and a is blendShare.
 * Weights sum to 1 when the log has a say (a > 0) and at least one species in the set was
 * sighted; with a > 0 and no sightings in the set they sum to (1 - a) instead. Consumers
 * normalise, so scoring is unaffected.
 */
export function blendWeights(
  input: BlendInput,
  opts: BlendOptions = DEFAULT_BLEND_OPTIONS,
): Map<string, number> {
  const a = blendShare(input.battles, opts);
  const priors = input.species.map((id) => {
    const rank = input.ranks.get(id) ?? null;
    if (rank === null && opts.unrankedPrior !== undefined) {
      return opts.unrankedPrior;
    }
    return facingWeight(rank);
  });
  const priorSum = priors.reduce((x, y) => x + y, 0);
  let seen = 0;
  for (const id of input.species) {
    seen += input.sightings.get(id) ?? 0;
  }
  const out = new Map<string, number>();
  input.species.forEach((id, i) => {
    const prior = priorSum === 0 ? 0 : (priors[i] as number) / priorSum;
    const observed = seen === 0 ? 0 : (input.sightings.get(id) ?? 0) / seen;
    out.set(id, (1 - a) * prior + a * observed);
  });
  return out;
}
