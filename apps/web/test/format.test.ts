import { describe, expect, it } from 'vitest';
import { costLine, initialOf, scanAge, speciesDisplayName, topPct } from '../src/format.ts';
import { hashFor, parseHash } from '../src/state/store.tsx';

describe('format helpers', () => {
  it('turns PvPoke names into plain names', () => {
    expect(speciesDisplayName('raichu_alolan', { speciesName: 'Raichu (Alolan)' } as never)).toBe(
      'Alolan Raichu',
    );
    expect(
      speciesDisplayName('stunfisk_galarian', { speciesName: 'Stunfisk (Galarian)' } as never),
    ).toBe('Galarian Stunfisk');
    expect(
      speciesDisplayName('quagsire_shadow', { speciesName: 'Quagsire (Shadow)' } as never),
    ).toBe('Shadow Quagsire');
    expect(speciesDisplayName('azumarill', undefined)).toBe('azumarill');
  });

  it('picks the initial after regional and shadow prefixes', () => {
    expect(initialOf('Shadow Annihilape')).toBe('A');
    expect(initialOf('Galarian Stunfisk')).toBe('S');
    expect(initialOf('Tinkaton')).toBe('T');
  });

  it('formats a cost line with optional parts', () => {
    const base = {
      stardust: 214000,
      candy: 231,
      xlCandy: 0,
      eliteTm: 0,
      evolutionCandy: 0,
      secondMoveUnlock: false,
      powerUpSteps: 0,
      estimated: false,
      weight: 0,
    };
    // A non-breaking space before each dot keeps it with the word before it, and inside each part
    // keeps a number with its unit ("88 XL Candy" never splits); the line can still break after
    // a dot.
    expect(costLine(base)).toBe('214,000\u00a0Stardust\u00a0· 231\u00a0Candy');
    expect(costLine({ ...base, xlCandy: 12, eliteTm: 1 })).toBe(
      '214,000\u00a0Stardust\u00a0· 231\u00a0Candy\u00a0· 12\u00a0XL\u00a0Candy\u00a0· 1\u00a0Elite\u00a0TM',
    );
  });

  it('maps rank to a top percent, never below 1', () => {
    expect(topPct({ rank: 1, total: 4096 } as never)).toBe(1);
    expect(topPct({ rank: 410, total: 4096 } as never)).toBe(10);
  });

  it('describes scan age in plain words', () => {
    const now = new Date('2026-09-12T12:00:00');
    expect(scanAge('2026-09-12 08:00', now)).toBe('scanned today');
    expect(scanAge('2026-09-11 08:00', now)).toBe('scanned yesterday');
    expect(scanAge('2026-09-01 08:00', now)).toBe('scanned 11 days ago');
  });
});

describe('hash router', () => {
  it('round-trips every route', () => {
    const routes = [
      { screen: 'welcome' },
      { screen: 'report' },
      { screen: 'teams' },
      { screen: 'team', id: 'a-b-c' },
      { screen: 'collection' },
      { screen: 'specimen', id: '1a2b3c4d' },
    ] as const;
    for (const r of routes) {
      expect(parseHash(hashFor(r))).toEqual(r);
    }
    expect(parseHash('')).toEqual({ screen: 'welcome' });
    expect(parseHash('#/nonsense')).toEqual({ screen: 'welcome' });
  });
});
