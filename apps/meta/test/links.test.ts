import { describe, expect, it } from 'vitest';
import { countersLink, spriteUrl, teamLink } from '../src/links.js';

describe('teamLink', () => {
  it('writes the format pick3 parses, moves included when known', () => {
    expect(
      teamLink('great', [
        { speciesId: 'azumarill', moves: { fast: 'BUBBLE', charged: ['ICE_BEAM', 'PLAY_ROUGH'] } },
        { speciesId: 'tinkaton', moves: null },
        { speciesId: 'clodsire' },
      ]),
    ).toBe(
      'https://pick3.gg/#/t/great/azumarill.BUBBLE.ICE_BEAM.PLAY_ROUGH+tinkaton+clodsire',
    );
  });
});

describe('countersLink', () => {
  it('carries the league so the app does not open in the wrong one', () => {
    expect(countersLink('ultra', 'azumarill')).toBe(
      'https://pick3.gg/#/counters?vs=azumarill&l=ultra',
    );
  });
});

describe('spriteUrl', () => {
  it('points at pick3 and strips the shadow suffix, which has no sprite of its own', () => {
    expect(spriteUrl('azumarill')).toBe('https://pick3.gg/data/sprites/azumarill.webp');
    expect(spriteUrl('sableye_shadow')).toBe('https://pick3.gg/data/sprites/sableye.webp');
  });
});
