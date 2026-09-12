import { describe, expect, it } from 'vitest';
import type { MatchupMatrix } from '../../src/gamedata/types.js';
import type { Candidate } from '../../src/search/candidates.js';
import { MatrixView } from '../../src/search/matrixView.js';
import { DEFAULT_TRIO_OPTIONS, generateTrios } from '../../src/search/trios.js';

/** Tiny fake world: 5 candidates, 6 opponents, 3 scenarios (0-0, 1-1, 2-2) with identical cells. */
function fakeWorld(): { view: MatrixView; pool: Candidate[] } {
  const candidates = ['a', 'b', 'c', 'd', 'e'];
  const opponents = ['o1', 'o2', 'o3', 'o4', 'o5', 'o6'];
  // Win pattern per candidate (1 = win).
  const wins: Record<string, number[]> = {
    a: [1, 1, 1, 0, 0, 0], // lead: loses to o4 o5 o6
    b: [0, 0, 0, 1, 1, 1], // beats everything that beats a
    c: [0, 0, 1, 1, 1, 1], // also beats a's counters
    d: [1, 1, 0, 0, 0, 1],
    e: [0, 1, 1, 1, 0, 0],
  };
  const scenarios: MatchupMatrix['scenarios'] = [
    { shields: [0, 0], energy: [0, 0] },
    { shields: [1, 1], energy: [0, 0] },
    { shields: [2, 2], energy: [0, 0] },
  ];
  const ratings: number[] = [];
  for (const c of candidates) {
    for (let o = 0; o < opponents.length; o++) {
      for (let s = 0; s < 3; s++) {
        ratings.push(wins[c]![o] === 1 ? 700 : 300);
      }
    }
  }
  const matrix: MatchupMatrix = {
    league: 'great',
    cp: 1500,
    scenarios,
    candidates,
    opponents,
    candidateMovesets: {},
    opponentMovesets: {},
    ratings,
  };
  const view = new MatrixView(matrix);
  const pool = candidates.map((id, i) => {
    const partial = {
      build: {
        specimenId: `s${id}`,
        speciesId: id,
        shadow: false,
        stageOffset: 0,
        level: 30,
        cp: 1490,
        ivs: { atk: 0, def: 15, sta: 15 },
        needsXl: false,
        specimen: { level: { min: 30, max: 30 }, currentMoves: { fast: null, charged: [] } },
        ivRank: { product: 1000 },
      },
      moveset: {
        fast: { moveId: 'F', energyGain: 3 },
        charged: [{ moveId: 'C', energy: 45 }],
        eliteTmCount: 0,
      },
      cost: {
        weight: 1000 * (i + 1),
        stardust: 0,
        candy: 0,
        xlCandy: 0,
        eliteTm: 0,
        powerUpSteps: 10,
      },
      score: 80,
      overallScore: 80,
      roleScores: { leads: 80, switches: 80, closers: 80, chargers: 80 },
      matrixRow: i,
    };
    return partial as unknown as Candidate;
  });
  return { view, pool };
}

const types = { types: () => ['normal', 'none'] as ['normal', 'none'] };

describe('generateTrios', () => {
  it('finds the ABB line where both back-liners beat the lead counters', () => {
    const { view, pool } = fakeWorld();
    const { drafts, scored } = generateTrios(pool, view, types, {
      ...DEFAULT_TRIO_OPTIONS,
      finalists: 10,
    });
    expect(scored).toBe(10);
    const abc = drafts.find(
      (d) =>
        d.slots
          .map((s) => s.build.speciesId)
          .sort()
          .join('') === 'abc',
    );
    expect(abc).toBeDefined();
    expect(abc?.structure).toBe('ABB');
    expect(abc?.slots[0]?.build.speciesId).toBe('a');
    expect(abc?.abbScore).toBe(1);
    expect(abc?.coverage).toBe(6);
    expect(abc?.leadCounters).toEqual(['o4', 'o5', 'o6']);
  });

  it('labels a spread team balanced and ranks full coverage first', () => {
    const { view, pool } = fakeWorld();
    const { drafts } = generateTrios(pool, view, types, { ...DEFAULT_TRIO_OPTIONS, finalists: 10 });
    expect(drafts[0]?.coverage).toBe(6);
    const ade = drafts.find(
      (d) =>
        d.slots
          .map((s) => s.build.speciesId)
          .sort()
          .join('') === 'ade',
    );
    expect(ade?.structure).toBe('ABC');
  });

  it('honors the style filter', () => {
    const { view, pool } = fakeWorld();
    const abb = generateTrios(pool, view, types, { ...DEFAULT_TRIO_OPTIONS, style: 'abb' });
    expect(abb.drafts.every((d) => d.structure === 'ABB')).toBe(true);
    const bal = generateTrios(pool, view, types, { ...DEFAULT_TRIO_OPTIONS, style: 'balanced' });
    expect(bal.drafts.every((d) => d.structure === 'ABC')).toBe(true);
  });

  it('never repeats a species inside a trio', () => {
    const { view, pool } = fakeWorld();
    const dup = { ...pool[0], build: { ...pool[0]!.build, specimenId: 'other' } } as Candidate;
    const { drafts } = generateTrios([...pool, dup], view, types, {
      ...DEFAULT_TRIO_OPTIONS,
      finalists: 50,
    });
    for (const d of drafts) {
      const ids = d.slots.map((s) => s.build.speciesId);
      expect(new Set(ids).size).toBe(3);
    }
  });
});
