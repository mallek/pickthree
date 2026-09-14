import { describe, expect, it } from 'vitest';
import { buildCost } from '../../src/builds/cost.js';
import { DEFAULT_BUILD_OPTIONS, buildsFor } from '../../src/builds/eligibility.js';
import { rankingsById, recommendMoveset } from '../../src/builds/moves.js';
import { toSpecimens, type Specimen } from '../../src/collection/specimen.js';
import { parseCollectionCsv, type RawScan } from '../../src/csv/parse.js';
import { GameDataIndex } from '../../src/gamedata/index.js';
import { evolutionCandy, evolutionCandyPath } from '../../src/tables/evolution.js';
import { costToLevel } from '../../src/tables/powerup.js';
import { haveStaticData, loadFixtureCsv, loadStaticData } from '../fixtures.js';

function fakeSpecimen(partial: Partial<Specimen> & { speciesId: string }): Specimen {
  const raw = {} as RawScan;
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
    raw,
    ...partial,
  };
}

describe.skipIf(!haveStaticData())('eligibility', () => {
  const data = loadStaticData();
  const index = new GameDataIndex(data.species, data.moves);

  it('rookidee at level 1 yields the later stages only', () => {
    const s = fakeSpecimen({
      speciesId: 'rookidee',
      ivs: { atk: 15, def: 14, sta: 13 },
      level: { min: 1, max: 1 },
    });
    const builds = buildsFor(s, index, DEFAULT_BUILD_OPTIONS);
    const ids = builds.map((b) => b.speciesId);
    expect(ids).toContain('corviknight');
    expect(ids).not.toContain('rookidee');
    const corv = builds.find((b) => b.speciesId === 'corviknight');
    expect(corv?.cp).toBeLessThanOrEqual(1500);
    expect(corv?.cp).toBeGreaterThanOrEqual(1400);
    expect(corv?.stageOffset).toBe(2);
  });

  it('a Pokemon already over the cap yields nothing', () => {
    const s = fakeSpecimen({
      speciesId: 'snorlax',
      ivs: { atk: 15, def: 15, sta: 14 },
      level: { min: 27.5, max: 27.5 },
    });
    expect(buildsFor(s, index, DEFAULT_BUILD_OPTIONS)).toEqual([]);
  });

  it('a Great League ready medicham keeps its level', () => {
    const s = fakeSpecimen({
      speciesId: 'medicham',
      ivs: { atk: 7, def: 15, sta: 14 },
      level: { min: 49, max: 49 },
    });
    const builds = buildsFor(s, index, DEFAULT_BUILD_OPTIONS);
    expect(builds.length).toBe(1);
    expect(builds[0]?.level).toBeGreaterThanOrEqual(49);
    expect(builds[0]?.needsXl).toBe(true);
  });

  it('honors the XL and shadow filters', () => {
    const s = fakeSpecimen({
      speciesId: 'medicham',
      ivs: { atk: 7, def: 15, sta: 14 },
      level: { min: 30, max: 30 },
    });
    const noXl = buildsFor(s, index, { ...DEFAULT_BUILD_OPTIONS, allowXl: false });
    expect(noXl.every((b) => b.level <= 40)).toBe(true);
    const shadow = fakeSpecimen({
      speciesId: 'quagsire_shadow',
      shadow: true,
      level: { min: 20, max: 20 },
    });
    expect(buildsFor(shadow, index, { ...DEFAULT_BUILD_OPTIONS, allowShadow: false })).toEqual([]);
    expect(buildsFor(shadow, index, DEFAULT_BUILD_OPTIONS).length).toBe(1);
  });

  it('skips blank-IV specimens and ineligible species', () => {
    expect(
      buildsFor(fakeSpecimen({ speciesId: 'azumarill', ivs: null }), index, DEFAULT_BUILD_OPTIONS),
    ).toEqual([]);
    expect(
      buildsFor(
        fakeSpecimen({ speciesId: 'mewtwo', level: { min: 1, max: 1 } }),
        index,
        DEFAULT_BUILD_OPTIONS,
      ),
    ).toEqual([]);
  });
});

