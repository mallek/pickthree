import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GREAT_LEAGUE, GREAT_LEAGUE_DEF, matrixIndex } from '@pickthree/engine';
import { PvPokeSimulator, loadPvPokeInNode } from '@pickthree/sim-pvpoke';
import { buildMatrix, MATRIX_SCENARIOS } from '../src/build-matrix.js';
import { GAMEMASTER_PATH } from '../src/paths.js';

const havePvPoke = fs.existsSync(GAMEMASTER_PATH);

describe.skipIf(!havePvPoke)('buildMatrix', () => {
  const sim = new PvPokeSimulator(
    loadPvPokeInNode(JSON.parse(fs.readFileSync(GAMEMASTER_PATH, 'utf8'))),
  );
  const candidates = [
    { speciesId: 'azumarill', moveset: ['BUBBLE', 'ICE_BEAM', 'PLAY_ROUGH'] },
    { speciesId: 'medicham', moveset: ['COUNTER', 'ICE_PUNCH', 'PSYCHIC'] },
    { speciesId: 'altaria', moveset: ['DRAGON_BREATH', 'MOONBLAST', 'FLAMETHROWER'] },
  ];
  const opponents = [
    { speciesId: 'altaria', moveset: ['DRAGON_BREATH', 'MOONBLAST', 'FLAMETHROWER'] },
    { speciesId: 'tinkaton', moveset: ['FAIRY_WIND', 'GIGATON_HAMMER', 'BULLDOZE'] },
  ];

  it('has the right dimensions and index layout', () => {
    const m = buildMatrix({
      sim,
      league: GREAT_LEAGUE_DEF,
      candidates,
      opponents,
      scenarios: MATRIX_SCENARIOS,
    });
    expect(m.candidates).toEqual(['azumarill', 'medicham', 'altaria']);
    expect(m.opponents).toEqual(['altaria', 'tinkaton']);
    expect(m.scenarios.length).toBe(3);
    expect(m.ratings.length).toBe(3 * 2 * 3);
    expect(m.candidateMovesets['medicham']).toEqual(['COUNTER', 'ICE_PUNCH', 'PSYCHIC']);
  });

  it('cells equal a direct simulation', () => {
    const m = buildMatrix({
      sim,
      league: GREAT_LEAGUE_DEF,
      candidates,
      opponents,
      scenarios: MATRIX_SCENARIOS,
    });
    const direct = sim.simulate(
      {
        speciesId: 'azumarill',
        fastMove: 'BUBBLE',
        chargedMoves: ['ICE_BEAM', 'PLAY_ROUGH'],
        shields: 1,
      },
      {
        speciesId: 'altaria',
        fastMove: 'DRAGON_BREATH',
        chargedMoves: ['MOONBLAST', 'FLAMETHROWER'],
        shields: 1,
      },
      GREAT_LEAGUE,
    );
    expect(m.ratings[matrixIndex(m, 0, 0, 1)]).toBe(direct.rating);
  });

  it('mirror matchups score 500 in symmetric scenarios', () => {
    const m = buildMatrix({
      sim,
      league: GREAT_LEAGUE_DEF,
      candidates,
      opponents,
      scenarios: MATRIX_SCENARIOS,
    });
    expect(m.ratings[matrixIndex(m, 2, 0, 1)]).toBe(500);
  });

  it('reports progress', () => {
    const seen: number[] = [];
    buildMatrix({
      sim,
      league: GREAT_LEAGUE_DEF,
      candidates,
      opponents,
      scenarios: MATRIX_SCENARIOS,
      onProgress: (d) => seen.push(d),
    });
    expect(seen.at(-1)).toBe(3 * 2 * 3);
  });
});
