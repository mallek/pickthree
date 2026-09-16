import { describe, expect, it } from 'vitest';
import { blendShare, blendWeights } from '../../src/yourmeta/blend.js';

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
