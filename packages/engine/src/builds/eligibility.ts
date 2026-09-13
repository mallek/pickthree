import type { Specimen } from '../collection/specimen.js';
import type { IVs } from '../csv/parse.js';
import type { GameDataIndex } from '../gamedata/index.js';
import { cpFor, maxLevelUnderCap } from '../math/cp.js';
import { ivRank, type IvRankResult } from '../math/ivrank.js';
import { allowedInLeague, type League } from '../gamedata/league.js';

export interface BuildOptions {
  cpCap: number;
  levelCap: 40 | 50 | 51;
  /** Builds whose best CP under the cap is below this are not competitive. */
  minCp: number;
  allowShadow: boolean;
  allowEliteTm: boolean;
  allowXl: boolean;
  budgetStardust: number | null;
  /** The league's cup rules; absent means open Great League rules. */
  league?: League;
}

export const DEFAULT_BUILD_OPTIONS: BuildOptions = {
  cpCap: 1500,
  levelCap: 50,
  minCp: 1400,
  allowShadow: true,
  allowEliteTm: true,
  allowXl: true,
  budgetStardust: null,
};

export interface Build {
  specimenId: string;
  specimen: Specimen;
  speciesId: string;
  shadow: boolean;
  /** 0 = the scanned stage, 1 = one evolution later, ... */
  stageOffset: number;
  level: number;
  cp: number;
  ivs: IVs;
  ivRank: IvRankResult;
  needsXl: boolean;
}

/**
 * One Build per evolution stage the specimen can reach that fits under the league cap.
 * A stage is skipped when: the species is Great League ineligible, mega, unreleased; the specimen at
 * its current level already exceeds the cap in that stage (Pokemon cannot be powered down); or its
 * best CP under the cap is below minCp.
 */
/** Build options a league implies: its cap, its competitive floor, its cup rules. */
export function buildOptionsFor(
  league: League,
  base: BuildOptions = DEFAULT_BUILD_OPTIONS,
): BuildOptions {
  return { ...base, cpCap: league.cp, minCp: league.minCp, league };
}

export function buildsFor(specimen: Specimen, index: GameDataIndex, opts: BuildOptions): Build[] {
  if (!specimen.ivs) {
    return [];
  }
  if (specimen.shadow && !opts.allowShadow) {
    return [];
  }
  const levelCap = opts.allowXl ? opts.levelCap : Math.min(opts.levelCap, 40);
  const stages = index.stagesFrom(specimen.speciesId);
  const out: Build[] = [];
  stages.forEach((species, stageOffset) => {
    const barred = opts.league
      ? !allowedInLeague(species, opts.league)
      : species.greatLeagueIneligible || species.tags.includes('mega') || !species.released;
    if (barred) {
      return;
    }
    const currentLevel = specimen.level.max;
    if (cpFor(species.baseStats, specimen.ivs as IVs, currentLevel) > opts.cpCap) {
      return;
    }
    const floor = Math.max(currentLevel, species.levelFloor ?? 1);
    const level = maxLevelUnderCap(
      species.baseStats,
      specimen.ivs as IVs,
      opts.cpCap,
      levelCap,
      floor,
    );
    if (level === null) {
      return;
    }
    const cp = cpFor(species.baseStats, specimen.ivs as IVs, level);
    if (cp < opts.minCp) {
      return;
    }
    out.push({
      specimenId: specimen.id,
      specimen,
      speciesId: species.speciesId,
      shadow: specimen.shadow,
      stageOffset,
      level,
      cp,
      ivs: specimen.ivs as IVs,
      ivRank: ivRank(species.baseStats, specimen.ivs as IVs, opts.cpCap, levelCap),
      needsXl: level > 40,
    });
  });
  return out;
}
