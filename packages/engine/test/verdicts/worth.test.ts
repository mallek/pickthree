import { describe, expect, it } from 'vitest';
import { hypotheticalSpecimen } from '../../src/analyze.js';
import { DEFAULT_BUILD_OPTIONS } from '../../src/builds/eligibility.js';
import { GameDataIndex } from '../../src/gamedata/index.js';
import { verdictsFor } from '../../src/recommend.js';
import type { Specimen } from '../../src/collection/specimen.js';
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
