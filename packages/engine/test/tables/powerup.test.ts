import { describe, expect, it } from 'vitest';
import { costToLevel, powerUpCost } from '../../src/tables/powerup.js';

const none = { shadow: false, purified: false, lucky: false };

describe('power-up costs', () => {
  it('level 20 to 40 costs 225,000 stardust and 246 candy', () => {
    expect(costToLevel(20, 40, none)).toEqual({
      stardust: 225_000,
      candy: 246,
      xlCandy: 0,
      steps: 40,
    });
  });
  it('level 1 to 40 costs 270,000 stardust', () => {
    expect(costToLevel(1, 40, none).stardust).toBe(270_000);
  });
  it('level 40 to 50 costs 310,000 stardust and 296 XL candy, no regular candy', () => {
    expect(costToLevel(40, 50, none)).toEqual({
      stardust: 310_000,
      candy: 0,
      xlCandy: 296,
      steps: 20,
    });
  });
  it('a single step at level 39.5 costs 10,000 and 15 candy', () => {
    expect(powerUpCost(39.5)).toEqual({ stardust: 10_000, candy: 15, xlCandy: 0 });
  });
  it('shadow multiplies stardust and candy by 1.2, rounding up per step', () => {
    const r = costToLevel(39, 40, { ...none, shadow: true });
    expect(r.stardust).toBe(24_000);
    expect(r.candy).toBe(36);
  });
  it('purified multiplies by 0.9 and lucky halves stardust', () => {
    expect(costToLevel(39, 40, { ...none, purified: true })).toMatchObject({
      stardust: 18_000,
      candy: 28,
    });
    expect(costToLevel(39, 40, { ...none, lucky: true })).toMatchObject({
      stardust: 10_000,
      candy: 30,
    });
  });
  it('no cost when already at or above target', () => {
    expect(costToLevel(30, 30, none)).toEqual({ stardust: 0, candy: 0, xlCandy: 0, steps: 0 });
    expect(costToLevel(35, 30, none)).toEqual({ stardust: 0, candy: 0, xlCandy: 0, steps: 0 });
  });
});
