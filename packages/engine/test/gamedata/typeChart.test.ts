import { describe, expect, it } from 'vitest';
import { moveCounts } from '../../src/builds/moves.js';
import {
  classify,
  effectiveness,
  resistances,
  single,
  weaknesses,
} from '../../src/gamedata/typeChart.js';

describe('type chart', () => {
  it('matches Pokemon GO multipliers', () => {
    expect(single('fire', 'grass')).toBeCloseTo(1.6);
    expect(single('fire', 'water')).toBeCloseTo(0.625);
    expect(single('normal', 'ghost')).toBeCloseTo(0.390625);
    expect(single('water', 'normal')).toBe(1);
  });

  it('stacks dual types', () => {
    expect(effectiveness('ground', ['fire', 'steel'])).toBeCloseTo(2.56);
    expect(effectiveness('fighting', ['steel', 'fairy'])).toBe(1);
    expect(effectiveness('ground', ['flying', 'steel'])).toBeCloseTo(0.390625 * 1.6);
    expect(classify(effectiveness('ground', ['flying', 'steel']))).toBe('resisted');
  });

  it('lists weaknesses and resistances for azumarill', () => {
    expect(weaknesses(['water', 'fairy'])).toEqual(['grass', 'electric', 'poison']);
    expect(resistances(['water', 'fairy'])).toEqual(
      expect.arrayContaining(['fire', 'water', 'ice', 'fighting', 'bug', 'dragon', 'dark']),
    );
    expect(resistances(['water', 'fairy'])).not.toContain('steel');
  });
});

describe('move counts', () => {
  it('carries energy between uses', () => {
    // Counter gains 6 per use? PvPoke's Counter: 8 energy over 2 turns is stored as energyGain 6.
    expect(moveCounts(40, 6)).toEqual([7, 7, 6]);
    expect(moveCounts(45, 6)).toEqual([8, 7, 8]);
    expect(moveCounts(35, 5)).toEqual([7, 7, 7]);
  });

  it('caps stored energy at 100', () => {
    expect(moveCounts(100, 3)).toEqual([34, 34, 34]);
  });

  it('returns nothing for moves that never charge', () => {
    expect(moveCounts(50, 0)).toEqual([]);
  });
});
