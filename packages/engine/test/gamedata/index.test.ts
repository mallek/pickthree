import { describe, expect, it } from 'vitest';
import { GameDataIndex } from '../../src/gamedata/index.js';
import type { Species } from '../../src/gamedata/types.js';

function sp(speciesId: string, extra: Partial<Species> = {}): Species {
  return {
    speciesId,
    speciesName: speciesId,
    dex: 1,
    types: ['normal', 'none'],
    baseStats: { atk: 100, def: 100, hp: 100 },
    fastMoves: [],
    chargedMoves: [],
    eliteMoves: [],
    legacyMoves: [],
    tags: [],
    familyId: null,
    parentId: null,
    evolutionIds: [],
    shadow: false,
    shadowEligible: false,
    released: true,
    thirdMoveCost: 0,
    levelCap: null,
    levelFloor: null,
    greatLeagueIneligible: false,
    defaultIVs: {},
    formChange: null,
    ...extra,
  };
}

describe('GameDataIndex.megasOf', () => {
  const index = new GameDataIndex(
    [
      sp('charizard'),
      sp('charizard_mega_y', { megaOf: 'charizard', tags: ['mega'] }),
      sp('charizard_mega_x', { megaOf: 'charizard', tags: ['mega'] }),
      sp('charmander'),
    ],
    [],
  );

  it('lists the Megas of a species, sorted by id', () => {
    expect(index.megasOf('charizard').map((s) => s.speciesId)).toEqual([
      'charizard_mega_x',
      'charizard_mega_y',
    ]);
  });

  it('is empty for a species with no Mega', () => {
    expect(index.megasOf('charmander')).toEqual([]);
  });
});
