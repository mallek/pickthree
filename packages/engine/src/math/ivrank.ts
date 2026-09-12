import type { BaseStats } from '../gamedata/types.js';
import type { IVs } from '../csv/parse.js';
import { maxLevelUnderCap, statProduct, cpFor } from './cp.js';

export interface IvRankResult {
  rank: number;
  total: number;
  /** 0..100, higher is better (rank 1 = 100). */
  percentile: number;
  /** Same scale Poke Genie prints: the share of combinations this one beats or ties, percent. */
  rankPct: number;
  product: number;
  bestProduct: number;
  /** Percent gap in stat product to the rank-1 spread. 0 for rank 1. */
  gapPct: number;
  level: number;
  cp: number;
  best: { ivs: IVs; level: number; cp: number };
}

interface Combo {
  ivs: IVs;
  level: number;
  product: number;
  cp: number;
}

const cache = new Map<string, Combo[]>();

/** All 4096 IV spreads at their max level under the cap, sorted by stat product desc. */
export function allSpreads(
  base: BaseStats,
  cpCap: number,
  levelCap: number,
  levelFloor = 1,
): Combo[] {
  const key = `${base.atk}/${base.def}/${base.hp}|${cpCap}|${levelCap}|${levelFloor}`;
  const hit = cache.get(key);
  if (hit) {
    return hit;
  }
  const combos: Combo[] = [];
  for (let atk = 0; atk <= 15; atk++) {
    for (let def = 0; def <= 15; def++) {
      for (let sta = 0; sta <= 15; sta++) {
        const ivs = { atk, def, sta };
        const level = maxLevelUnderCap(base, ivs, cpCap, levelCap, levelFloor);
        if (level === null) {
          combos.push({ ivs, level: levelFloor, product: 0, cp: cpFor(base, ivs, levelFloor) });
        } else {
          combos.push({
            ivs,
            level,
            product: statProduct(base, ivs, level),
            cp: cpFor(base, ivs, level),
          });
        }
      }
    }
  }
  combos.sort((a, b) => b.product - a.product);
  cache.set(key, combos);
  return combos;
}

export function ivRank(
  base: BaseStats,
  ivs: IVs,
  cpCap: number,
  levelCap: number,
  levelFloor = 1,
): IvRankResult {
  const spreads = allSpreads(base, cpCap, levelCap, levelFloor);
  const mine = spreads.find(
    (c) => c.ivs.atk === ivs.atk && c.ivs.def === ivs.def && c.ivs.sta === ivs.sta,
  ) as Combo;
  const best = spreads[0] as Combo;
  // Ties share the best rank among equals (1224 style: rank = 1 + count strictly better).
  let better = 0;
  for (const c of spreads) {
    if (c.product > mine.product) {
      better += 1;
    } else {
      break;
    }
  }
  const rank = better + 1;
  const total = spreads.length;
  const gapPct = best.product === 0 ? 0 : ((best.product - mine.product) / best.product) * 100;
  return {
    rank,
    total,
    percentile: ((total - rank + 1) / total) * 100,
    rankPct: best.product === 0 ? 0 : (mine.product / best.product) * 100,
    product: mine.product,
    bestProduct: best.product,
    gapPct,
    level: mine.level,
    cp: mine.cp,
    best: { ivs: best.ivs, level: best.level, cp: best.cp },
  };
}
