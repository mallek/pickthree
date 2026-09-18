import { describe, expect, it, vi } from 'vitest';
import { loadStatic, resetStatic, seasonAt, speciesOf } from '../src/data.js';

const files: Record<string, unknown> = {
  '/species.json': {
    azumarill: ['Azumarill', 184, 'water,fairy'],
    sableye_shadow: ['Sableye (Shadow)', 302, 'dark,ghost'],
    flabebe: ['Flab\u00e9b\u00e9', 669, 'fairy'],
  },
  '/moves.json': { BUBBLE: ['Bubble', 'water'] },
  '/leagues.json': [{ id: 'great', title: 'Great League', short: 'Great', cp: 1500 }],
  '/seasons.json': [{ id: 28, name: 'Twilight Trails', start: '2026-09-08T13:00:00-07:00' }],
};

const fetcher = vi.fn(async (url: string) =>
  url in files
    ? new Response(JSON.stringify(files[url]), { status: 200 })
    : new Response('no', { status: 404 }),
) as unknown as typeof fetch;

describe('loadStatic', () => {
  it('shapes species with a short name, a shadow flag and ASCII only', async () => {
    const data = await loadStatic(fetcher);
    expect(data.species.get('sableye_shadow')).toEqual({
      id: 'sableye_shadow',
      name: 'Sableye (Shadow)',
      short: 'Sableye-S',
      dex: 302,
      types: ['dark', 'ghost'],
      shadow: true,
    });
    expect(data.species.get('flabebe')!.name).toBe('Flabebe');
  });

  it('shapes moves and keeps the leagues and seasons as given', async () => {
    const data = await loadStatic(fetcher);
    expect(data.moves.get('BUBBLE')).toEqual({ id: 'BUBBLE', name: 'Bubble', type: 'water' });
    expect(data.leagues[0]!.id).toBe('great');
    expect(data.seasons[0]!.id).toBe(28);
  });
});

describe('speciesOf', () => {
  it('invents a readable entry for an id it has never seen', async () => {
    const data = await loadStatic(fetcher);
    expect(speciesOf(data, 'brand_new_mon')).toMatchObject({
      id: 'brand_new_mon',
      name: 'Brand New Mon',
      types: [],
      dex: 0,
    });
  });

  it('never returns a blank or whitespace-only name for a degenerate id', async () => {
    const data = await loadStatic(fetcher);
    const empty = speciesOf(data, '');
    expect(empty.name.trim().length).toBeGreaterThan(0);
    const underscores = speciesOf(data, '___');
    expect(underscores.name.trim().length).toBeGreaterThan(0);
  });
});

describe('seasonAt', () => {
  const seasons = [
    { id: 27, name: 'Season 27', start: '2026-06-02T13:00:00-07:00' },
    { id: 28, name: 'Twilight Trails', start: '2026-09-08T13:00:00-07:00' },
    { id: 29, name: 'Season 29', start: '2026-12-01T13:00:00-08:00' },
  ];

  it('picks the season that had started', () => {
    expect(seasonAt(seasons, new Date('2026-09-18T12:00:00Z'))!.id).toBe(28);
    expect(seasonAt(seasons, new Date('2026-12-05T12:00:00Z'))!.id).toBe(29);
  });

  it('says nothing when the list starts after the moment asked about', () => {
    expect(seasonAt(seasons, new Date('2026-01-01T00:00:00Z'))).toBeNull();
    expect(seasonAt([], new Date())).toBeNull();
  });
});

describe('resetStatic', () => {
  it('forgets the memoised load so a later call reflects a new stub', async () => {
    const firstFiles: Record<string, unknown> = {
      '/species.json': { azumarill: ['Azumarill', 184, 'water,fairy'] },
      '/moves.json': {},
      '/leagues.json': [],
      '/seasons.json': [],
    };
    const secondFiles: Record<string, unknown> = {
      '/species.json': { medicham: ['Medicham', 308, 'fighting,psychic'] },
      '/moves.json': {},
      '/leagues.json': [],
      '/seasons.json': [],
    };
    const first = vi.fn(async (url: string) =>
      url in firstFiles
        ? new Response(JSON.stringify(firstFiles[url]), { status: 200 })
        : new Response('no', { status: 404 }),
    ) as unknown as typeof fetch;
    const second = vi.fn(async (url: string) =>
      url in secondFiles
        ? new Response(JSON.stringify(secondFiles[url]), { status: 200 })
        : new Response('no', { status: 404 }),
    ) as unknown as typeof fetch;

    const before = await loadStatic(first);
    expect(before.species.has('azumarill')).toBe(true);
    // Without the reset, this next call would silently reuse `before` and still lack medicham.
    expect(before.species.has('medicham')).toBe(false);

    resetStatic();
    const after = await loadStatic(second);
    expect(after.species.has('medicham')).toBe(true);
    expect(after.species.has('azumarill')).toBe(false);
  });
});
