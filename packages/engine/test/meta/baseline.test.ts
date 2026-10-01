import { describe, expect, it } from 'vitest';
import { baselineFor } from '../../src/meta/index.js';

const usage = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({ moveId: `${prefix}_${i}`, uses: 100 - i }));

const group = [
  { speciesId: 'c', fastMove: 'C_FAST', chargedMoves: ['C_ONE'] },
  { speciesId: 'b', fastMove: 'B_FAST', chargedMoves: ['B_ONE', 'B_TWO'] },
  { speciesId: 'a', fastMove: 'A_FAST', chargedMoves: ['A_ONE', 'A_TWO'] },
];

const overall = [
  {
    speciesId: 'a',
    score: 90,
    rating: 600,
    fastMoves: usage('AF', 6),
    chargedMoves: usage('AC', 5),
  },
  { speciesId: 'b', score: 70, fastMoves: usage('BF', 2) },
  // 'c' has a ranking entry with no score: it sorts after every scored species.
  { speciesId: 'c' },
];

const commit = { pvpokeCommit: 'abc123', pvpokeDate: '2026-09-01' };

describe('baselineFor', () => {
  it('orders the group by PvPoke score, an unscored species last', () => {
    const b = baselineFor('great', group, overall, commit);
    expect(b.species.map((s) => [s.speciesId, s.score])).toEqual([
      ['a', 90],
      ['b', 70],
      ['c', null],
    ]);
  });

  it('carries the league, commit and date', () => {
    const b = baselineFor('great', group, overall, commit);
    expect([b.league, b.pvpokeCommit, b.pvpokeDate]).toEqual(['great', 'abc123', '2026-09-01']);
  });

  it('cuts move usages to four of each kind', () => {
    const a = baselineFor('great', group, overall, commit).species[0];
    expect(a?.fastUsage.map((u) => u.moveId)).toEqual(['AF_0', 'AF_1', 'AF_2', 'AF_3']);
    expect(a?.chargedUsage).toHaveLength(4);
    expect(a?.rating).toBe(600);
  });

  it('gives empty usages and a null rating when the ranking says nothing', () => {
    const c = baselineFor('great', group, overall, commit).byId.get('c');
    expect(c?.fastUsage).toEqual([]);
    expect(c?.chargedUsage).toEqual([]);
    expect(c?.rating).toBeNull();
  });

  it('indexes every entry by id', () => {
    const b = baselineFor('great', group, overall, commit);
    expect(b.byId.get('b')?.fastMove).toBe('B_FAST');
    expect(b.byId.get('b')?.chargedMoves).toEqual(['B_ONE', 'B_TWO']);
    expect(b.byId.size).toBe(3);
  });

  it('copies the charged moves rather than sharing the input array', () => {
    const b = baselineFor('great', group, overall, commit);
    expect(b.byId.get('a')?.chargedMoves).not.toBe(group[2]?.chargedMoves);
  });

  it('ties on score by id', () => {
    const b = baselineFor(
      'great',
      [
        { speciesId: 'y', fastMove: 'F', chargedMoves: [] },
        { speciesId: 'x', fastMove: 'F', chargedMoves: [] },
      ],
      [
        { speciesId: 'x', score: 50 },
        { speciesId: 'y', score: 50 },
      ],
      commit,
    );
    expect(b.species.map((s) => s.speciesId)).toEqual(['x', 'y']);
  });
});
