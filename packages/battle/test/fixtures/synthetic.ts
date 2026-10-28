import type { BattleData, MoveData, SpeciesData } from '../../src/data/types.js';

const STAGE_TABLE = [4 / 8, 4 / 7, 4 / 6, 4 / 5, 1, 5 / 4, 6 / 4, 7 / 4, 8 / 4];

export function makeMove(id: string, over: Partial<MoveData> = {}): MoveData {
  return {
    id,
    type: 'alpha',
    category: 'fast',
    power: 3,
    energy: 0,
    energyGain: 4,
    turns: 1,
    ...over,
  };
}

export function makeSpecies(id: string, over: Partial<SpeciesData> = {}): SpeciesData {
  return {
    id,
    dex: 1,
    family: id,
    baseStats: { atk: 100, def: 100, hp: 100 },
    types: ['alpha'],
    fast: [],
    charged: [],
    eliteFast: [],
    eliteCharged: [],
    shadow: null,
    tags: [],
    ...over,
  };
}

export function makeData(over: Partial<BattleData> = {}): BattleData {
  return {
    version: 1,
    source: { kind: 'datamine', commit: 'synthetic', date: '2026-10-27' },
    settings: {
      stab: 1.2,
      fastBonus: 1.3,
      chargedBonus: 1.3,
      shadowAtk: 1.2,
      shadowDef: 0.8,
      maxEnergy: 100,
      roundTurns: 540,
      stages: { min: -4, max: 4, atk: [...STAGE_TABLE], def: [...STAGE_TABLE] },
    },
    types: ['alpha', 'beta', 'gamma'],
    // rows = attacker, columns = defender
    effectiveness: [
      [1, 1.6, 1], // alpha: super effective on beta
      [0.625, 1, 1], // beta: resisted by alpha
      [1, 1, 1], // gamma: neutral
    ],
    cpm: Array.from({ length: 100 }, () => 0.5),
    moves: {
      TACKLE_FAST: makeMove('TACKLE_FAST'),
      SLAM_CHARGED: makeMove('SLAM_CHARGED', {
        category: 'charged',
        power: 50,
        energy: 50,
        energyGain: 0,
        turns: 1,
      }),
    },
    species: {},
    leagues: {},
    mechanics: {},
    ...over,
  };
}
