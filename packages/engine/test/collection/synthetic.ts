import type { Specimen } from '../../src/collection/specimen.js';
import type { RawScan } from '../../src/csv/parse.js';
import { GameDataIndex } from '../../src/gamedata/index.js';
import type { Move, Species } from '../../src/gamedata/types.js';

function species(id: string, evolutionIds: string[], parentId: string | null): Species {
  return {
    speciesId: id,
    speciesName: id,
    dex: 1,
    types: ['normal', 'none'],
    baseStats: { atk: 100 + id.length * 7, def: 120, hp: 150 },
    fastMoves: ['TACKLE'],
    chargedMoves: ['BODY_SLAM', 'SWIFT'],
    eliteMoves: [],
    legacyMoves: [],
    tags: id.endsWith('_shadow') ? ['shadow'] : [],
    familyId: 'FAMILY',
    parentId,
    evolutionIds,
    shadow: id.endsWith('_shadow'),
    shadowEligible: false,
    released: true,
    thirdMoveCost: 10000,
    levelCap: null,
    levelFloor: null,
    greatLeagueIneligible: false,
    defaultIVs: {},
    formChange: null,
  };
}

function move(moveId: string, name: string, energy: number, energyGain: number): Move {
  return {
    moveId,
    name,
    type: 'normal',
    power: 10,
    energy,
    energyGain,
    turns: 1,
    cooldown: 500,
    buffs: null,
    buffTarget: null,
    buffApplyChance: null,
    buffsSelf: null,
    buffsOpponent: null,
    archetype: null,
  };
}

/** Every made-up species learns the same three moves. */
export const SYNTHETIC_MOVES: Move[] = [
  move('TACKLE', 'Tackle', 0, 3),
  move('BODY_SLAM', 'Body Slam', 35, 0),
  move('SWIFT', 'Swift', 55, 0),
];

/** A made-up dex: a branching line, a regional pair that share nothing, and a Shadow line. */
export function syntheticIndex(): GameDataIndex {
  return new GameDataIndex(
    [
      species('eevee', ['umbreon', 'vaporeon'], null),
      species('umbreon', [], 'eevee'),
      species('vaporeon', [], 'eevee'),
      species('stunfisk', [], null),
      species('stunfisk_galarian', [], null),
      species('mudkip', ['swampert'], null),
      species('swampert', [], 'mudkip'),
      species('mudkip_shadow', [], null),
      species('swampert_shadow', [], null),
    ],
    SYNTHETIC_MOVES,
  );
}

export function mon(id: string, speciesId: string, over: Partial<Specimen> = {}): Specimen {
  return {
    id,
    speciesId,
    familyId: 'FAMILY',
    ivs: { atk: 1, def: 15, sta: 13 },
    level: { min: 14, max: 14 },
    cp: 400,
    hp: 80,
    shadow: speciesId.endsWith('_shadow'),
    purified: false,
    lucky: false,
    currentMoves: { fast: null, charged: [] },
    scannedAt: '2026-09-01 10:00',
    raw: {} as RawScan,
    ...over,
  };
}
