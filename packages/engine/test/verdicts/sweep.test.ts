import { describe, expect, it } from 'vitest';
import { hypotheticalSpecimen } from '../../src/analyze.js';
import { DEFAULT_BUILD_OPTIONS } from '../../src/builds/eligibility.js';
import { GameDataIndex } from '../../src/gamedata/index.js';
import { verdictsFor } from '../../src/recommend.js';
import type { Specimen } from '../../src/collection/specimen.js';
import { haveStaticData, loadStaticData } from '../fixtures.js';

/**
 * Every released species, as a specimen at several levels, through the verdict path with no
 * simulator. A single throw here would loop the Collection screen for a real player, so the
 * bar is zero.
 */
describe.skipIf(!haveStaticData())('verdicts never throw for any species', () => {
  const data = loadStaticData();
  const index = new GameDataIndex(data.species, data.moves);
  const deps = { data, sim: null as unknown as never, simOptions: undefined };

  it('sweeps the whole game master', () => {
    const specimens: Specimen[] = [];
    for (const sp of data.species) {
      if (!sp.released) {
        continue;
      }
      let base: Specimen;
      try {
        base = hypotheticalSpecimen(sp.speciesId, index, DEFAULT_BUILD_OPTIONS);
      } catch {
        continue; // cannot fit under the cap at all; buildsFor would skip it too
      }
      for (const level of [1, 20, 35, 45]) {
        specimens.push({ ...base, id: `${base.id}:${level}`, level: { min: level, max: level } });
      }
      // The scan Poke Genie saves without the appraisal.
      specimens.push({ ...base, id: `${base.id}:noiv`, ivs: null });
    }
    const failures: string[] = [];
    for (const s of specimens) {
      try {
        verdictsFor([s], {}, deps as never);
      } catch (e) {
        failures.push(`${s.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (failures.length > 0) {
      console.log(failures.slice(0, 30).join('\n'));
    }
    expect(failures).toEqual([]);
  }, 60_000);
});
