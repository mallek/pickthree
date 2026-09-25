import { sumCosts, type Cost, type TeamPick } from '@pickthree/engine';

export interface LineupCost {
  /** Your own Pokémon's build cost summed, or null when none has a known cost. */
  total: Cost | null;
  /** Species picks: not yours, so there is nothing of yours to power up. */
  notCaught: number;
  /** Your own Pokémon whose cost is not known yet (its verdict has not arrived). */
  unpriced: number;
}

export function lineupCost(
  picks: readonly (TeamPick | null)[],
  costOf: (specimenId: string) => Cost | null,
): LineupCost {
  const priced: Cost[] = [];
  let notCaught = 0;
  let unpriced = 0;
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
    } else {
      unpriced += 1;
    }
  }
  return { total: priced.length > 0 ? sumCosts(priced) : null, notCaught, unpriced };
}
