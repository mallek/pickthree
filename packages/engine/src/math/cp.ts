import type { BaseStats } from '../gamedata/types.js';
import type { IVs } from '../csv/parse.js';
import { CPM, cpmForLevel } from '../tables/cpm.js';

export function cpFor(base: BaseStats, ivs: IVs, level: number): number {
  const cpm = cpmForLevel(level);
  const atk = base.atk + ivs.atk;
  const def = base.def + ivs.def;
  const hp = base.hp + ivs.sta;
  return Math.max(10, Math.floor((atk * Math.sqrt(def) * Math.sqrt(hp) * cpm * cpm) / 10));
}

export function statsFor(
  base: BaseStats,
  ivs: IVs,
  level: number,
): { atk: number; def: number; hp: number } {
  const cpm = cpmForLevel(level);
  return {
    atk: (base.atk + ivs.atk) * cpm,
    def: (base.def + ivs.def) * cpm,
    hp: Math.max(10, Math.floor((base.hp + ivs.sta) * cpm)),
  };
}

export function statProduct(base: BaseStats, ivs: IVs, level: number): number {
  const s = statsFor(base, ivs, level);
  return s.atk * s.def * s.hp;
}

/**
 * Highest half-level at or under `levelCap` whose CP is at or under `cpCap`, not below
 * `levelFloor`. Null when even the floor level exceeds the cap.
 */
export function maxLevelUnderCap(
  base: BaseStats,
  ivs: IVs,
  cpCap: number,
  levelCap: number,
  levelFloor = 1,
): number | null {
  const maxIndex = Math.min((levelCap - 1) * 2, CPM.length - 1);
  const minIndex = (levelFloor - 1) * 2;
  let lo = minIndex;
  let hi = maxIndex;
  if (cpFor(base, ivs, levelFloor) > cpCap) {
    return null;
  }
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const level = mid / 2 + 1;
    if (cpFor(base, ivs, level) <= cpCap) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo / 2 + 1;
}
