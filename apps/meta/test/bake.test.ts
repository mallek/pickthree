import { describe, expect, it } from 'vitest';
import { bake } from '../scripts/bake.js';

const input = {
  pokemon: [
    { speciesId: 'azumarill', speciesName: 'Azumarill', dex: 184, types: ['water', 'fairy'] },
    {
      speciesId: 'corsola_galarian',
      speciesName: 'Corsola (Galarian)',
      dex: 222,
      types: ['ghost', 'none'],
    },
  ],
  moves: [
    { moveId: 'BUBBLE', name: 'Bubble', type: 'water' },
    { moveId: 'ICE_BEAM', name: 'Ice Beam', type: 'ice' },
  ],
  leagues: [{ id: 'great', meta: 'great' }],
  metaGroups: {
    great: [
      { speciesId: 'azumarill', fastMove: 'BUBBLE', chargedMoves: ['ICE_BEAM', 'PLAY_ROUGH'] },
    ],
  },
  rankings: {
    great: [
      {
        speciesId: 'azumarill',
        score: 88,
        rating: 671,
        fastMoves: [
          { moveId: 'BUBBLE', uses: 100 },
          { moveId: 'ROCK_SMASH', uses: 20 },
        ],
        chargedMoves: [
          { moveId: 'ICE_BEAM', uses: 90 },
          { moveId: 'PLAY_ROUGH', uses: 80 },
          { moveId: 'HYDRO_PUMP', uses: 70 },
          { moveId: 'A', uses: 6 },
          { moveId: 'B', uses: 5 },
        ],
      },
    ],
  },
  manifest: { pvpokeCommit: 'abc1234', pvpokeDate: '2026-09-10' },
};

describe('bake', () => {
  it('shrinks the species list to name, dex and types, dropping the "none" filler type', () => {
    const { species } = bake(input);
    expect(species['azumarill']).toEqual(['Azumarill', 184, 'water,fairy']);
    expect(species['corsola_galarian']).toEqual(['Corsola (Galarian)', 222, 'ghost']);
  });

  it('shrinks moves to name and type', () => {
    expect(bake(input).moves['ICE_BEAM']).toEqual(['Ice Beam', 'ice']);
  });

  it('builds a baseline from the curated group, stamped with the pinned commit', () => {
    const b = bake(input).baselines['great']!;
    expect(b).toMatchObject({
      league: 'great',
      source: 'pvpoke',
      pvpokeCommit: 'abc1234',
      pvpokeDate: '2026-09-10',
    });
    expect(b.species[0]).toMatchObject({
      speciesId: 'azumarill',
      score: 88,
      rating: 671,
      fastMove: 'BUBBLE',
      chargedMoves: ['ICE_BEAM', 'PLAY_ROUGH'],
    });
  });

  it('keeps at most four moves per slot, most used first', () => {
    const b = bake(input).baselines['great']!;
    expect(b.species[0]!.chargedUsage.map((m) => m.moveId)).toEqual([
      'ICE_BEAM',
      'PLAY_ROUGH',
      'HYDRO_PUMP',
      'A',
    ]);
    expect(b.species[0]!.fastUsage).toHaveLength(2);
  });

  it('orders the baseline by PvPoke score, best first, unranked last', () => {
    const two = {
      ...input,
      metaGroups: {
        great: [
          { speciesId: 'corsola_galarian', fastMove: 'ASTONISH', chargedMoves: ['NIGHT_SHADE'] },
          ...input.metaGroups.great,
        ],
      },
    };
    const baked = bake(two).baselines['great']!;
    expect(baked.species.map((s) => s.speciesId)).toEqual(['azumarill', 'corsola_galarian']);
    expect(baked.species[1]!.score).toBeNull();
  });
});
