import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GREAT_LEAGUE } from '@pickthree/engine';
import { loadPvPokeInNode } from '../src/node-host.js';
import { PvPokeSimulator } from '../src/PvPokeSimulator.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const gmPath = path.resolve(here, '..', '..', 'data', '.pvpoke', 'src', 'data', 'gamemaster.json');
const havePvPoke = fs.existsSync(gmPath);

describe.skipIf(!havePvPoke)('PvPokeSimulator', () => {
  const rt = loadPvPokeInNode(JSON.parse(fs.readFileSync(gmPath, 'utf8')));
  const sim = new PvPokeSimulator(rt);
  const azu = {
    speciesId: 'azumarill',
    fastMove: 'BUBBLE',
    chargedMoves: ['ICE_BEAM', 'PLAY_ROUGH'],
    shields: 1,
  };
  const altaria = {
    speciesId: 'altaria',
    fastMove: 'DRAGON_BREATH',
    chargedMoves: ['MOONBLAST', 'FLAMETHROWER'],
    shields: 1,
  };

  it('is deterministic and symmetric', () => {
    const r1 = sim.simulate(azu, altaria, GREAT_LEAGUE);
    const r2 = sim.simulate(azu, altaria, GREAT_LEAGUE);
    expect(r1).toEqual(r2);
    const flipped = sim.simulate(altaria, azu, GREAT_LEAGUE);
    expect(flipped.rating).toBe(r1.opRating);
    expect(flipped.opRating).toBe(r1.rating);
  });

  it('ratings sum close to 1000 and pick a winner', () => {
    const r = sim.simulate(azu, altaria, GREAT_LEAGUE);
    expect(r.rating + r.opRating).toBeGreaterThanOrEqual(998);
    expect(r.rating + r.opRating).toBeLessThanOrEqual(1000);
    expect(r.winner).toBe(r.rating > r.opRating ? 0 : 1);
  });

  it('honors explicit IVs and level', () => {
    const rankOne = { ...azu, ivs: { atk: 4, def: 15, sta: 13 }, level: 43 };
    const zeroIv = { ...azu, ivs: { atk: 0, def: 0, sta: 0 }, level: 45 };
    const a = sim.simulate(rankOne, altaria, GREAT_LEAGUE);
    const b = sim.simulate(zeroIv, altaria, GREAT_LEAGUE);
    expect(a.rating).not.toBe(b.rating);
  });

  it('applies shield counts', () => {
    const noShields = sim.simulate(
      { ...azu, shields: 0 },
      { ...altaria, shields: 0 },
      GREAT_LEAGUE,
    );
    const twoShields = sim.simulate(
      { ...azu, shields: 2 },
      { ...altaria, shields: 2 },
      GREAT_LEAGUE,
    );
    expect(noShields.rating).not.toBe(twoShields.rating);
  });

  it('rejects unknown species and moves loudly', () => {
    expect(() => sim.simulate({ ...azu, speciesId: 'nope' }, altaria, GREAT_LEAGUE)).toThrow(
      /nope/,
    );
    expect(() => sim.simulate({ ...azu, fastMove: 'NOPE' }, altaria, GREAT_LEAGUE)).toThrow(/NOPE/);
  });
});
