/** How hard an achievement is, which decides the pool its Pokemon is drawn from. */
export type AchievementTier = 'easy' | 'mid' | 'hard' | 'elite' | 'top';

export const TIERS: readonly AchievementTier[] = ['easy', 'mid', 'hard', 'elite', 'top'];

/** One achievement this phone has earned, with the Pokemon it rolled. Kept for good. */
export interface EarnedAchievement {
  id: string;
  /** ISO time it was earned. */
  earnedAt: string;
  /** PvPoke species id of the Kanto Pokemon it rolled. */
  species: string;
  shiny: boolean;
}

/** Everything stored about achievements: what was earned and the one-time event marks. */
export interface AchievementsRecord {
  earned: EarnedAchievement[];
  /** Actions with no history behind them, such as `analyzed`. */
  marks: string[];
}

/** Shared and frozen, so no caller can push into it; copy the arrays to build on it. */
export const EMPTY_ACHIEVEMENTS: AchievementsRecord = Object.freeze({
  earned: Object.freeze([]) as unknown as EarnedAchievement[],
  marks: Object.freeze([]) as unknown as string[],
});
