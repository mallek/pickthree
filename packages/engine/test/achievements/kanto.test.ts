import { describe, expect, it } from 'vitest';
import { KANTO } from '../../src/achievements/kanto.js';

describe('Kanto tier table', () => {
  it('holds exactly dex 1 to 151, each id once', () => {
    expect(KANTO.map((k) => k.dex)).toEqual(Array.from({ length: 151 }, (_, i) => i + 1));
    expect(new Set(KANTO.map((k) => k.id)).size).toBe(151);
  });

  it('keeps Mewtwo and Mew alone in top and the three birds alone in elite', () => {
    expect(KANTO.filter((k) => k.tier === 'top').map((k) => k.id)).toEqual(['mewtwo', 'mew']);
    expect(KANTO.filter((k) => k.tier === 'elite').map((k) => k.id)).toEqual([
      'articuno',
      'zapdos',
      'moltres',
    ]);
  });

  it('starts the lines in easy and puts their ends above it', () => {
    const tier = (id: string) => KANTO.find((k) => k.id === id)?.tier;
    expect(tier('bulbasaur')).toBe('easy');
    expect(tier('ivysaur')).toBe('mid');
    expect(tier('venusaur')).toBe('hard');
    expect(tier('gyarados')).toBe('hard');
    expect(tier('snorlax')).toBe('hard');
  });
});
