import { describe, expect, it } from 'vitest';
import { hypotheticalSpecimen } from '../../src/analyze.js';
import { buildCost } from '../../src/builds/cost.js';
import type { Moveset } from '../../src/builds/moves.js';
import {
  DEFAULT_BUILD_OPTIONS,
  MEGA_BARRED_FOR,
  MEGA_LEVEL4_BOOST,
  MEGA_LEVEL4_CAP,
  buildOptionsFor,
  buildsFor,
  type Build,
} from '../../src/builds/eligibility.js';
import type { Specimen } from '../../src/collection/specimen.js';
import type { RawScan } from '../../src/csv/parse.js';
import { GameDataIndex } from '../../src/gamedata/index.js';
import { GREAT_LEAGUE_DEF, type League } from '../../src/gamedata/league.js';
import type { BaseStats, Species } from '../../src/gamedata/types.js';
import { cpFor } from '../../src/math/cp.js';

// Base stats from the PvPoke game master (packages/data/.pvpoke/src/data/gamemaster.json).
const SABLEYE: BaseStats = { atk: 141, def: 136, hp: 137 };
const SABLEYE_MEGA: BaseStats = { atk: 151, def: 216, hp: 137 };
const MEWTWO: BaseStats = { atk: 300, def: 182, hp: 214 };
const MEWTWO_MEGA_X: BaseStats = { atk: 399, def: 215, hp: 228 };
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
    level: { min: 20, max: 20 },
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
    sp('sableye', SABLEYE),
    sp('sableye_shadow', SABLEYE, { shadow: true }),
    sp('sableye_mega', SABLEYE_MEGA, { megaOf: 'sableye', tags: ['mega'] }),
    sp('mewtwo', MEWTWO),
    sp('mewtwo_mega_x', MEWTWO_MEGA_X, { megaOf: 'mewtwo', tags: ['mega', 'supermega'] }),
    sp('mewtwo_mega_y', MEWTWO_MEGA_Y, { megaOf: 'mewtwo', tags: ['mega', 'supermega'] }),
    // A made-up supermega-less twin, to show the tag is what grants Level 4.
    sp('mewthree', MEWTWO),
    sp('mewthree_mega', MEWTWO_MEGA_Y, { megaOf: 'mewthree', tags: ['mega'] }),
    sp('charmander', CHARMANDER, { evolutionIds: ['charmeleon'] }),
    sp('charmeleon', CHARMELEON, { parentId: 'charmander', evolutionIds: ['charizard'] }),
    sp('charizard', CHARIZARD, { parentId: 'charmeleon' }),
    sp('charizard_mega_y', CHARIZARD_MEGA_Y, { megaOf: 'charizard', tags: ['mega'] }),
  ],
  [],
);

const IV15 = { atk: 15, def: 15, sta: 15 };

const MEGA_GREAT: League = {
  ...GREAT_LEAGUE_DEF,
  id: 'mega-great',
  title: 'Mega Great League',
  short: 'Mega Great',
  exclude: [],
  minCp: 0,
};
const MEGA_MASTER: League = {
  ...MEGA_GREAT,
  id: 'mega-master',
  title: 'Mega Master League',
  short: 'Mega Master',
  cp: 10000,
  minCp: 0,
};
const greatMega = buildOptionsFor(MEGA_GREAT);
const masterMega = buildOptionsFor(MEGA_MASTER);

function byId(builds: Build[], id: string): Build | undefined {
  return builds.find((b) => b.speciesId === id);
}

function must(builds: Build[], id: string): Build {
  const b = byId(builds, id);
  if (!b) {
    throw new Error(`no ${id} build in ${builds.map((x) => x.speciesId).join(',')}`);
  }
  return b;
}

