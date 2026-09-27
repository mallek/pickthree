import { describe, expect, it } from 'vitest';
import { DEFAULT_BUILD_OPTIONS, buildsFor, type Build } from '../../src/builds/eligibility.js';
import type { Specimen } from '../../src/collection/specimen.js';
import type { RawScan } from '../../src/csv/parse.js';
import { GameDataIndex } from '../../src/gamedata/index.js';
import { candidatePool } from '../../src/search/candidates.js';
import { MatrixView } from '../../src/search/matrixView.js';
import { haveStaticData, loadStaticData } from '../fixtures.js';

function eevee(id: string, atk: number): Specimen {
  return {
    id,
    speciesId: 'eevee',
    familyId: null,
    ivs: { atk, def: 15, sta: 15 },
    level: { min: 18, max: 18 },
    cp: 509,
    hp: 91,
    shadow: false,
    purified: false,
    lucky: false,
    currentMoves: { fast: null, charged: [] },
    scannedAt: '2026-09-01 00:00',
    raw: {} as RawScan,
  };
}

describe.skipIf(!haveStaticData())('candidatePool exclusions', () => {
  const data = loadStaticData();
  const index = new GameDataIndex(data.species, data.moves);
  const view = new MatrixView(data.matrix);
  const copies = [eevee('e1', 0), eevee('e2', 1)];
  const builds: Build[] = copies.flatMap((s) => buildsFor(s, index, DEFAULT_BUILD_OPTIONS));
  const base = { ...DEFAULT_BUILD_OPTIONS, poolSize: 100, excludedSpecimenIds: [] };
  const poolOf = (opts: { excludedSpecies: string[]; excludedSpecimenIds?: string[] }) =>
    candidatePool(builds, data.rankings, view, index, { ...base, ...opts }).pool;

  it('the fixture Eevees reach more than one battling species, Umbreon among them', () => {
    const species = new Set(poolOf({ excludedSpecies: [] }).map((c) => c.build.speciesId));
    expect(species.has('umbreon')).toBe(true);
    expect(species.size).toBeGreaterThan(1);
  });

  it('a species exclusion drops that species from every copy and keeps their other builds', () => {
    const all = poolOf({ excludedSpecies: [] });
    const without = poolOf({ excludedSpecies: ['umbreon'] });
    expect(without.map((c) => c.build.speciesId)).not.toContain('umbreon');
    const others = all.map((c) => c.build.speciesId).filter((id) => id !== 'umbreon');
    expect(without.map((c) => c.build.speciesId).sort()).toEqual([...others].sort());
    // Both copies can still be the other Eeveelutions.
    const kept = new Set(without.map((c) => c.build.specimenId));
    expect(kept.size).toBeGreaterThan(0);
  });

  it('drops every copy, not just the best one', () => {
    // Excluding the best copy per specimen lets the other copy stand in; excluding the species
    // leaves none.
    const bySpecimen = poolOf({ excludedSpecies: [], excludedSpecimenIds: ['e2'] });
    expect(bySpecimen.map((c) => c.build.speciesId)).toContain('umbreon');
    expect(bySpecimen.every((c) => c.build.specimenId === 'e1')).toBe(true);
    const bySpecies = poolOf({ excludedSpecies: ['umbreon'], excludedSpecimenIds: ['e2'] });
    expect(bySpecies.map((c) => c.build.speciesId)).not.toContain('umbreon');
    expect(bySpecies.length).toBeGreaterThan(0);
  });
});
