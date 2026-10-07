import { KANTO } from './kanto.js';
import type { AchievementTier } from './types.js';

/** Chance of a shiny for a roll in this tier at this season streak. */
export function shinyOdds(tier: AchievementTier, streak: number): number {
  if (tier === 'top') {
    return 1 / 3;
  }
  if (streak >= 3) {
    return 1 / 5;
  }
  if (streak >= 2) {
    return 1 / 10;
  }
  return 1 / 20;
}

const ORDER: readonly AchievementTier[] = ['easy', 'mid', 'hard', 'elite'];

/**
 * The tiers to try, in order, when a pool may be empty: the tier itself, then the nearest tiers
 * below it, then the nearest above it. Top is only ever tried as itself.
 */
export function fallbackOrder(tier: AchievementTier): AchievementTier[] {
  if (tier === 'top') {
    return ['top', 'elite', 'hard', 'mid', 'easy'];
  }
  const i = ORDER.indexOf(tier);
  const below = ORDER.slice(0, i).reverse();
  const above = ORDER.slice(i + 1);
  return [tier, ...below, ...above];
}

function pick<T>(items: readonly T[], rng: () => number): T {
  const i = Math.min(items.length - 1, Math.floor(rng() * items.length));
  return items[i] as T;
}

/**
 * The Pokemon an achievement hands out: a uniform pick from its tier's Kanto pool minus what the
 * player already holds, falling back through `fallbackOrder` when a pool is empty. If every pool
 * is empty it repeats a species from its own tier rather than fail. `rng` returns [0, 1); the
 * species is drawn first, then the shiny.
 */
export function roll(
  tier: AchievementTier,
  owned: ReadonlySet<string>,
  streak: number,
  rng: () => number,
): { species: string; shiny: boolean } {
  let species: string | null = null;
  for (const t of fallbackOrder(tier)) {
    const pool = KANTO.filter((k) => k.tier === t && !owned.has(k.id));
    if (pool.length > 0) {
      species = pick(pool, rng).id;
      break;
    }
  }
  if (species === null) {
    species = pick(
      KANTO.filter((k) => k.tier === tier),
      rng,
    ).id;
  }
  return { species, shiny: rng() < shinyOdds(tier, streak) };
}
