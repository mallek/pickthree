import type { GameDataIndex } from '../gamedata/index.js';
import { evolutionCandyPath } from '../tables/evolution.js';
import { costToLevel, type CostModifiers } from '../tables/powerup.js';
import { secondMoveCost } from '../tables/secondMove.js';
import type { Build } from './eligibility.js';
import type { Moveset } from './moves.js';

export interface Cost {
  stardust: number;
  candy: number;
  xlCandy: number;
  eliteTm: number;
  evolutionCandy: number;
  secondMoveUnlock: boolean;
  powerUpSteps: number;
  /** True when any component came from a heuristic rather than a known table value. */
  estimated: boolean;
  /** Mega Energy: 'needed' for a Mega not yet evolved, 'ready' when it already is, null off Mega. */
  megaEnergy: 'needed' | 'ready' | null;
  /** Single comparable number: stardust + candy*100 + xl*1000 + eliteTm*50000. */
  weight: number;
}

/**
 * Weight of a Mega Energy purchase, in dust-equivalents. Equal to 30,000 dust: enough to rank a
 * ready Mega first among near-equals, small next to an Elite TM (50,000).
 */
export const MEGA_ENERGY_WEIGHT = 30000;

export function costWeight(c: Omit<Cost, 'weight'>): number {
  const mega = c.megaEnergy === 'needed' ? MEGA_ENERGY_WEIGHT : 0;
  return c.stardust + c.candy * 100 + c.xlCandy * 1000 + c.eliteTm * 50000 + mega;
}

export function buildCost(build: Build, moveset: Moveset, index: GameDataIndex): Cost {
  const specimen = build.specimen;
  const mods: CostModifiers = {
    shadow: specimen.shadow,
    purified: specimen.purified,
    lucky: specimen.lucky,
  };
  const power = costToLevel(specimen.level.max, build.baseLevel, mods);
  // A Mega is the base form in battle: the stored Pokemon evolves and powers up as the base.
  const baseId = index.mustSpecies(build.speciesId).megaOf ?? build.speciesId;
  const evo = evolutionCandyPath(specimen.speciesId, baseId, index);
  const species = index.mustSpecies(baseId);
  // Unknown scanned moves are treated as "needs the unlock": Poke Genie only records moves when
  // the appraisal captured them, and a missing second move is the common case.
  const needsSecond = moveset.charged.length > 1 && specimen.currentMoves.charged.length < 2;
  const second = needsSecond
    ? secondMoveCost(species.thirdMoveCost, mods)
    : { stardust: 0, candy: 0 };
  const megaEnergy: Cost['megaEnergy'] =
    build.mega === null ? null : build.mega.ready ? 'ready' : 'needed';
  const partial = {
    stardust: power.stardust + second.stardust,
    candy: power.candy + evo.candy + second.candy,
    xlCandy: power.xlCandy,
    eliteTm: moveset.eliteTmCount,
    evolutionCandy: evo.candy,
    secondMoveUnlock: needsSecond,
    powerUpSteps: power.steps,
    estimated: evo.estimated,
    megaEnergy,
  };
  return { ...partial, weight: costWeight(partial) };
}

export function sumCosts(costs: Cost[]): Cost {
  const partial = {
    stardust: 0,
    candy: 0,
    xlCandy: 0,
    eliteTm: 0,
    evolutionCandy: 0,
    secondMoveUnlock: false,
    powerUpSteps: 0,
    estimated: false,
    megaEnergy: null as Cost['megaEnergy'],
  };
  for (const c of costs) {
    partial.stardust += c.stardust;
    partial.candy += c.candy;
    partial.xlCandy += c.xlCandy;
    partial.eliteTm += c.eliteTm;
    partial.evolutionCandy += c.evolutionCandy;
    partial.secondMoveUnlock = partial.secondMoveUnlock || c.secondMoveUnlock;
    partial.powerUpSteps += c.powerUpSteps;
    partial.estimated = partial.estimated || c.estimated;
    if (c.megaEnergy === 'needed' || (c.megaEnergy === 'ready' && partial.megaEnergy === null)) {
      partial.megaEnergy = c.megaEnergy;
    }
  }
  return { ...partial, weight: costWeight(partial) };
}
