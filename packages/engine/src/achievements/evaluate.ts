import { ACHIEVEMENTS, type AchievementDef } from './definitions.js';
import type { AchievementFacts } from './facts.js';

export interface AchievementStatus {
  def: AchievementDef;
  earned: boolean;
  have: number;
  need: number;
}

/** Definitions the facts now satisfy that are not earned yet, in list order. */
export function newlyEarned(
  facts: AchievementFacts,
  earnedIds: ReadonlySet<string>,
  defs: readonly AchievementDef[] = ACHIEVEMENTS,
): AchievementDef[] {
  return defs.filter((d) => !earnedIds.has(d.id) && d.test(facts));
}

/** Every definition with whether it is earned and its progress. An earned one shows full. */
export function statusAll(
  facts: AchievementFacts,
  earnedIds: ReadonlySet<string>,
  defs: readonly AchievementDef[] = ACHIEVEMENTS,
): AchievementStatus[] {
  return defs.map((def) => {
    const p = def.progress(facts);
    const earned = earnedIds.has(def.id);
    return { def, earned, have: earned ? p.need : p.have, need: p.need };
  });
}

/**
 * The locked achievement closest to done (best have / need), skipping ones that rest on an event
 * mark. Ties go to the earlier one in the list. Null when nothing is left.
 */
export function nearest(
  facts: AchievementFacts,
  earnedIds: ReadonlySet<string>,
  defs: readonly AchievementDef[] = ACHIEVEMENTS,
): AchievementStatus | null {
  let best: AchievementStatus | null = null;
  for (const s of statusAll(facts, earnedIds, defs)) {
    if (s.earned || s.def.mark !== undefined) {
      continue;
    }
    if (best === null || s.have / s.need > best.have / best.need) {
      best = s;
    }
  }
  return best;
}

/** "Next: Ten days. 3 more days." or "Next: Full set. Log a complete set of 5." */
export function nudgeLine(s: AchievementStatus): string {
  const unit = s.def.unit;
  if (unit !== undefined && s.need > 1) {
    const left = s.need - s.have;
    return `Next: ${s.def.name}. ${left} more ${left === 1 ? unit[0] : unit[1]}.`;
  }
  return `Next: ${s.def.name}. ${s.def.howTo}.`;
}
