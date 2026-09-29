import { describe, expect, it } from 'vitest';
import {
  allowedInLeague,
  GREAT_LEAGUE_DEF,
  minCpFor,
  type League,
} from '../../src/gamedata/league.js';
import type { Species } from '../../src/gamedata/types.js';
import { GameDataIndex } from '../../src/gamedata/index.js';
import { haveStaticData, loadStaticData } from '../fixtures.js';

describe('cup rules', () => {
  it('competitive floor tracks the cap and vanishes for Master', () => {
    expect(minCpFor(1500)).toBe(1410);
    expect(minCpFor(2500)).toBe(2350);
    expect(minCpFor(10000)).toBe(0);
  });
});

describe.skipIf(!haveStaticData())('league eligibility', () => {
  const data = loadStaticData();
  const index = new GameDataIndex(data.species, data.moves);
  const sp = (id: string) => index.mustSpecies(id);
  const ultra: League = { ...GREAT_LEAGUE_DEF, id: 'ultra', title: 'Ultra League', cp: 2500 };
  const willpower: League = {
    ...GREAT_LEAGUE_DEF,
    id: 'willpower',
    cp: 1500,
    include: [{ filterType: 'type', values: ['dark', 'psychic', 'fighting'] }],
    exclude: [
      { filterType: 'tag', values: ['mega'] },
      { filterType: 'id', values: ['gardevoir', 'zorua', 'zoroark'] },
    ],
  };
  const mega: League = {
    ...GREAT_LEAGUE_DEF,
    id: 'mega-great',
    cp: 1500,
    include: [],
    exclude: [
      {
        filterType: 'id',
        values: [
          'mewtwo_mega_x',
          'mewtwo_mega_y',
          'kyogre_primal',
          'groudon_primal',
          'rayquaza_mega',
        ],
        leagues: [1500],
      },
    ],
  };

  it('keeps megas out of the open leagues and the ban list out under 2500', () => {
    expect(allowedInLeague(sp('swampert'), GREAT_LEAGUE_DEF)).toBe(true);
    expect(allowedInLeague(sp('swampert_mega'), GREAT_LEAGUE_DEF)).toBe(false);
    expect(allowedInLeague(sp('mewtwo'), GREAT_LEAGUE_DEF)).toBe(false);
    expect(allowedInLeague(sp('mewtwo'), ultra)).toBe(true);
  });

  it('applies a typed cup with id exclusions, shadows included', () => {
    expect(allowedInLeague(sp('medicham'), willpower)).toBe(true);
    expect(allowedInLeague(sp('swampert'), willpower)).toBe(false);
    expect(allowedInLeague(sp('gardevoir'), willpower)).toBe(false);
    expect(allowedInLeague(sp('gardevoir_shadow'), willpower)).toBe(false);
    expect(allowedInLeague(sp('medicham_mega'), willpower)).toBe(false);
  });

  it('lets megas into the mega cup except the listed ones at that cap', () => {
    expect(allowedInLeague(sp('swampert_mega'), mega)).toBe(true);
    expect(allowedInLeague(sp('mewtwo_mega_x'), mega)).toBe(false);
    expect(allowedInLeague(sp('mewtwo_mega_x'), { ...mega, cp: 10000 })).toBe(true);
  });
});

describe('evolution filter', () => {
  const base = (id: string, evolutionStage: number | undefined): Species =>
    ({
      speciesId: id,
      speciesName: id,
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
      thirdMoveCost: 50000,
      levelCap: null,
      levelFloor: null,
      greatLeagueIneligible: false,
      defaultIVs: {},
      formChange: null,
      ...(evolutionStage === undefined ? {} : { evolutionStage }),
    }) as Species;
  const little: League = {
    ...GREAT_LEAGUE_DEF,
    id: 'little',
    cp: 500,
    cup: 'little',
    kind: 'rotation',
    include: [{ filterType: 'evolution', values: [1] }],
    exclude: [{ filterType: 'id', values: ['shuckle', 'smeargle'] }],
  };

  it('admits stage 1 only', () => {
    expect(allowedInLeague(base('azurill', 1), little)).toBe(true);
    expect(allowedInLeague(base('marill', 2), little)).toBe(false);
    expect(allowedInLeague(base('azumarill', 3), little)).toBe(false);
    expect(allowedInLeague(base('tauros', 0), little)).toBe(false);
  });

  it('treats a species built before the field existed as stage 0', () => {
    expect(allowedInLeague(base('azurill', undefined), little)).toBe(false);
  });

  it('still applies the id exclude', () => {
    expect(allowedInLeague(base('shuckle', 1), little)).toBe(false);
  });
});
