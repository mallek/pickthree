import { describe, expect, it } from 'vitest';
import { blendShare, blendWeights, DEFAULT_BLEND_OPTIONS } from '../../src/yourmeta/blend.js';

describe('blendShare', () => {
  it('is zero below the threshold and grows with battles', () => {
    expect(blendShare(0)).toBe(0);
    expect(blendShare(14)).toBe(0);
    expect(blendShare(15)).toBeCloseTo(1 / 3);
    expect(blendShare(30)).toBeCloseTo(1 / 2);
    expect(blendShare(60)).toBeCloseTo(2 / 3);
  });
});

describe('blendWeights', () => {
  const species = ['a', 'b', 'c'];
  const ranks = new Map<string, number | null>([
    ['a', 1],
    ['b', 4],
    ['c', null],
  ]);

  it('returns normalised PvPoke priors when there are too few battles', () => {
    const w = blendWeights({ species, ranks, sightings: new Map([['c', 10]]), battles: 5 });
    const priorSum = 1 + 0.5 + 1 / 8;
    expect(w.get('a')).toBeCloseTo(1 / priorSum);
    expect(w.get('b')).toBeCloseTo(0.5 / priorSum);
    expect(w.get('c')).toBeCloseTo(1 / 8 / priorSum);
  });

  it('mixes a third of the observed share at 15 battles', () => {
    const sightings = new Map([
      ['a', 0],
      ['b', 3],
      ['c', 9],
    ]);
    const w = blendWeights({ species, ranks, sightings, battles: 15 });
    const priorSum = 1 + 0.5 + 1 / 8;
    expect(w.get('c')).toBeCloseTo((2 / 3) * (1 / 8 / priorSum) + (1 / 3) * (9 / 12));
    expect(w.get('a')).toBeCloseTo((2 / 3) * (1 / priorSum));
    let sum = 0;
    for (const v of w.values()) {
      sum += v;
    }
    expect(sum).toBeCloseTo(1);
  });

  it('never drops a species you have not seen to zero', () => {
    const w = blendWeights({ species, ranks, sightings: new Map([['c', 100]]), battles: 1000 });
    expect(w.get('a')).toBeGreaterThan(0);
  });

  it('ignores sightings of species outside the set', () => {
    const w = blendWeights({
      species,
      ranks,
      sightings: new Map([
        ['zzz', 50],
        ['b', 5],
      ]),
      battles: 30,
    });
    expect(w.get('b')).toBeCloseTo(0.5 * (0.5 / (1 + 0.5 + 1 / 8)) + 0.5 * 1);
  });
});

describe('blendShare with an explicit share', () => {
  it('uses the share it is handed and ignores the curve', () => {
    expect(blendShare(0, { ...DEFAULT_BLEND_OPTIONS, share: 0.25 })).toBe(0.25);
    expect(blendShare(10_000, { ...DEFAULT_BLEND_OPTIONS, share: 0.25 })).toBe(0.25);
  });

  it('clamps a nonsense share rather than letting it out', () => {
    expect(blendShare(100, { ...DEFAULT_BLEND_OPTIONS, share: -1 })).toBe(0);
    expect(blendShare(100, { ...DEFAULT_BLEND_OPTIONS, share: 2 })).toBe(1);
  });

  it('treats an explicit zero as a real share, not as absent', () => {
    // share: 0 means measured play has earned no say. A truthiness check would discard it
    // and fall through to the curve, which at 600 battles would wrongly return 20/21.
    expect(blendShare(600, { minBattles: 0, halfLife: 30, share: 0 })).toBe(0);
  });

  it('is unchanged when no share is given', () => {
    expect(blendShare(0)).toBe(0);
    expect(blendShare(14)).toBe(0);
    expect(blendShare(15)).toBeCloseTo(15 / 45, 10);
    expect(blendShare(30)).toBeCloseTo(0.5, 10);
  });
});

describe('the site half-say points', () => {
  const site = { minBattles: 0, halfLife: 300 };
  it('gives measured play half the say at 300 battles', () => {
    expect(blendShare(300, site)).toBeCloseTo(0.5, 10);
  });
  it('holds one grinder to a sixth of the say, however many battles', () => {
    // 900 battles is three quarters on its own; 1 device caps it at 1 / 6.
    const a = Math.min(blendShare(900, site), 1 / (1 + 5));
    expect(blendShare(900, site)).toBeCloseTo(0.75, 10);
    expect(a).toBeCloseTo(1 / 6, 10);
  });
});

describe('unrankedPrior', () => {
  const ranks = new Map<string, number | null>([
    ['azumarill', 1],
    ['nobody', null],
  ]);

  it('defaults to the rank-64 floor, so pick3 is unchanged', () => {
    const w = blendWeights({ species: ['azumarill', 'nobody'], ranks, sightings: new Map(), battles: 0 });
    // priors 1 and 1/8, normalised over 1.125.
    expect(w.get('azumarill')).toBeCloseTo(1 / 1.125, 10);
    expect(w.get('nobody')).toBeCloseTo(0.125 / 1.125, 10);
  });

  it('gives an unlisted species no prior at all when the site asks for zero', () => {
    const w = blendWeights(
      { species: ['azumarill', 'nobody'], ranks, sightings: new Map(), battles: 0 },
      { minBattles: 0, halfLife: 300, unrankedPrior: 0 },
    );
    expect(w.get('azumarill')).toBeCloseTo(1, 10);
    expect(w.get('nobody')).toBe(0);
  });

  it('lets an unlisted species ride entirely on how often it was measured', () => {
    const w = blendWeights(
      {
        species: ['azumarill', 'nobody'],
        ranks,
        sightings: new Map([['nobody', 60]]),
        battles: 300,
      },
      { minBattles: 0, halfLife: 300, unrankedPrior: 0 },
    );
    // a = 0.5. azumarill: 0.5 * 1 + 0.5 * 0. nobody: 0.5 * 0 + 0.5 * 1.
    expect(w.get('azumarill')).toBeCloseTo(0.5, 10);
    expect(w.get('nobody')).toBeCloseTo(0.5, 10);
  });
});
