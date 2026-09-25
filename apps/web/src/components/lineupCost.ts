import { sumCosts, type Cost, type TeamPick } from '@pickthree/engine';

export interface LineupCost {
  /** Your own Pokémon's build cost summed, or null when none has a known cost. */
  total: Cost | null;
  /** Species picks: not yours, so there is nothing of yours to power up. */
  notCaught: number;
  /** Your own Pokémon whose cost is not known yet (its verdict has not arrived). */
  unpriced: number;
  /** Your own Pokémon whose verdict came back without a cost (not eligible, or needs a rescan). */
  unbuildable: number;
}

/**
 * `costOf` answers undefined while a specimen's verdict has not arrived, and null once it has
 * arrived with no cost, so a verdict that can never be priced is not "not priced yet" forever.
 */
export function lineupCost(
  picks: readonly (TeamPick | null)[],
  costOf: (specimenId: string) => Cost | null | undefined,
): LineupCost {
  const priced: Cost[] = [];
  let notCaught = 0;
  let unpriced = 0;
  let unbuildable = 0;
  for (const p of picks) {
    if (!p) {
      continue;
    }
    if (p.kind === 'species') {
      notCaught += 1;
      continue;
    }
    const c = costOf(p.id);
    if (c) {
      priced.push(c);
    } else if (c === null) {
      unbuildable += 1;
    } else {
      unpriced += 1;
    }
  }
  return {
    total: priced.length > 0 ? sumCosts(priced) : null,
    notCaught,
    unpriced,
    unbuildable,
  };
}
