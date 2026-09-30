import { describe, expect, it } from 'vitest';
import { hypotheticalSpecimen } from '../../src/analyze.js';
import { DEFAULT_BUILD_OPTIONS, buildOptionsFor, buildsFor } from '../../src/builds/eligibility.js';
import type { RawScan } from '../../src/csv/parse.js';
import { GREAT_LEAGUE_DEF } from '../../src/gamedata/league.js';
import type { Species } from '../../src/gamedata/types.js';
import { GameDataIndex } from '../../src/gamedata/index.js';
import { verdictsFor } from '../../src/recommend.js';
import type { Specimen } from '../../src/collection/specimen.js';
import { isAlreadyBuilt } from '../../src/verdicts/worth.js';
import { haveStaticData, loadStaticData } from '../fixtures.js';

/**
 * "Ready to use" became "Built" (design program piece 4, round 2: Collection and the Pokémon
 * detail page). A specimen already at its build's level, with top-tier IVs, reads "Built" with
 * the new sentence and no "Use it." tacked on.
 */
describe.skipIf(!haveStaticData())('Built verdict', () => {
  const data = loadStaticData();
  const index = new GameDataIndex(data.species, data.moves);
  const deps = { data, sim: null as unknown as never, simOptions: undefined };

  it('labels an already-built, top-tier specimen "Built" with the new sentence', () => {
    const bySpeciesId = new Map(data.species.map((sp) => [sp.speciesId, sp]));
    // A final-stage species (no evolution left to recommend) so the best build is the specimen's
    // own species, and a high PvPoke score so it clears the "competitive" bar.
    const finalStage = [...data.rankings.overall]
      .filter(
        (e) => e.score >= 90 && (bySpeciesId.get(e.speciesId)?.evolutionIds.length ?? 0) === 0,
      )
      .sort((a, b) => b.score - a.score)[0];
    expect(finalStage).toBeDefined();

    // Top-10% IVs (hypotheticalSpecimen) at level 1, to find the build's natural level.
    const base = hypotheticalSpecimen(finalStage!.speciesId, index, DEFAULT_BUILD_OPTIONS);
    const probe = verdictsFor([base], {}, deps as never)[base.id]!;
    expect(probe.build).not.toBeNull();
    const level = probe.build!.level;

    // Same IVs, but already at that build's level: nothing left to build.
    const built: Specimen = { ...base, level: { min: level, max: level } };
    const verdict = verdictsFor([built], {}, deps as never)[built.id]!;

    expect(verdict.label).toBe('Built');
    expect(verdict.line).toMatch(
      new RegExp(`^Top \\d+% IVs for ${data.league.title}, already at level ${level}\\.`),
    );
    expect(verdict.line).not.toContain('Use it.');
  });
});

/**
 * Exclusion goes by the Pokémon as it battles, from every copy and every stage it can reach, so a
 * verdict carries every battling species its copy has a build for, not only the best one: the
 * detail page counts the copies an exclusion actually removes from it.
 */
describe.skipIf(!haveStaticData())('verdict buildSpecies', () => {
  const data = loadStaticData();
  const deps = { data, sim: null as unknown as never, simOptions: undefined };
  const eevee: Specimen = {
    id: 'e1',
    speciesId: 'eevee',
    familyId: null,
    ivs: { atk: 0, def: 15, sta: 15 },
    level: { min: 18, max: 18 },
    cp: 509,
    hp: 91,
    shadow: false,
    purified: false,
    lucky: false,
    currentMoves: { fast: null, charged: [] },
    scannedAt: '2026-09-01 00:00',
    raw: {},
  } as unknown as Specimen;

  it('lists every battling species the copy has a build for, the best build among them', () => {
    const v = verdictsFor([eevee], {}, deps as never)['e1']!;
    expect(v.build).not.toBeNull();
    expect(v.buildSpecies).toContain(v.build!.speciesId);
    expect(v.buildSpecies).toContain('umbreon');
    expect(v.buildSpecies).toContain('sylveon');
    expect(new Set(v.buildSpecies).size).toBe(v.buildSpecies.length);
  });

  it('is empty when there is no build', () => {
    const v = verdictsFor([{ ...eevee, ivs: null } as unknown as Specimen], {}, deps as never)[
      'e1'
    ]!;
    expect(v.buildSpecies).toEqual([]);
  });
});

/**
 * A Mega build's level is the Mega's battle level; what the player has to power up to is its
 * base level. A specimen already at that base level reads as built, however high the Mega's own
 * level is (Level 4 battles two levels above it).
 */
describe('isAlreadyBuilt', () => {
  const at = (max: number) => ({ level: { min: max, max } }) as never;

  it('compares the specimen against the level the player powers up to', () => {
    const level4 = {
      stageOffset: 0,
      level: 44,
      baseLevel: 42,
      mega: { ready: true, level4: true },
    };
    expect(isAlreadyBuilt(level4 as never, at(42))).toBe(true);
    expect(isAlreadyBuilt(level4 as never, at(41))).toBe(false);
    const plain = { stageOffset: 0, level: 30, baseLevel: 30, mega: null };
    expect(isAlreadyBuilt(plain as never, at(30))).toBe(true);
    expect(isAlreadyBuilt({ ...plain, stageOffset: 1 } as never, at(30))).toBe(false);
  });
});

describe('isAlreadyBuilt on a Mega build', () => {
  const sp = (speciesId: string, atk: number, def: number, extra: Partial<Species>): Species =>
    ({
      speciesId,
      speciesName: speciesId,
      baseStats: { atk, def, hp: 137 },
      tags: [],
      evolutionIds: [],
      parentId: null,
      familyId: null,
      shadow: false,
      released: true,
      greatLeagueIneligible: false,
      levelFloor: null,
      ...extra,
    }) as Species;
  const index = new GameDataIndex(
    [
      sp('sableye', 141, 136, {}),
      sp('sableye_mega', 151, 216, { megaOf: 'sableye', tags: ['mega'] }),
    ],
    [],
  );
  const opts = buildOptionsFor({ ...GREAT_LEAGUE_DEF, exclude: [], minCp: 0 });
  // At 27.5 this Sableye is as far as its Mega build powers it up (Mega Sableye 1475 CP).
  const at275 = (megaForm: 'mega' | null): Specimen => ({
    id: 'x',
    speciesId: 'sableye',
    familyId: null,
    ivs: { atk: 10, def: 15, sta: 14 },
    level: { min: 27.5, max: 27.5 },
    cp: 1118,
    hp: 100,
    shadow: false,
    purified: false,
    lucky: false,
    megaForm,
    currentMoves: { fast: null, charged: [] },
    scannedAt: '',
    raw: {} as RawScan,
  });
  const megaBuild = (s: Specimen) => {
    const b = buildsFor(s, index, opts).find((x) => x.speciesId === 'sableye_mega');
    if (!b) {
      throw new Error('no Mega build');
    }
    return b;
  };

  it('is not built until it has Mega Evolved, even at the base level', () => {
    const s = at275(null);
    const b = megaBuild(s);
    expect(b.baseLevel).toBe(27.5);
    expect(isAlreadyBuilt(b, s)).toBe(false);
  });

  it('is built when marked and at the base level', () => {
    const s = at275('mega');
    const b = megaBuild(s);
    expect(b.mega?.ready).toBe(true);
    expect(isAlreadyBuilt(b, s)).toBe(true);
  });
});
