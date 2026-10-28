import { describe, expect, it } from 'vitest';
import { cpmAt, cpOf, formStats } from '../src/rules/stats.js';
import { makeData, makeSpecies } from './fixtures/synthetic.js';

describe('stats', () => {
  it('half levels index between whole levels', () => {
    const d = makeData({ cpm: [0.1, 0.2, 0.3] });
    expect(cpmAt(d, 1)).toBe(0.1);
    expect(cpmAt(d, 1.5)).toBe(0.2);
    expect(cpmAt(d, 2)).toBe(0.3);
    expect(() => cpmAt(d, 1.25)).toThrow('level 1.25 is not a half level');
    expect(() => cpmAt(d, 3)).toThrow('level 3 is past the CPM table');
  });
  it('combat stats use base + iv times cpm, hp floored with a floor of 10', () => {
    const d = makeData();
    d.species['m'] = makeSpecies('m', { baseStats: { atk: 100, def: 80, hp: 21 } });
    expect(formStats(d, 'm', { atk: 10, def: 0, hp: 1 }, 1)).toEqual({ atk: 55, def: 40, hp: 11 });
    d.species['tiny'] = makeSpecies('tiny', { baseStats: { atk: 1, def: 1, hp: 2 } });
    expect(formStats(d, 'tiny', { atk: 0, def: 0, hp: 0 }, 1).hp).toBe(10);
  });
  it('cp uses unscaled base + iv values', () => {
    const d = makeData();
    d.species['m'] = makeSpecies('m', { baseStats: { atk: 100, def: 100, hp: 100 } });
    // 100 * 10 * 10 * 0.25 / 10 = 250
    expect(cpOf(d, 'm', { atk: 0, def: 0, hp: 0 }, 1)).toBe(250);
    d.species['tiny'] = makeSpecies('tiny', { baseStats: { atk: 1, def: 1, hp: 1 } });
    expect(cpOf(d, 'tiny', { atk: 0, def: 0, hp: 0 }, 1)).toBe(10);
  });
  it('unknown form throws', () => {
    expect(() => formStats(makeData(), 'nope', { atk: 0, def: 0, hp: 0 }, 1)).toThrow('unknown form nope');
  });
});
