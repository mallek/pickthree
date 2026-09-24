import { afterEach, describe, expect, it, vi } from 'vitest';
import { communityCores, resetCommunityCache } from '../src/community.ts';
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
