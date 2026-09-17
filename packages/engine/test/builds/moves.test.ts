import { describe, expect, it } from 'vitest';
import { movePool, movesetFrom, rankingsById, recommendMoveset } from '../../src/builds/moves.js';
import { GameDataIndex } from '../../src/gamedata/index.js';
import { haveStaticData, loadStaticData } from '../fixtures.js';

describe.skipIf(!haveStaticData())('hand-picked movesets', () => {
  const data = loadStaticData();
  const index = new GameDataIndex(data.species, data.moves);
  const rankings = rankingsById(data.rankings.overall);
  const none = { fast: null, charged: [] };

  it('builds a moveset from chosen move ids with counts and badges', () => {
    const m = movesetFrom(
      'azumarill',
      { fast: 'ROCK_SMASH', charged: ['HYDRO_PUMP'] },
      { fast: 'BUBBLE', charged: ['HYDRO_PUMP'] },
      index,
    );
    expect(m.source).toBe('chosen');
    expect(m.fast.moveId).toBe('ROCK_SMASH');
    expect(m.fast.tm).toBe('tm');
    expect(m.charged.map((c) => c.moveId)).toEqual(['HYDRO_PUMP']);
    expect(m.charged[0]?.tm).toBe('have');
    expect(m.charged[0]?.countFromFast).toBe(
      Math.ceil(index.mustMove('HYDRO_PUMP').energy / index.mustMove('ROCK_SMASH').energyGain),
    );
    expect(m.eliteTmCount).toBe(0);
  });

  it('counts elite moves the Pokemon does not have', () => {
    const m = movesetFrom(
      'altaria',
      { fast: 'DRAGON_BREATH', charged: ['SKY_ATTACK', 'MOONBLAST'] },
      none,
      index,
    );
    expect(m.charged[1]?.tm).toBe('elite');
    expect(m.eliteTmCount).toBe(1);
  });

  it('refuses moves outside the species pool and more than two charged moves', () => {
    expect(() =>
      movesetFrom('azumarill', { fast: 'COUNTER', charged: ['ICE_BEAM'] }, none, index),
    ).toThrow(/Azumarill cannot learn Counter/);
    expect(() =>
      movesetFrom('azumarill', { fast: 'BUBBLE', charged: ['DYNAMIC_PUNCH'] }, none, index),
    ).toThrow(/Azumarill cannot learn Dynamic Punch/);
    expect(() =>
      movesetFrom(
        'azumarill',
        { fast: 'BUBBLE', charged: ['ICE_BEAM', 'PLAY_ROUGH', 'HYDRO_PUMP'] },
        none,
        index,
      ),
    ).toThrow(/two charged moves/);
    expect(() => movesetFrom('azumarill', { fast: 'BUBBLE', charged: [] }, none, index)).toThrow(
      /at least one charged move/,
    );
  });

  it('figures counts against the recommended fast move when none is given', () => {
    const pool = movePool('azumarill', null, rankings, none, { allowEliteTm: true }, index);
    const ice = pool.charged.find((m) => m.moveId === 'ICE_BEAM');
    expect(ice?.countFromFast).toBe(
      Math.ceil(index.mustMove('ICE_BEAM').energy / index.mustMove('BUBBLE').energyGain),
    );
  });

  it('lists the legal pool with the recommendation marked', () => {
    const pool = movePool('azumarill', 'BUBBLE', rankings, none, { allowEliteTm: true }, index);
    expect(pool.fast.map((m) => m.moveId).sort()).toEqual(['BUBBLE', 'ROCK_SMASH']);
    expect(pool.charged.map((m) => m.moveId).sort()).toEqual([
      'HYDRO_PUMP',
      'ICE_BEAM',
      'PLAY_ROUGH',
    ]);
    expect(pool.recommended).toEqual({ fast: 'BUBBLE', charged: ['ICE_BEAM', 'PLAY_ROUGH'] });
    // Charged counts are figured against the fast move the caller is running.
    const ice = pool.charged.find((m) => m.moveId === 'ICE_BEAM');
    expect(ice?.countFromFast).toBe(
      Math.ceil(index.mustMove('ICE_BEAM').energy / index.mustMove('BUBBLE').energyGain),
    );
  });
});

describe.skipIf(!haveStaticData())('fallback moveset for an unranked species', () => {
  const data = loadStaticData();
  const index = new GameDataIndex(data.species, data.moves);
  const overall = rankingsById(data.rankings.overall);

  it('picks the strongest legal pair by move stats, not the first in the pool', () => {
    const sp = index.mustSpecies('magikarp');
    expect(overall.has('magikarp')).toBe(false);
    const m = recommendMoveset(
      'magikarp',
      overall,
      { fast: null, charged: [] },
      { allowEliteTm: true },
      index,
    );
    expect(m.source).toBe('fallback');
    expect(sp.fastMoves).toContain(m.fast.moveId);
    for (const c of m.charged) {
      expect(sp.chargedMoves).toContain(c.moveId);
    }
    // Every other legal fast move scores no higher on damage plus energy per turn.
    const fastScore = (id: string): number => {
      const mv = index.mustMove(id);
      const stab = sp.types.includes(mv.type) ? 1.2 : 1;
      return (mv.power * stab + mv.energyGain) / Math.max(1, mv.turns);
    };
    for (const id of sp.fastMoves) {
      expect(fastScore(id)).toBeLessThanOrEqual(fastScore(m.fast.moveId) + 1e-9);
    }
  });
});
