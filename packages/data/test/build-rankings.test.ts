import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  effectiveMoveset,
  readGreatMeta,
  readGreatOverrides,
  readGreatRankings,
} from '../src/build-rankings.js';
import { GAMEMASTER_PATH } from '../src/paths.js';

const havePvPoke = fs.existsSync(GAMEMASTER_PATH);

describe.skipIf(!havePvPoke)('great league rankings extraction', () => {
  it('reads overall rankings with slimmed entries', () => {
    const overall = readGreatRankings('overall');
    expect(overall.length).toBeGreaterThan(1000);
    const azu = overall.find((e) => e.speciesId === 'azumarill');
    expect(azu?.moveset).toEqual(['BUBBLE', 'ICE_BEAM', 'PLAY_ROUGH']);
    expect(azu?.score).toBeGreaterThan(80);
    expect(azu?.fastMoves[0]?.moveId).toBe('BUBBLE');
    expect(azu?.matchups.length).toBe(5);
    expect(azu?.counters.length).toBe(5);
    expect(azu?.statProduct ?? 0).toBeGreaterThan(1900);
    expect((azu as unknown as Record<string, unknown>)['editorNotes']).toBeUndefined();
  });

  it('reads every role category', () => {
    for (const cat of ['leads', 'switches', 'closers', 'chargers'] as const) {
      expect(readGreatRankings(cat).length).toBeGreaterThan(1000);
    }
  });

  it('reads the meta group', () => {
    const meta = readGreatMeta();
    expect(meta.length).toBeGreaterThan(30);
    const altaria = meta.find((m) => m.speciesId === 'altaria');
    expect(altaria).toEqual({
      speciesId: 'altaria',
      fastMove: 'DRAGON_BREATH',
      chargedMoves: ['MOONBLAST', 'FLAMETHROWER'],
    });
  });

  it('reads overrides and applies them over the ranking moveset', () => {
    const overrides = readGreatOverrides();
    expect(overrides.length).toBeGreaterThan(500);
    const overall = readGreatRankings('overall');
    const abom = effectiveMoveset('abomasnow', overall, overrides);
    expect(abom).toEqual(['POWDER_SNOW', 'WEATHER_BALL_ICE', 'ENERGY_BALL']);
    const azu = effectiveMoveset('azumarill', overall, overrides);
    expect(azu[0]).toBe('BUBBLE');
    expect(azu.length).toBe(3);
  });
});
