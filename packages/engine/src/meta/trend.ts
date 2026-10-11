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
