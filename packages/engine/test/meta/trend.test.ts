import { describe, expect, it } from 'vitest';
import { blendedOrder, rankTrend } from '../../src/meta/index.js';

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
