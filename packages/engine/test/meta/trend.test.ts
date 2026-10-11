import { describe, expect, it } from 'vitest';
import { blendedOrder, rankTrend, trendingUp } from '../../src/meta/index.js';

describe('blendedOrder', () => {
  it('sorts by weight, heaviest first, ties by id', () => {
    const w = new Map([
      ['b', 0.2],
      ['a', 0.2],
      ['c', 0.6],
    ]);
    expect(blendedOrder(w)).toEqual(['c', 'a', 'b']);
  });
});

describe('rankTrend', () => {
  it('reports places gained as positive and places lost as negative', () => {
    const t = rankTrend(['x', 'y', 'z'], ['y', 'z', 'x']);
    expect(t.get('x')).toBe(2);
    expect(t.get('y')).toBe(-1);
    expect(t.get('z')).toBe(-1);
  });
  it('gives no trend to a species the baseline did not rank', () => {
    expect(rankTrend(['new', 'x'], ['x']).has('new')).toBe(false);
  });
  it('gives zero for an unmoved species', () => {
    expect(rankTrend(['x'], ['x']).get('x')).toBe(0);
  });
});

describe('trendingUp', () => {
  // Current order a..f, heaviest first; baseline weights set so each case below is deliberate.
  const order = ['a', 'b', 'c', 'd', 'e', 'f'];
  const weights = new Map([
    ['a', 0.3],
    ['b', 0.2],
    ['c', 0.15],
    ['d', 0.1],
    ['e', 0.05],
    ['f', 0.005],
  ]);

  it('keeps climbers at or above the share floor, ordered by share gained', () => {
    const trend = new Map([
      ['a', 0],
      ['b', 2],
      ['c', 1],
      ['d', 3],
      ['e', -1],
      ['f', 9],
    ]);
    const before = new Map([
      ['a', 0.3],
      ['b', 0.18],
      ['c', 0.05],
      ['d', 0.06],
      ['e', 0.08],
      ['f', 0.001],
    ]);
    const out = trendingUp(order, trend, weights, before);
    // a did not move, e fell, f is under 1%: none of them qualify.
    expect(out.map((r) => r.speciesId)).toEqual(['c', 'd', 'b']);
    expect(out[0]).toEqual({ speciesId: 'c', places: 1, gained: 0.15 - 0.05 });
  });

  it('keeps a climber whose share dipped, below the ones that gained', () => {
    const trend = new Map([
      ['b', 1],
      ['c', 1],
    ]);
    const before = new Map([
      ['b', 0.25],
      ['c', 0.1],
    ]);
    expect(trendingUp(order, trend, weights, before).map((r) => r.speciesId)).toEqual(['c', 'b']);
  });

  it('breaks a tie in share gained by current rank', () => {
    const trend = new Map([
      ['d', 1],
      ['b', 1],
    ]);
    const before = new Map([
      ['b', 0.1],
      ['d', 0],
    ]);
    expect(trendingUp(order, trend, weights, before).map((r) => r.speciesId)).toEqual(['b', 'd']);
  });

  it('caps the list, five by default', () => {
    const many = Array.from({ length: 8 }, (_, i) => `s${i}`);
    const w = new Map(many.map((id, i) => [id, 0.1 - i * 0.01] as const));
    const t = new Map(many.map((id) => [id, 1] as const));
    expect(trendingUp(many, t, w, new Map())).toHaveLength(5);
    expect(trendingUp(many, t, w, new Map(), { limit: 2 })).toHaveLength(2);
    expect(trendingUp(many, t, w, new Map(), { minShare: 0.05 })).toHaveLength(5);
    expect(trendingUp(many, t, w, new Map(), { minShare: 0.075 })).toHaveLength(3);
  });

  it('is empty with no trend', () => {
    expect(trendingUp(order, new Map(), weights, new Map())).toEqual([]);
  });
});