describe.skipIf(!haveStaticData())('movesets', () => {
  const data = loadStaticData();
  const index = new GameDataIndex(data.species, data.moves);
  const rankings = rankingsById(data.rankings.overall);
  const none = { fast: null, charged: [] };

  it('uses ranking usage order and counts fast moves', () => {
    const m = recommendMoveset('azumarill', rankings, none, { allowEliteTm: true }, index);
    expect(m.source).toBe('rankings');
    expect(m.fast.moveId).toBe('BUBBLE');
    expect(m.charged.map((c) => c.moveId)).toEqual(['ICE_BEAM', 'PLAY_ROUGH']);
    expect(m.charged[0]?.countFromFast).toBe(Math.ceil(55 / index.mustMove('BUBBLE').energyGain));
  });

  it('marks TM badges from scanned moves and elite lists', () => {
    const m = recommendMoveset(
      'quagsire_shadow',
      rankings,
      { fast: 'MUD_SHOT', charged: [] },
      { allowEliteTm: true },
      index,
    );
    expect(m.fast.tm).toBe('have');
    const aqua = recommendMoveset(
      'quagsire_shadow',
      rankings,
      { fast: null, charged: ['AQUA_TAIL'] },
      { allowEliteTm: true },
      index,
    );
    const at = aqua.charged.find((c) => c.moveId === 'AQUA_TAIL');
    if (at) {
      expect(at.tm).toBe('have');
    }
  });

  it('drops elite moves when disallowed', () => {
    const species = index.mustSpecies('altaria');
    const withElite = recommendMoveset('altaria', rankings, none, { allowEliteTm: true }, index);
    const without = recommendMoveset('altaria', rankings, none, { allowEliteTm: false }, index);
    const eliteIds = new Set([...species.eliteMoves, ...species.legacyMoves]);
    expect(without.charged.every((c) => !eliteIds.has(c.moveId))).toBe(true);
    expect(without.eliteTmCount).toBe(0);
    expect(withElite.charged.length).toBeGreaterThan(0);
  });

  it('falls back to the species pool when unranked', () => {
    const m = recommendMoveset('caterpie', rankings, none, { allowEliteTm: true }, index);
    expect(m.source).toBe('fallback');
    expect(m.fast.moveId).toBeTruthy();
  });
});

describe.skipIf(!haveStaticData())('evolution candy and cost', () => {
  const data = loadStaticData();
  const index = new GameDataIndex(data.species, data.moves);
  const rankings = rankingsById(data.rankings.overall);

  it('uses overrides and the heuristic', () => {
    expect(evolutionCandy('magikarp', 'gyarados', index)).toEqual({ candy: 400, estimated: false });
    expect(evolutionCandy('rookidee', 'corvisquire', index)).toEqual({
      candy: 50,
      estimated: false,
    });
    expect(evolutionCandyPath('rookidee', 'corviknight', index).candy).toBe(150);
    expect(evolutionCandyPath('rookidee_shadow', 'corviknight_shadow', index).candy).toBe(150);
    expect(evolutionCandy('azumarill', 'azumarill', index)).toEqual({ candy: 0, estimated: false });
    const h = evolutionCandy('wattrel', 'kilowattrel', index);
    expect(h.candy).toBeGreaterThan(0);
  });

  it('costs a power-up only build with a second move unlock', () => {
    const s = fakeSpecimen({
      speciesId: 'azumarill',
      ivs: { atk: 4, def: 15, sta: 13 },
      level: { min: 40, max: 40 },
    });
    const [build] = buildsFor(s, index, DEFAULT_BUILD_OPTIONS);
    const moveset = recommendMoveset(
      'azumarill',
      rankings,
      s.currentMoves,
      { allowEliteTm: true },
      index,
    );
    const cost = buildCost(build as NonNullable<typeof build>, moveset, index);
    const expectedPower = costToLevel(40, 43, { shadow: false, purified: false, lucky: false });
    expect(cost.xlCandy).toBe(expectedPower.xlCandy);
    expect(cost.stardust).toBe(expectedPower.stardust + 50000);
    expect(cost.candy).toBe(expectedPower.candy + 50);
    expect(cost.secondMoveUnlock).toBe(true);
    expect(cost.eliteTm).toBe(0);
    expect(cost.estimated).toBe(false);
  });

  it('adds evolution candy and shadow multipliers', () => {
    const s = fakeSpecimen({
      speciesId: 'rookidee_shadow',
      shadow: true,
      ivs: { atk: 15, def: 14, sta: 13 },
      level: { min: 1, max: 1 },
    });
    const corv = buildsFor(s, index, DEFAULT_BUILD_OPTIONS).find(
      (b) => b.speciesId === 'corviknight_shadow',
    );
    expect(corv).toBeDefined();
    const moveset = recommendMoveset(
      'corviknight_shadow',
      rankings,
      s.currentMoves,
      { allowEliteTm: true },
      index,
    );
    const cost = buildCost(corv as NonNullable<typeof corv>, moveset, index);
    expect(cost.evolutionCandy).toBe(150);
    const plain = costToLevel(1, (corv as NonNullable<typeof corv>).level, {
      shadow: false,
      purified: false,
      lucky: false,
    });
    expect(cost.stardust).toBeGreaterThan(plain.stardust);
  });

  it('runs over the whole fixture without throwing', () => {
    const parsed = parseCollectionCsv(loadFixtureCsv(), index);
    const { specimens } = toSpecimens(parsed, index);
    let builds = 0;
    for (const s of specimens) {
      for (const b of buildsFor(s, index, DEFAULT_BUILD_OPTIONS)) {
        const m = recommendMoveset(
          b.speciesId,
          rankings,
          s.currentMoves,
          { allowEliteTm: true },
          index,
        );
        const c = buildCost(b, m, index);
        expect(c.stardust).toBeGreaterThanOrEqual(0);
        builds += 1;
      }
    }
    expect(builds).toBeGreaterThan(30);
  });
});
