import { describe, expect, it } from 'vitest';
import { buildCost, MEGA_ENERGY_WEIGHT, sumCosts } from '../../src/builds/cost.js';
import {
  buildOptionsFor,
  buildsFor,
  MEGA_LEVEL4_BOOST,
  type Build,
} from '../../src/builds/eligibility.js';
import type { Moveset } from '../../src/builds/moves.js';
import type { Specimen } from '../../src/collection/specimen.js';
import type { RawScan } from '../../src/csv/parse.js';
import { GameDataIndex } from '../../src/gamedata/index.js';
import { GREAT_LEAGUE_DEF, type League } from '../../src/gamedata/league.js';
import type { BaseStats, Species } from '../../src/gamedata/types.js';
import { costToLevel } from '../../src/tables/powerup.js';

const MEWTWO: BaseStats = { atk: 300, def: 182, hp: 214 };
const MEWTWO_MEGA_Y: BaseStats = { atk: 413, def: 223, hp: 228 };
const CHARMANDER: BaseStats = { atk: 116, def: 93, hp: 118 };
const CHARMELEON: BaseStats = { atk: 158, def: 126, hp: 151 };
const CHARIZARD: BaseStats = { atk: 223, def: 173, hp: 186 };
const CHARIZARD_MEGA_Y: BaseStats = { atk: 319, def: 212, hp: 186 };

function sp(speciesId: string, baseStats: BaseStats, extra: Partial<Species> = {}): Species {
  return {
    speciesId,
    speciesName: speciesId,
    dex: 1,
    types: ['normal', 'none'],
    baseStats,
    fastMoves: [],
    chargedMoves: [],
    eliteMoves: [],
    legacyMoves: [],
    tags: [],
    familyId: null,
    parentId: null,
    evolutionIds: [],
    shadow: false,
    shadowEligible: true,
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

function specimen(partial: Partial<Specimen> & { speciesId: string }): Specimen {
  return {
    id: 'x',
    familyId: null,
    ivs: { atk: 15, def: 15, sta: 15 },
    level: { min: 1, max: 1 },
    cp: 1000,
    hp: 100,
    shadow: false,
    purified: false,
    lucky: false,
    currentMoves: { fast: null, charged: [] },
    scannedAt: '2026-09-01 00:00',
    raw: {} as RawScan,
    ...partial,
  };
}

const index = new GameDataIndex(
  [
    sp('mewtwo', MEWTWO),
    sp('mewtwo_mega_y', MEWTWO_MEGA_Y, { megaOf: 'mewtwo', tags: ['mega', 'supermega'] }),
    sp('charmander', CHARMANDER, { evolutionIds: ['charmeleon'] }),
    sp('charmeleon', CHARMELEON, { parentId: 'charmander', evolutionIds: ['charizard'] }),
    sp('charizard', CHARIZARD, { parentId: 'charmeleon' }),
    sp('charizard_mega_y', CHARIZARD_MEGA_Y, { megaOf: 'charizard', tags: ['mega'] }),
  ],
  [],
);

const MEGA_MASTER: League = {
  ...GREAT_LEAGUE_DEF,
  id: 'mega-master',
  title: 'Mega Master League',
  short: 'Mega Master',
  exclude: [],
  minCp: 0,
  cp: 10000,
};
const opts = buildOptionsFor(MEGA_MASTER);

// One charged move, so no second-move unlock muddies the numbers.
const moveset: Moveset = {
  fast: { moveId: 'F', name: 'F', dps: 1 } as unknown as Moveset['fast'],
  charged: [{ moveId: 'C', name: 'C' } as unknown as Moveset['fast']],
  source: 'fallback',
  eliteTmCount: 0,
};

function must(builds: Build[], id: string): Build {
  const b = builds.find((x) => x.speciesId === id);
  if (!b) {
    throw new Error(`no ${id} build`);
  }
  return b;
}

describe('Mega cost', () => {
  it('exports the weight as 30000', () => {
    expect(MEGA_ENERGY_WEIGHT).toBe(30000);
  });

  it('marks a Mega that is not ready as needed, exactly the weight above a ready one', () => {
    const plain = must(buildsFor(specimen({ speciesId: 'mewtwo' }), index, opts), 'mewtwo_mega_y');
    const marked = must(
      buildsFor(specimen({ speciesId: 'mewtwo', megaForm: 'mega_y' }), index, opts),
      'mewtwo_mega_y',
    );
    const needed = buildCost(plain, moveset, index);
    const ready = buildCost(marked, moveset, index);
    expect(needed.megaEnergy).toBe('needed');
    expect(ready.megaEnergy).toBe('ready');
    expect(needed.weight - ready.weight).toBe(MEGA_ENERGY_WEIGHT);
  });

  it('is null for a non-Mega build', () => {
    const base = must(buildsFor(specimen({ speciesId: 'mewtwo' }), index, opts), 'mewtwo');
    expect(buildCost(base, moveset, index).megaEnergy).toBeNull();
  });

  it('walks the evolution path to the base form, not the Mega', () => {
    const builds = buildsFor(specimen({ speciesId: 'charmander' }), index, opts);
    const mega = buildCost(must(builds, 'charizard_mega_y'), moveset, index);
    const base = buildCost(must(builds, 'charizard'), moveset, index);
    expect(mega.evolutionCandy).toBe(base.evolutionCandy);
    expect(mega.evolutionCandy).toBeGreaterThan(0);
  });

  it('powers a Level 4 Mega to the base level, not the battle level', () => {
    const s = specimen({ speciesId: 'mewtwo', megaForm: 'mega_y', megaLevel4: true });
    const build = must(buildsFor(s, index, opts), 'mewtwo_mega_y');
    expect(build.mega?.level4).toBe(true);
    expect(build.level).toBe(build.baseLevel + MEGA_LEVEL4_BOOST);
    const cost = buildCost(build, moveset, index);
    const expected = costToLevel(1, build.baseLevel, {
      shadow: false,
      purified: false,
      lucky: false,
    });
    expect(cost.stardust).toBe(expected.stardust);
    expect(cost.candy).toBe(expected.candy);
    expect(cost.xlCandy).toBe(expected.xlCandy);
  });

  it('sums to needed over ready over null', () => {
    const plain = must(buildsFor(specimen({ speciesId: 'mewtwo' }), index, opts), 'mewtwo_mega_y');
    const marked = must(
      buildsFor(specimen({ speciesId: 'mewtwo', megaForm: 'mega_y' }), index, opts),
      'mewtwo_mega_y',
    );
    const base = must(buildsFor(specimen({ speciesId: 'mewtwo' }), index, opts), 'mewtwo');
    const needed = buildCost(plain, moveset, index);
    const ready = buildCost(marked, moveset, index);
    const none = buildCost(base, moveset, index);
    expect(sumCosts([none, ready, needed]).megaEnergy).toBe('needed');
    expect(sumCosts([none, ready]).megaEnergy).toBe('ready');
    expect(sumCosts([none]).megaEnergy).toBeNull();
    expect(sumCosts([]).megaEnergy).toBeNull();
  });
});
