import type { BattleSet } from '@pickthree/engine';

/** Battles in the community meta: sent (stamped) and not tanked, which the meta never counts. */
export function contributedCount(sets: readonly BattleSet[]): number {
  let n = 0;
  for (const s of sets) {
    for (const b of s.battles) {
      if (b.sharedAt && !b.tanked) {
        n += 1;
      }
    }
  }
  return n;
}
