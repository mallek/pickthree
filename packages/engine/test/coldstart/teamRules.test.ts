import { describe, expect, it } from 'vitest';
import { generateColdStartTeams } from '../../src/coldstart/teams.js';
import type { MatchupMatrix } from '../../src/gamedata/types.js';
import type { Candidate } from '../../src/search/candidates.js';
import { MatrixView } from '../../src/search/matrixView.js';

const baseOf = (id: string): string => id.replace(/_mega$/, '');
const types = { types: () => ['normal', 'none'] as ['normal', 'none'], baseOf };

/** Five fighters with distinct win patterns over six opponents; identity comes from the ids. */
function world(ids: string[], megas: string[]): { view: MatrixView; pool: Candidate[] } {
  const opponents = ['o1', 'o2', 'o3', 'o4', 'o5', 'o6'];
  const wins = [
    [1, 1, 1, 0, 0, 0],
    [0, 0, 0, 1, 1, 1],
    [0, 0, 1, 1, 1, 1],
    [1, 1, 0, 0, 0, 1],
    [0, 1, 1, 1, 0, 0],
  ];
  const scenarios: MatchupMatrix['scenarios'] = [
    { shields: [0, 0], energy: [0, 0] },
    { shields: [1, 1], energy: [0, 0] },
    { shields: [2, 2], energy: [0, 0] },
  ];
  const ratings: number[] = [];
  ids.forEach((_, c) => {
    for (let o = 0; o < opponents.length; o++) {
      for (let s = 0; s < 3; s++) {
        ratings.push(wins[c]![o] === 1 ? 700 : 300);
      }
    }
  });
  const view = new MatrixView({
    league: 'great',
    cp: 1500,
    scenarios,
    candidates: ids,
    opponents,
    candidateMovesets: {},
    opponentMovesets: {},
    ratings,
  });
  const pool = ids.map(
    (id, i) =>
      ({
        build: {
          specimenId: `s${i}`,
          speciesId: id,
          mega: megas.includes(id) ? { ready: true, level4: false } : null,
        },
        cost: { weight: 1 },
        roleScores: { leads: 80, switches: 80, closers: 80, chargers: 80 },
        matrixRow: i,
      }) as unknown as Candidate,
  );
  return { view, pool };
}

describe('generateColdStartTeams team rules', () => {
  it('never pairs a species with its Mega', () => {
    const { view, pool } = world(['a', 'a_mega', 'c', 'd', 'e'], ['a_mega']);
    const teams = generateColdStartTeams(pool, view, types, { results: 20 });
    // 10 trios minus the 3 holding both a and a_mega.
    expect(teams).toHaveLength(7);
    for (const t of teams) {
      expect(new Set(t.species.map(baseOf)).size).toBe(3);
    }
  });

  it('never fields two Megas of different species', () => {
    const { view, pool } = world(['a_mega', 'b_mega', 'c', 'd', 'e'], ['a_mega', 'b_mega']);
    const teams = generateColdStartTeams(pool, view, types, { results: 20 });
    expect(teams).toHaveLength(7);
    for (const t of teams) {
      expect(t.species.filter((s) => s.endsWith('_mega')).length).toBeLessThanOrEqual(1);
    }
  });
});
