import { describe, expect, it } from 'vitest';
import type { MatchupMatrix } from '../../src/gamedata/types.js';
import type { Candidate } from '../../src/search/candidates.js';
import type { SlotSim, TeamSim } from '../../src/search/finalists.js';
import { MatrixView } from '../../src/search/matrixView.js';
import type { TrioDraft } from '../../src/search/trios.js';
import { scoreTeam } from '../../src/score/score.js';

const OPPONENTS = Array.from({ length: 12 }, (_, o) => `o${o + 1}`);

/** Three candidates, twelve opponents, the three real scenarios; every cell a win. */
function view(): MatrixView {
  const candidates = ['a', 'b', 'c'];
  const scenarios = [
    { shields: [0, 0] as [number, number], energy: [0, 0] as [number, number] },
    { shields: [1, 1] as [number, number], energy: [0, 0] as [number, number] },
    { shields: [2, 2] as [number, number], energy: [0, 0] as [number, number] },
  ];
  const m: MatchupMatrix = {
    league: 'great',
    cp: 1500,
    scenarios,
    candidates,
    opponents: OPPONENTS,
    candidateMovesets: {},
    opponentMovesets: {},
    ratings: new Array<number>(candidates.length * OPPONENTS.length * scenarios.length).fill(700),
  };
  return new MatrixView(m);
}

function slot(id: string, row: number, role: SlotSim['role']): SlotSim {
  const candidate = {
    build: {
      speciesId: id,
      needsXl: false,
      specimen: { level: { max: 30 } },
    },
    moveset: { charged: [{ moveId: 'C', energy: 45 }] },
    cost: { weight: 1000, powerUpSteps: 10 },
    matrixRow: row,
  } as unknown as Candidate;
  // Simulated results beat every opponent except o12.
  const results = OPPONENTS.map((opponent) => {
    const win = opponent !== 'o12';
    return { opponent, rating: win ? 700 : 400, win };
  });
  return {
    candidate,
    role,
    results,
    wins: results.filter((r) => r.win).length,
    winsWithShield: null,
  };
}

const team: TeamSim = {
  draft: { structure: 'ABC' } as TrioDraft,
  slots: [slot('a', 0, 'lead'), slot('b', 1, 'switch'), slot('c', 2, 'closer')],
  scenario: { lead: '', switch: '', closer: '' },
};

describe('scoreTeam top ten', () => {
  it('counts the top ten by the given list when one is passed', () => {
    // The team covers every opponent except 'o12'; o12 is column 12, outside the first ten.
    const v = view();
    const plain = scoreTeam(team, [team], v);
    const weighted = scoreTeam(team, [team], v, undefined, [], ['o12', 'o1']);
    expect(plain.topUncovered).toBe(0);
    expect(weighted.topUncovered).toBe(1);
  });
});
