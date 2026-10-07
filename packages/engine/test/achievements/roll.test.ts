import { describe, expect, it } from 'vitest';
import { KANTO } from '../../src/achievements/kanto.js';
import { fallbackOrder, roll, shinyOdds } from '../../src/achievements/roll.js';

/** A random source that returns the given values in turn, then repeats the last. */
function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)] as number;
}

const ids = (tier: string) => KANTO.filter((k) => k.tier === tier).map((k) => k.id);

describe('shiny odds', () => {
  it('rises with the season streak and is a third for top', () => {
    expect(shinyOdds('easy', 0)).toBe(1 / 20);
    expect(shinyOdds('easy', 1)).toBe(1 / 20);
    expect(shinyOdds('mid', 2)).toBe(1 / 10);
    expect(shinyOdds('hard', 3)).toBe(1 / 5);
    expect(shinyOdds('elite', 9)).toBe(1 / 5);
    expect(shinyOdds('top', 0)).toBe(1 / 3);
  });
});

describe('roll', () => {
  it('draws from its own tier and never repeats an owned species', () => {
    const owned = new Set(ids('easy').slice(1));
    const r = roll('easy', owned, 0, seq(0.99, 0.99));
    expect(r.species).toBe(ids('easy')[0]);
    expect(r.shiny).toBe(false);
  });

  it('rolls shiny when the second draw is under the odds', () => {
    expect(roll('mid', new Set(), 2, seq(0, 0.09)).shiny).toBe(true);
    expect(roll('mid', new Set(), 2, seq(0, 0.1)).shiny).toBe(false);
  });

  it('falls to the nearest tier below when its pool is empty, then above', () => {
    expect(fallbackOrder('elite')).toEqual(['elite', 'hard', 'mid', 'easy']);
    expect(fallbackOrder('mid')).toEqual(['mid', 'easy', 'hard', 'elite']);
    const birdsOwned = new Set(ids('elite'));
    expect(ids('hard')).toContain(roll('elite', birdsOwned, 0, seq(0, 0.99)).species);
    const easyOwned = new Set(ids('easy'));
    expect(ids('mid')).toContain(roll('easy', easyOwned, 0, seq(0, 0.99)).species);
  });

  it('never hands out Mewtwo or Mew from a fallback', () => {
    const allButTop = new Set(KANTO.filter((k) => k.tier !== 'top').map((k) => k.id));
    const r = roll('elite', allButTop, 0, seq(0, 0.99));
    expect(['mewtwo', 'mew']).not.toContain(r.species);
    expect(ids('elite')).toContain(r.species);
  });

  it('draws top from Mewtwo and Mew', () => {
    expect(roll('top', new Set(), 0, seq(0, 0.99)).species).toBe('mewtwo');
    expect(roll('top', new Set(['mewtwo']), 0, seq(0, 0.99)).species).toBe('mew');
  });
});
