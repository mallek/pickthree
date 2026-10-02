import type { PinMap } from '../collection/pins.js';
import { megaFormOf, type Specimen } from '../collection/specimen.js';
import type { IVs } from '../csv/parse.js';
import type { GameDataIndex } from '../gamedata/index.js';
import type { Species } from '../gamedata/types.js';
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
  /** This league's pins by battling species. Absent means every species uses the default pick. */
  pins?: PinMap;
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

/** Pokemon kinds that cannot Mega Evolve. Purified Pokemon can. */
export const MEGA_BARRED_FOR: readonly 'shadow'[] = ['shadow'];
/** Levels a Level 4 Mega battles above its base level. */
export const MEGA_LEVEL4_BOOST = 2;
/** Highest battle level of a Level 4 Mega. */
export const MEGA_LEVEL4_CAP = 52;

export interface Build {
  specimenId: string;
  specimen: Specimen;
  speciesId: string;
  shadow: boolean;
  /** 0 = the scanned stage, 1 = one evolution later, ... */
  stageOffset: number;
  /** Battle level; for a Level 4 Mega, the base level plus MEGA_LEVEL4_BOOST. */
  level: number;
  /** CP in battle; for a Mega build, the Mega form's CP at the battle level. */
  cp: number;
  /** CP of the base form at baseLevel, the number the player powers up to. Equals cp off Mega. */
  baseCp: number;
  /** Level the player powers up to. Equals level except on a Level 4 Mega. */
  baseLevel: number;
  /** Null off Mega. ready: the specimen carries this Mega's mark. level4: battles boosted. */
  mega: { ready: boolean; level4: boolean } | null;
  ivs: IVs;
  ivRank: IvRankResult;
  needsXl: boolean;
}

/** Build options a league implies: its cap, its competitive floor, its cup rules. */
export function buildOptionsFor(
  league: League,
  base: BuildOptions = DEFAULT_BUILD_OPTIONS,
): BuildOptions {
  return { ...base, cpCap: league.cp, minCp: league.minCp, league };
}

/**
 * Nothing left to power up, evolve or Mega Evolve. A Mega build compares against the level the
 * player powers up to (baseLevel), not the Mega's battle level, which a Level 4 Mega raises by
 * two, and is only built once the specimen carries that Mega's mark.
 */
export function isAlreadyBuilt(
  build: Pick<Build, 'stageOffset' | 'baseLevel' | 'mega'>,
  specimen: Pick<Specimen, 'level'>,
): boolean {
  return (
    build.baseLevel <= specimen.level.max + 0.5 &&
    build.stageOffset === 0 &&
    (build.mega === null || build.mega.ready)
  );
}

type Common = Pick<Build, 'specimenId' | 'specimen' | 'shadow' | 'stageOffset' | 'ivs'>;

function allowed(species: Species, opts: BuildOptions): boolean {
  return opts.league
    ? allowedInLeague(species, opts.league)
    : !species.greatLeagueIneligible && !species.tags.includes('mega') && species.released;
}

/**
 * The build of one evolution stage, or null when it cannot fit the league. A stage that is a Mega
 * species is a Mega build: it counts toward the one-Mega rule and still needs Mega Energy.
 */
function stageBuild(
  species: Species,
  common: Common,
  opts: BuildOptions,
  levelCap: number,
): Build | null {
  const { specimen, ivs } = common;
  if (!allowed(species, opts)) {
    return null;
  }
  const currentLevel = specimen.level.max;
  if (cpFor(species.baseStats, ivs, currentLevel) > opts.cpCap) {
    return null;
  }
  const floor = Math.max(currentLevel, species.levelFloor ?? 1);
  const level = maxLevelUnderCap(species.baseStats, ivs, opts.cpCap, levelCap, floor);
  if (level === null) {
    return null;
  }
  const cp = cpFor(species.baseStats, ivs, level);
  if (cp < opts.minCp) {
    return null;
  }
  return {
    ...common,
    speciesId: species.speciesId,
    level,
    cp,
    baseCp: cp,
    baseLevel: level,
    // A cold-start stand-in's specimen is the Mega species itself.
    mega: species.megaOf ? { ready: false, level4: false } : null,
    ivRank: ivRank(species.baseStats, ivs, opts.cpCap, levelCap),
    needsXl: level > 40,
  };
}

