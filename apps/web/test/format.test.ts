import { describe, expect, it } from 'vitest';
import {
  costLine,
  costParts,
  coversLine,
  initialOf,
  leagueDetail,
  powerUpLine,
  scanAge,
  speciesDisplayName,
  topPct,
} from '../src/format.ts';
import { hashFor, parseHash } from '../src/state/store.tsx';

describe('format helpers', () => {
  it('says which of your copies an exclusion covers, largest group first', () => {
    expect(
      coversLine([
        { name: 'Melmetal', count: 1 },
        { name: 'Meltan', count: 6 },
      ]),
    ).toBe('Covers your 6 Meltan and 1 Melmetal.');
    expect(coversLine([{ name: 'Meltan', count: 6 }])).toBe('Covers your 6 Meltan.');
    expect(coversLine([{ name: 'Meltan', count: 1 }])).toBe('Covers your 1 Meltan.');
    expect(
      coversLine([
        { name: 'Eevee', count: 2 },
        { name: 'Umbreon', count: 1 },
        { name: 'Shadow Eevee', count: 2 },
      ]),
    ).toBe('Covers your 2 Eevee, 2 Shadow Eevee and 1 Umbreon.');
  });

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
      megaEnergy: null,
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

  it('breaks a cost into parts costLine also builds on, one per component', () => {
    const base = {
      stardust: 214000,
      candy: 231,
      xlCandy: 0,
      eliteTm: 0,
      evolutionCandy: 0,
      secondMoveUnlock: false,
      powerUpSteps: 0,
      estimated: false,
      megaEnergy: null,
      weight: 0,
    };
    expect(costParts(base)).toEqual([
      { amount: '214,000', unit: 'Stardust', text: '214,000\u00a0Stardust' },
      { amount: '231', unit: 'Candy', text: '231\u00a0Candy' },
    ]);
    expect(costParts({ ...base, xlCandy: 12, eliteTm: 1 })).toEqual([
      { amount: '214,000', unit: 'Stardust', text: '214,000\u00a0Stardust' },
      { amount: '231', unit: 'Candy', text: '231\u00a0Candy' },
      { amount: '12', unit: 'XL Candy', text: '12\u00a0XL\u00a0Candy', term: 'XL Candy' },
      { amount: '1', unit: 'Elite TM', text: '1\u00a0Elite\u00a0TM', term: 'Elite TM' },
    ]);
    // costLine is costParts' texts, SEP-joined: the two never drift apart.
    const full = { ...base, xlCandy: 12, eliteTm: 1 };
    expect(costLine(full)).toBe(
      costParts(full)
        .map((p) => p.text)
        .join('\u00a0· '),
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

describe('leagueDetail', () => {
  const rotation = { kind: 'rotation' as const };
  // 20:00 UTC is the same calendar day from UTC-12 to UTC+3, which covers CI (UTC) and the
  // developer's machine; the weekday and date below hold in all of them.
  it('says when a live cup ends', () => {
    expect(leagueDetail({ state: 'live', end: '2026-09-29T20:00:00.000Z' }, rotation)).toEqual([
      'Live, ends Tue 9/29',
    ]);
  });

  it('says when an upcoming cup starts', () => {
    expect(
      leagueDetail({ state: 'upcoming', start: '2026-10-13T20:00:00.000Z' }, rotation),
    ).toEqual(['Starts Tue 10/13']);
  });

  it('adds the PvPoke date for stale rankings', () => {
    expect(
      leagueDetail(
        { state: 'upcoming', start: '2026-10-13T20:00:00.000Z' },
        { ...rotation, stale: true, rankingsUpdated: '2024-03-04' },
      ),
    ).toEqual(['Starts Tue 10/13', 'PvPoke last updated March 2024']);
  });

  it('says nothing for an open league', () => {
    expect(leagueDetail({ state: 'off' }, { kind: 'standard' })).toEqual([]);
  });
});

describe('Mega builds in format helpers', () => {
  const cost = {
    stardust: 1000,
    candy: 10,
    xlCandy: 0,
    eliteTm: 0,
    evolutionCandy: 0,
    secondMoveUnlock: false,
    powerUpSteps: 0,
    estimated: false,
    megaEnergy: null,
    weight: 0,
  };

  it('adds a Mega Energy part when the build needs it, and says so when it was mega-evolved before', () => {
    expect(costParts({ ...cost, megaEnergy: 'needed' }).map((p) => p.text)).toContain(
      'Mega Energy',
    );
    expect(costParts({ ...cost, megaEnergy: 'ready' }).map((p) => p.text)).toContain(
      'Mega Energy (mega-evolved before)',
    );
    const none = costParts({ ...cost, megaEnergy: null }).map((p) => p.text);
    expect(none.some((t) => t.includes('Mega Energy'))).toBe(false);
    expect(costParts({ ...cost, megaEnergy: 'needed' }).at(-1)?.amount).toBe('');
  });

  it('names a Mega with the word first', () => {
    expect(speciesDisplayName('sableye_mega', { speciesName: 'Sableye (Mega)' } as never)).toBe(
      'Mega Sableye',
    );
    expect(
      speciesDisplayName('charizard_mega_y', { speciesName: 'Charizard (Mega Y)' } as never),
    ).toBe('Mega Charizard Y');
    expect(speciesDisplayName('raichu_alolan', { speciesName: 'Raichu (Alolan)' } as never)).toBe(
      'Alolan Raichu',
    );
  });

  it('writes the power-up line with the base CP first, the Mega CP after', () => {
    const plain = { cp: 1498, baseCp: 1498, mega: null };
    expect(powerUpLine(plain)).toBe('Power up to CP 1498');
    const mega = { cp: 1475, baseCp: 1118, mega: { ready: true, level4: false } };
    expect(powerUpLine(mega)).toBe('Power up to CP 1118 (1475 as Mega)');
    const l4 = { cp: 1490, baseCp: 1200, mega: { ready: true, level4: true } };
    expect(powerUpLine(l4)).toBe('Power up to CP 1200 (1490 as Mega, Level 4)');
  });
});