describe('Mega builds', () => {
  const sableyeIvs = { atk: 10, def: 15, sta: 14 };

  it('exports the Mega rules', () => {
    expect(MEGA_BARRED_FOR).toEqual(['shadow']);
    expect(MEGA_LEVEL4_BOOST).toBe(2);
    expect(MEGA_LEVEL4_CAP).toBe(52);
  });

  it('caps a Mega Sableye on the Mega form and reports the base CP', () => {
    const s = specimen({ speciesId: 'sableye', ivs: sableyeIvs, level: { min: 15, max: 15 } });
    const builds = buildsFor(s, index, greatMega);
    const mega = must(builds, 'sableye_mega');
    expect(mega.level).toBe(27.5);
    expect(mega.baseLevel).toBe(27.5);
    expect(mega.cp).toBe(1475);
    expect(mega.baseCp).toBe(1118);
    expect(mega.stageOffset).toBe(0);
    expect(mega.needsXl).toBe(false);
    expect(mega.mega).toEqual({ ready: false, level4: false });

    const base = must(builds, 'sableye');
    const alone = buildsFor(s, index, buildOptionsFor(GREAT_LEAGUE_DEF));
    expect(base).toEqual(must(alone, 'sableye'));
    expect(base.mega).toBeNull();
    expect(base.baseCp).toBe(base.cp);
    expect(base.baseLevel).toBe(base.level);
  });

  it('gives no Mega build to a specimen already over the cap in Mega form', () => {
    const s = specimen({ speciesId: 'sableye', ivs: sableyeIvs, level: { min: 30, max: 30 } });
    const builds = buildsFor(s, index, greatMega);
    expect(byId(builds, 'sableye_mega')).toBeUndefined();
    expect(byId(builds, 'sableye')).toBeDefined();
  });

  it('marks the Mega the specimen carries as ready', () => {
    const marked = specimen({ speciesId: 'mewtwo', level: { min: 1, max: 1 }, megaForm: 'mega_y' });
    const builds = buildsFor(marked, index, masterMega);
    expect(must(builds, 'mewtwo_mega_y').mega?.ready).toBe(true);
    expect(must(builds, 'mewtwo_mega_x').mega?.ready).toBe(false);

    const unmarked = specimen({ speciesId: 'mewtwo', level: { min: 1, max: 1 } });
    const plain = buildsFor(unmarked, index, masterMega);
    expect(must(plain, 'mewtwo_mega_y').mega?.ready).toBe(false);
    expect(must(plain, 'mewtwo_mega_x').mega?.ready).toBe(false);
  });

  it('bars shadows from Mega Evolving, not purified Pokemon', () => {
    const shadow = specimen({
      speciesId: 'sableye_shadow',
      shadow: true,
      ivs: sableyeIvs,
      level: { min: 15, max: 15 },
    });
    expect(buildsFor(shadow, index, greatMega).some((b) => b.mega !== null)).toBe(false);
    // Even if the index ever listed a Mega for the shadow's stage, the shadow rule holds.
    const shadowOnBaseId = { ...shadow, speciesId: 'sableye' };
    expect(buildsFor(shadowOnBaseId, index, greatMega).some((b) => b.mega !== null)).toBe(false);

    const purified = specimen({
      speciesId: 'sableye',
      purified: true,
      ivs: sableyeIvs,
      level: { min: 15, max: 15 },
    });
    expect(byId(buildsFor(purified, index, greatMega), 'sableye_mega')).toBeDefined();
  });

  it('never builds a Mega in a league that excludes the mega tag', () => {
    const s = specimen({
      speciesId: 'sableye',
      ivs: sableyeIvs,
      level: { min: 15, max: 15 },
      megaForm: 'mega',
    });
    const builds = buildsFor(s, index, buildOptionsFor(GREAT_LEAGUE_DEF));
    expect(builds.some((b) => b.mega !== null)).toBe(false);
    expect(buildsFor(s, index, DEFAULT_BUILD_OPTIONS).some((b) => b.mega !== null)).toBe(false);
  });

  it('builds the Mega of an evolved stage at that stage offset', () => {
    const s = specimen({ speciesId: 'charmander', level: { min: 1, max: 1 } });
    const builds = buildsFor(s, index, greatMega);
    const mega = must(builds, 'charizard_mega_y');
    expect(mega.stageOffset).toBe(must(builds, 'charizard').stageOffset);
    expect(mega.stageOffset).toBe(2);
  });

  describe('Level 4', () => {
    const lvl4 = specimen({
      speciesId: 'mewtwo',
      level: { min: 1, max: 1 },
      megaForm: 'mega_y',
      megaLevel4: true,
    });

    it('battles at base level + 2, capped on the Mega CP at the battle level', () => {
      const plain = must(
        buildsFor({ ...lvl4, megaLevel4: false }, index, greatMega),
        'mewtwo_mega_y',
      );
      const b = must(buildsFor(lvl4, index, greatMega), 'mewtwo_mega_y');
      expect(b.mega).toEqual({ ready: true, level4: true });
      expect(b.baseLevel).toBe(b.level - MEGA_LEVEL4_BOOST);
      // The cap binds on the Mega form at the battle level, so it lands where the plain Mega does.
      expect(b.level).toBe(plain.level);
      expect(b.cp).toBe(cpFor(MEWTWO_MEGA_Y, IV15, b.level));
      expect(b.cp).toBeLessThanOrEqual(1500);
      expect(cpFor(MEWTWO_MEGA_Y, IV15, b.level + 0.5)).toBeGreaterThan(1500);
      expect(b.baseCp).toBe(cpFor(MEWTWO, IV15, b.baseLevel));
      expect(b.baseCp).toBeLessThan(plain.baseCp);
    });

    it('checks the cap at the current battle level', () => {
      // Current level where the plain Mega fits under 1500 but the Level 4 one (current + 2) does not.
      let current = 1;
      while (cpFor(MEWTWO_MEGA_Y, IV15, current + MEGA_LEVEL4_BOOST) <= 1500) {
        current += 0.5;
      }
      expect(cpFor(MEWTWO_MEGA_Y, IV15, current)).toBeLessThanOrEqual(1500);
      const at = { ...lvl4, level: { min: current, max: current } };
      expect(byId(buildsFor(at, index, greatMega), 'mewtwo_mega_y')).toBeUndefined();
      expect(
        byId(buildsFor({ ...at, megaLevel4: false }, index, greatMega), 'mewtwo_mega_y'),
      ).toBeDefined();
    });

    it('keeps the base level at or above the current level', () => {
      const at = { ...lvl4, level: { min: 5, max: 5 } };
      const b = must(buildsFor(at, index, masterMega), 'mewtwo_mega_y');
      expect(b.baseLevel).toBeGreaterThanOrEqual(5);
    });

    it('battles at 52 in a 10000 CP league', () => {
      const b = must(buildsFor(lvl4, index, masterMega), 'mewtwo_mega_y');
      expect(b.level).toBe(MEGA_LEVEL4_CAP);
      expect(b.baseLevel).toBe(50);
      expect(b.cp).toBe(cpFor(MEWTWO_MEGA_Y, IV15, 52));
      expect(b.baseCp).toBe(cpFor(MEWTWO, IV15, 50));
      expect(b.needsXl).toBe(true);
    });

    it('gives no boost without the mark, without supermega, or to an unmarked specimen', () => {
      const noFlag = must(
        buildsFor({ ...lvl4, megaLevel4: false }, index, masterMega),
        'mewtwo_mega_y',
      );
      expect(noFlag.level).toBe(50);
      expect(noFlag.baseLevel).toBe(noFlag.level);
      expect(noFlag.mega?.level4).toBe(false);

      // The Level 4 flag only applies to the Mega the specimen is marked with.
      const other = must(buildsFor(lvl4, index, masterMega), 'mewtwo_mega_x');
      expect(other.baseLevel).toBe(other.level);
      expect(other.mega).toEqual({ ready: false, level4: false });

      const unmarked = must(
        buildsFor({ ...lvl4, megaForm: null }, index, masterMega),
        'mewtwo_mega_y',
      );
      expect(unmarked.baseLevel).toBe(unmarked.level);
      expect(unmarked.mega?.level4).toBe(false);

      const notSuper = must(
        buildsFor({ ...lvl4, speciesId: 'mewthree', megaForm: 'mega' }, index, masterMega),
        'mewthree_mega',
      );
      expect(notSuper.mega).toEqual({ ready: true, level4: false });
      expect(notSuper.baseLevel).toBe(notSuper.level);
    });

    it('ignores a Level 4 mark on a Sableye', () => {
      const s = specimen({
        speciesId: 'sableye',
        ivs: sableyeIvs,
        level: { min: 15, max: 15 },
        megaForm: 'mega',
        megaLevel4: true,
      });
      const b = must(buildsFor(s, index, greatMega), 'sableye_mega');
      expect(b.mega).toEqual({ ready: true, level4: false });
      expect(b.level).toBe(27.5);
      expect(b.baseLevel).toBe(27.5);
      expect(b.cp).toBe(1475);
      expect(b.baseCp).toBe(1118);
    });
  });
});

