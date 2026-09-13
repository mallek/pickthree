import type { CostModifiers } from './powerup.js';

/** Stardust tier to candy. Tier 0 is a species with no second charged move to unlock (Smeargle). */
const TIERS: Record<number, number> = { 0: 0, 10000: 25, 50000: 50, 75000: 75, 100000: 100 };

export function secondMoveCost(
  thirdMoveCost: number,
  mods: CostModifiers,
): { stardust: number; candy: number } {
  const candy = TIERS[thirdMoveCost];
  if (candy === undefined) {
    throw new RangeError(`Unknown second move cost tier: ${thirdMoveCost}`);
  }
  let mult = 1;
  if (mods.shadow) {
    mult = 1.2;
  } else if (mods.purified) {
    mult = 0.8;
  }
  return { stardust: Math.round(thirdMoveCost * mult), candy: Math.round(candy * mult) };
}
