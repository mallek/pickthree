import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  effectiveMoveset,
  metaFromRankings,
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

describe('metaFromRankings', () => {
  const r = (id: string, moveset: string[]) =>
    ({
      speciesId: id,
      moveset,
      score: 90,
      rating: 500,
      fastMoves: [],
      chargedMoves: [],
      matchups: [],
      counters: [],
      statProduct: null,
    }) as never;

  it('takes the top n with a fast move and up to two charged moves', () => {
    expect(
      metaFromRankings(
        [r('a', ['F', 'C1', 'C2', 'C3']), r('b', ['F', 'C1']), r('c', ['F', 'C1'])],
        2,
      ),
    ).toEqual([
      { speciesId: 'a', fastMove: 'F', chargedMoves: ['C1', 'C2'] },
      { speciesId: 'b', fastMove: 'F', chargedMoves: ['C1'] },
    ]);
  });

  it('skips an entry with no charged move and still fills n', () => {
    expect(
      metaFromRankings([r('a', ['F']), r('b', ['F', 'C1'])], 1).map((m) => m.speciesId),
    ).toEqual(['b']);
  });
});