describe('a Mega picked by species', () => {
  const moveset: Moveset = {
    fast: { moveId: 'F', name: 'F', dps: 1 } as unknown as Moveset['fast'],
    charged: [],
    source: 'fallback',
    eliteTmCount: 0,
  };

  it('stands in as the base Pokemon, so its build is a Mega that still needs Mega Energy', () => {
    const s = hypotheticalSpecimen('sableye_mega', index, greatMega);
    expect(s.id).toBe('species:sableye_mega');
    expect(s.speciesId).toBe('sableye');
    expect(s.shadow).toBe(false);
    expect(s.megaForm ?? null).toBeNull();
    expect(s.cp).toBe(cpFor(SABLEYE, s.ivs!, 1));

    const b = must(buildsFor(s, index, greatMega), 'sableye_mega');
    expect(b.specimenId).toBe('species:sableye_mega');
    expect(b.mega).toEqual({ ready: false, level4: false });
    // The cap is on the Mega form; the player powers up the base form.
    expect(b.cp).toBeLessThanOrEqual(1500);
    expect(b.cp).toBe(cpFor(SABLEYE_MEGA, s.ivs!, b.level));
    expect(b.baseLevel).toBe(b.level);
    expect(b.baseCp).toBe(cpFor(SABLEYE, s.ivs!, b.baseLevel));
    expect(b.baseCp).toBeLessThan(b.cp);
    expect(buildCost(b, moveset, index).megaEnergy).toBe('needed');
  });

  it('builds a specimen whose species is itself a Mega as a Mega that still needs Mega Energy', () => {
    // coldStartSpecimens makes stand-ins like this: the specimen is the Mega species itself.
    const s = specimen({ speciesId: 'sableye_mega', ivs: IV15, level: { min: 1, max: 1 } });
    const b = must(buildsFor(s, index, greatMega), 'sableye_mega');
    expect(b.mega).toEqual({ ready: false, level4: false });
    expect(buildCost(b, moveset, index).megaEnergy).toBe('needed');
  });

  it('keeps a plain species pick as it was', () => {
    const s = hypotheticalSpecimen('sableye', index, greatMega);
    expect(s.id).toBe('species:sableye');
    expect(s.speciesId).toBe('sableye');
    expect(must(buildsFor(s, index, greatMega), 'sableye').mega).toBeNull();
  });
});
