import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommunityPairing } from '@pickthree/engine';
import { communityCores, likelyTeammates, resetCommunityCache } from '../src/community.ts';
import { DEFAULT_SETTINGS } from '../src/storage/db.ts';

afterEach(() => {
  resetCommunityCache();
  vi.restoreAllMocks();
});

describe('communityCores', () => {
  it('sends since and until, which the worker requires', async () => {
    vi.spyOn(await import('../src/metaShare.ts'), 'shareEligible').mockReturnValue(true);
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ cores: [] })));
    await communityCores(DEFAULT_SETTINGS, 'great', {
      since: '2026-09-17T00:00:00.000Z',
      until: '2026-09-24T00:00:00.000Z',
    });
    const url = new URL(spy.mock.calls[0]![0] as string);
    expect(url.searchParams.get('since')).toBe('2026-09-17T00:00:00.000Z');
    expect(url.searchParams.get('until')).toBe('2026-09-24T00:00:00.000Z');
    expect(url.searchParams.get('league')).toBe('great');
  });

  it('returns null and does not fetch when the window is null', async () => {
    vi.spyOn(await import('../src/metaShare.ts'), 'shareEligible').mockReturnValue(true);
    const spy = vi.spyOn(globalThis, 'fetch');
    expect(await communityCores(DEFAULT_SETTINGS, 'great', null)).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('likelyTeammates', () => {
  it('ranks partners of the opponent by sightings, pairs and thirds', () => {
    const cores: CommunityPairing[] = [
      {
        species: ['medicham', 'azumarill'],
        thirds: [
          { speciesId: 'galvantula', sightings: 5 },
          { speciesId: 'skarmory', sightings: 2 },
        ],
      },
      { species: ['medicham', 'skarmory'], thirds: [{ speciesId: 'azumarill', sightings: 1 }] },
      { species: ['tinkaton', 'azumarill'], thirds: [{ speciesId: 'medicham', sightings: 9 }] },
    ];
    expect(likelyTeammates(cores, 'medicham', [])).toEqual(['azumarill', 'galvantula', 'skarmory']);
  });

  it('skips species already slotted and caps the list', () => {
    const cores: CommunityPairing[] = [
      {
        species: ['medicham', 'azumarill'],
        thirds: [
          { speciesId: 'galvantula', sightings: 5 },
          { speciesId: 'skarmory', sightings: 2 },
        ],
      },
      { species: ['medicham', 'skarmory'], thirds: [{ speciesId: 'azumarill', sightings: 1 }] },
      { species: ['tinkaton', 'azumarill'], thirds: [{ speciesId: 'medicham', sightings: 9 }] },
    ];
    expect(likelyTeammates(cores, 'medicham', ['azumarill'], 1)).toEqual(['galvantula']);
  });

  it('is empty for an opponent the board has never seen', () => {
    const cores: CommunityPairing[] = [
      {
        species: ['medicham', 'azumarill'],
        thirds: [
          { speciesId: 'galvantula', sightings: 5 },
          { speciesId: 'skarmory', sightings: 2 },
        ],
      },
      { species: ['medicham', 'skarmory'], thirds: [{ speciesId: 'azumarill', sightings: 1 }] },
      { species: ['tinkaton', 'azumarill'], thirds: [{ speciesId: 'medicham', sightings: 9 }] },
    ];
    expect(likelyTeammates(cores, 'snorlax', [])).toEqual([]);
  });
});
