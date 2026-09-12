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
  /** Single comparable number: stardust + candy*100 + xl*1000 + eliteTm*50000. */
  weight: number;
}

export function costWeight(c: Omit<Cost, 'weight'>): number {
  return c.stardust + c.candy * 100 + c.xlCandy * 1000 + c.eliteTm * 50000;
}

export function buildCost(build: Build, moveset: Moveset, index: GameDataIndex): Cost {
  const specimen = build.specimen;
  const mods: CostModifiers = {
    shadow: specimen.shadow,
    purified: specimen.purified,
    lucky: specimen.lucky,
  };
  const power = costToLevel(specimen.level.max, build.level, mods);
  const evo = evolutionCandyPath(specimen.speciesId, build.speciesId, index);
  const species = index.mustSpecies(build.speciesId);
  // Unknown scanned moves are treated as "needs the unlock": Poke Genie only records moves when
  // the appraisal captured them, and a missing second move is the common case.
  const needsSecond = moveset.charged.length > 1 && specimen.currentMoves.charged.length < 2;
  const second = needsSecond ? secondMoveCost(species.thirdMoveCost, mods) : { stardust: 0, candy: 0 };
  const partial = {
    stardust: power.stardust + second.stardust,
    candy: power.candy + evo.candy + second.candy,
    xlCandy: power.xlCandy,
    eliteTm: moveset.eliteTmCount,
    evolutionCandy: evo.candy,
    secondMoveUnlock: needsSecond,
    powerUpSteps: power.steps,
    estimated: evo.estimated,
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
  }
  return { ...partial, weight: costWeight(partial) };
}
