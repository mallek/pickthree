import { describe, expect, it } from 'vitest';
import type { BattleSimulator } from '../../src/sim/BattleSimulator.js';
import type { League } from '../../src/gamedata/league.js';
import { matrixIndex, type MatchupMatrix } from '../../src/gamedata/types.js';
import { movesetDrift, sameMoveset, withReplacedRows } from '../../src/sim/matrixSim.js';

const league = { id: 'test', cp: 1500 } as unknown as League;

function matrix(): MatchupMatrix {
  return {
    league: 'test',
    cp: 1500,
    scenarios: [
      { shields: [0, 0], energy: [0, 0] },
      { shields: [1, 1], energy: [0, 0] },
    ],
    candidates: ['alpha', 'beta'],
    opponents: ['x', 'y'],
    candidateMovesets: { alpha: ['F1', 'C1', 'C2'], beta: ['F2', 'C3'] },
    opponentMovesets: { x: ['FX', 'CX'], y: ['FY', 'CY'] },
    ratings: [100, 200, 300, 400, 500, 600, 700, 800],
  };
}

/** Rates a battle 900 when spec A runs the fast move NEW, else 10. */
const fakeSim: BattleSimulator = {
  simulate: (a) => ({
    rating: a.fastMove === 'NEW' ? 900 : 10,
    opRating: 0,
    winner: null,
    turnsToWin: [0, 0],
  }),
};

describe('sameMoveset', () => {
  it('ignores charged move order but not the fast move', () => {
    expect(sameMoveset(['F', 'A', 'B'], ['F', 'B', 'A'])).toBe(true);
    expect(sameMoveset(['F', 'A', 'B'], ['G', 'A', 'B'])).toBe(false);
    expect(sameMoveset(['F', 'A'], ['F', 'A', 'B'])).toBe(false);
  });
});

describe('movesetDrift', () => {
  it('lists only fighters whose moves differ from their matrix row', () => {
    const drift = movesetDrift(
      [
        { speciesId: 'alpha', moveset: ['F1', 'C2', 'C1'] },
        { speciesId: 'beta', moveset: ['NEW', 'C3'] },
        { speciesId: 'beta', moveset: ['F2', 'C3'] },
        { speciesId: 'gamma', moveset: ['F', 'C'] },
      ],
      matrix(),
    );
    expect(drift).toEqual([{ speciesId: 'beta', moveset: ['NEW', 'C3'] }]);
  });
});

describe('withReplacedRows', () => {
  it('re-simulates a row in place and leaves the others alone', () => {
    const m = matrix();
    const out = withReplacedRows(m, [{ speciesId: 'beta', moveset: ['NEW', 'C3'] }], {
      sim: fakeSim,
      league,
    });
    expect(out.candidates).toEqual(m.candidates);
    expect(out.candidateMovesets.beta).toEqual(['NEW', 'C3']);
    for (let o = 0; o < 2; o++) {
      for (let s = 0; s < 2; s++) {
        expect(out.ratings[matrixIndex(out, 1, o, s)]).toBe(900);
        expect(out.ratings[matrixIndex(out, 0, o, s)]).toBe(m.ratings[matrixIndex(m, 0, o, s)]);
      }
    }
    expect(m.ratings).toEqual([100, 200, 300, 400, 500, 600, 700, 800]);
  });

  it('returns the matrix itself when there is nothing to replace', () => {
    const m = matrix();
    expect(withReplacedRows(m, [], { sim: fakeSim, league })).toBe(m);
  });
});
