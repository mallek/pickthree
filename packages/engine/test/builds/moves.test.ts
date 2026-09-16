import { describe, expect, it } from 'vitest';
import { movePool, movesetFrom, rankingsById } from '../../src/builds/moves.js';
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
