/**
 * Rank movement between two blended lists: where a species sits now against where it sat in a
 * baseline ordering (an earlier window, or PvPoke's prior alone). Places, not points: a species
 * that climbed from 7th to 5th gained two places, whatever its weight did.
 */

/** Species ids by blended weight, heaviest first, ties by id. The one order `rankSpecies` lists
 *  its rows in, so a trend computed off two of these compares like with like. */
export function blendedOrder(weights: ReadonlyMap<string, number>): string[] {
  return [...weights.keys()].sort(
    (a, b) => (weights.get(b) ?? 0) - (weights.get(a) ?? 0) || a.localeCompare(b),
  );
}

/**
 * Places moved, by species id: `baselineIndex - currentIndex`, so positive means it climbed and
 * negative means it fell. A species the baseline did not list gets no entry at all rather than a
 * made-up movement: it is new, not risen.
 */
export function rankTrend(
  current: readonly string[],
  baseline: readonly string[],
): Map<string, number> {
  const before = new Map<string, number>();
  baseline.forEach((id, i) => {
    if (!before.has(id)) {
      before.set(id, i);
    }
  });
  const out = new Map<string, number>();
  current.forEach((id, i) => {
    const was = before.get(id);
    if (was !== undefined && !out.has(id)) {
      out.set(id, was - i);
    }
  });
  return out;
}

/** One Spicy Pick: places climbed in the blended order and blended share gained. */
export interface TrendingPick {
  speciesId: string;
  places: number;
  gained: number;
}

/**
 * The species gaining ground: climbed at least one place and hold at least `minShare` of the
 * blend now, by share gained, ties by current rank, the first `limit`. Share rather than places,
 * because places reward noise at the bottom of the list (#180 to #120 is 60 places on a handful
 * of battles; #9 to #4 is the real story). A climber whose share dipped still counts; it sorts
 * below the ones that gained.
 */
export function trendingUp(
  order: readonly string[],
  trend: ReadonlyMap<string, number>,
  weights: ReadonlyMap<string, number>,
  baselineWeights: ReadonlyMap<string, number>,
  opts: { minShare?: number; limit?: number } = {},
): TrendingPick[] {
  const minShare = opts.minShare ?? 0.01;
  const limit = opts.limit ?? 5;
  const picks: (TrendingPick & { at: number })[] = [];
  order.forEach((speciesId, at) => {
    const places = trend.get(speciesId) ?? 0;
    const weight = weights.get(speciesId) ?? 0;
    if (places > 0 && weight >= minShare) {
      picks.push({ speciesId, places, gained: weight - (baselineWeights.get(speciesId) ?? 0), at });
    }
  });
  return picks
    .sort((a, b) => b.gained - a.gained || a.at - b.at)
    .slice(0, limit)
    .map(({ speciesId, places, gained }) => ({ speciesId, places, gained }));
}
