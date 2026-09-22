import { describe, expect, it } from 'vitest';
import { matrixIndex, type MatchupMatrix, type RankingEntry } from '@pickthree/engine';
import { filterMatrix, filterMeta, filterRankings } from '../src/build-derived.js';

const legal = new Set(['azumarill', 'medicham']);

function entry(speciesId: string, opponents: string[]): RankingEntry {
  return {
    speciesId,
    score: 90,
    rating: 600,
    moveset: ['F', 'C'],
    fastMoves: [],
    chargedMoves: [],
    matchups: opponents.map((opponent) => ({ opponent, rating: 600 })),
    counters: opponents.map((opponent) => ({ opponent, rating: 400 })),
    statProduct: null,
  };
}

describe('filterRankings', () => {
  it('drops banned entries and banned opponents inside the ones it keeps', () => {
    const out = filterRankings(
      [
        entry('azumarill', ['medicham', 'mimikyu']),
        entry('mimikyu', ['azumarill']),
        entry('medicham', ['mimikyu']),
      ],
      legal,
    );
    expect(out.map((e) => e.speciesId)).toEqual(['azumarill', 'medicham']);
    expect(out[0]!.matchups.map((m) => m.opponent)).toEqual(['medicham']);
    expect(out[0]!.counters.map((m) => m.opponent)).toEqual(['medicham']);
    expect(out[1]!.matchups).toEqual([]);
  });
});

describe('filterMeta', () => {
  it('keeps only legal meta entries', () => {
    const out = filterMeta(
      [
        { speciesId: 'azumarill', fastMove: 'BUBBLE', chargedMoves: ['ICE_BEAM'] },
        { speciesId: 'mimikyu', fastMove: 'SHADOW_CLAW', chargedMoves: ['PLAY_ROUGH'] },
      ],
      legal,
    );
    expect(out.map((m) => m.speciesId)).toEqual(['azumarill']);
  });
});

describe('filterMatrix', () => {
  const full: MatchupMatrix = {
    league: 'great',
    cp: 1500,
    scenarios: [
      { shields: [0, 0], energy: [0, 0] },
      { shields: [1, 1], energy: [0, 0] },
    ],
    candidates: ['azumarill', 'mimikyu', 'medicham'],
    opponents: ['mimikyu', 'medicham'],
    candidateMovesets: { azumarill: ['A'], mimikyu: ['M'], medicham: ['D'] },
    opponentMovesets: { mimikyu: ['M'], medicham: ['D'] },
    ratings: [],
  };
  // A rating that encodes its own coordinates, so a misindexed copy is impossible to miss.
  for (let c = 0; c < full.candidates.length; c++) {
    for (let o = 0; o < full.opponents.length; o++) {
      for (let s = 0; s < full.scenarios.length; s++) {
        full.ratings.push(c * 100 + o * 10 + s);
      }
    }
  }

  it('keeps legal rows and columns and carries every rating to its new place', () => {
    const out = filterMatrix(full, legal, 'championshipseries');
    expect(out.league).toBe('championshipseries');
    expect(out.candidates).toEqual(['azumarill', 'medicham']);
    expect(out.opponents).toEqual(['medicham']);
    expect(Object.keys(out.candidateMovesets).sort()).toEqual(['azumarill', 'medicham']);
    expect(Object.keys(out.opponentMovesets)).toEqual(['medicham']);
    expect(out.ratings).toHaveLength(2 * 1 * 2);
    // azumarill (row 0 of the source) vs medicham (column 1 of the source), both scenarios.
    expect(out.ratings[matrixIndex(out, 0, 0, 0)]).toBe(0 * 100 + 1 * 10 + 0);
    expect(out.ratings[matrixIndex(out, 0, 0, 1)]).toBe(0 * 100 + 1 * 10 + 1);
    // medicham (row 2 of the source) vs medicham.
    expect(out.ratings[matrixIndex(out, 1, 0, 0)]).toBe(2 * 100 + 1 * 10 + 0);
  });

  it('returns the matrix unchanged in shape when nothing is banned', () => {
    const everything = new Set(full.candidates);
    const out = filterMatrix(full, everything, 'championshipseries');
    expect(out.candidates).toEqual(full.candidates);
    expect(out.opponents).toEqual(full.opponents);
    expect(out.ratings).toEqual(full.ratings);
  });
});
