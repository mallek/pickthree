/**
 * Spicy Picks: species players run more than PvPoke expects. The blend against PvPoke's prior in
 * the same window, not a trend: most leagues are rotation cups that last a week, so there is no
 * earlier stretch to compare with, and the blend already weighs measured play by how much of it
 * there is, so a league with few battles shows few picks or none.
 */

/** One Spicy Pick: blended share above PvPoke's prior, and whether PvPoke lists it at all. */
export interface SpicyPick {
  speciesId: string;
  above: number;
  offMeta: boolean;
}

/**
 * Outside the first `skipTop` of the blended order (those are the meta, not spicy), at least
 * `minShare` of the blend, and above PvPoke's prior share: by how far above, ties by current rank,
 * the first `limit`. A species PvPoke's group does not list has a prior of 0 and is off meta.
 */
export function spicyPicks(
  order: readonly string[],
  weights: ReadonlyMap<string, number>,
  priorWeights: ReadonlyMap<string, number>,
  opts: { minShare?: number; skipTop?: number; limit?: number } = {},
): SpicyPick[] {
  const minShare = opts.minShare ?? 0.01;
  const skipTop = opts.skipTop ?? 10;
  const limit = opts.limit ?? 5;
  const picks: (SpicyPick & { at: number })[] = [];
  order.forEach((speciesId, at) => {
    const weight = weights.get(speciesId) ?? 0;
    const prior = priorWeights.get(speciesId);
    const above = weight - (prior ?? 0);
    if (at >= skipTop && weight >= minShare && above > 0) {
      picks.push({ speciesId, above, offMeta: !prior, at });
    }
  });
  return picks
    .sort((a, b) => b.above - a.above || a.at - b.at)
    .slice(0, limit)
    .map(({ speciesId, above, offMeta }) => ({ speciesId, above, offMeta }));
}