/**
 * The build of one Mega of a stage, or null when it cannot fit the league. The cap applies to the
 * Mega form's CP at the battle level; a Level 4 Mega battles MEGA_LEVEL4_BOOST levels above the
 * base level the player powers up to, at most MEGA_LEVEL4_CAP.
 */
function megaBuild(
  species: Species,
  mega: Species,
  common: Common,
  opts: BuildOptions,
  levelCap: number,
): Build | null {
  const { specimen, ivs } = common;
  if (!allowed(mega, opts)) {
    return null;
  }
  const mark = megaFormOf(specimen);
  const ready = mark !== null && mega.speciesId === `${species.speciesId}_${mark}`;
  const level4 = ready && specimen.megaLevel4 === true && mega.tags.includes('supermega');
  const boost = level4 ? MEGA_LEVEL4_BOOST : 0;
  const baseLevelCap = level4 ? Math.min(levelCap, MEGA_LEVEL4_CAP - boost) : levelCap;
  const currentLevel = specimen.level.max;
  if (cpFor(mega.baseStats, ivs, currentLevel + boost) > opts.cpCap) {
    return null;
  }
  const floor = Math.max(currentLevel, species.levelFloor ?? 1);
  const level = maxLevelUnderCap(
    mega.baseStats,
    ivs,
    opts.cpCap,
    baseLevelCap + boost,
    floor + boost,
  );
  if (level === null) {
    return null;
  }
  const cp = cpFor(mega.baseStats, ivs, level);
  if (cp < opts.minCp) {
    return null;
  }
  const baseLevel = level - boost;
  return {
    ...common,
    speciesId: mega.speciesId,
    level,
    cp,
    baseCp: cpFor(species.baseStats, ivs, baseLevel),
    baseLevel,
    mega: { ready, level4 },
    ivRank: ivRank(mega.baseStats, ivs, opts.cpCap, levelCap),
    needsXl: baseLevel > 40,
  };
}

/**
 * One Build per evolution stage the specimen can reach that fits under the league cap, plus one
 * per Mega of each stage the league allows. A stage is skipped when: the league bars the species
 * (without a league: Great League ineligible, mega, unreleased); the specimen at its current level
 * already exceeds the cap in that stage (Pokemon cannot be powered down); or its best CP under the
 * cap is below minCp. Megas get the same checks on the Mega form; shadows cannot Mega Evolve.
 */
export function buildsFor(specimen: Specimen, index: GameDataIndex, opts: BuildOptions): Build[] {
  if (!specimen.ivs) {
    return [];
  }
  if (specimen.shadow && !opts.allowShadow) {
    return [];
  }
  const levelCap = opts.allowXl ? opts.levelCap : Math.min(opts.levelCap, 40);
  const megaBarred = specimen.shadow && MEGA_BARRED_FOR.includes('shadow');
  const out: Build[] = [];
  index.stagesFrom(specimen.speciesId).forEach((species, stageOffset) => {
    const common: Common = {
      specimenId: specimen.id,
      specimen,
      shadow: specimen.shadow,
      stageOffset,
      ivs: specimen.ivs as IVs,
    };
    const stage = stageBuild(species, common, opts, levelCap);
    if (stage) {
      out.push(stage);
    }
    if (megaBarred) {
      return;
    }
    for (const mega of index.megasOf(species.speciesId)) {
      const build = megaBuild(species, mega, common, opts, levelCap);
      if (build) {
        out.push(build);
      }
    }
  });
  return out;
}
