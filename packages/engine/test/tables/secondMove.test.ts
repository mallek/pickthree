import { describe, expect, it } from 'vitest';
import { secondMoveCost } from '../../src/tables/secondMove.js';

const none = { shadow: false, purified: false, lucky: false };

describe('second charged move unlock', () => {
  it('maps PvPoke thirdMoveCost tiers to candy', () => {
    expect(secondMoveCost(10_000, none)).toEqual({ stardust: 10_000, candy: 25 });
    expect(secondMoveCost(50_000, none)).toEqual({ stardust: 50_000, candy: 50 });
    expect(secondMoveCost(75_000, none)).toEqual({ stardust: 75_000, candy: 75 });
    expect(secondMoveCost(100_000, none)).toEqual({ stardust: 100_000, candy: 100 });
  });
  it('shadow costs 1.2x, purified 0.8x', () => {
    expect(secondMoveCost(50_000, { ...none, shadow: true })).toEqual({
      stardust: 60_000,
      candy: 60,
    });
    expect(secondMoveCost(50_000, { ...none, purified: true })).toEqual({
      stardust: 40_000,
      candy: 40,
    });
  });
  it('rejects unknown tiers', () => {
    expect(() => secondMoveCost(12_345, none)).toThrow();
  });
});
