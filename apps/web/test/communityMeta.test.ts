// @vitest-environment node
//
// This module is plain functions over fetch, with no DOM dependency. The node environment is
// needed so `new URL(relative, import.meta.url)` below resolves to a real file: URL; under jsdom,
// Vite's import.meta.url asset analysis rewrites that pattern to an http: dev-server URL and
// fileURLToPath rejects it.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  communityLeague,
  communityRequest,
  loadCommunity,
  resetCommunityMetaCache,
  trimSummary,
} from '../src/communityMeta.ts';

const SAMPLE = JSON.parse(
  fs.readFileSync(
    fileURLToPath(new URL('../../../fixtures/community-meta-sample.json', import.meta.url)),
    'utf8',
  ),
);
const SEASONS = [{ id: 28, name: 'Twilight Trails', start: '2026-09-08T13:00:00-07:00' }];
const GREAT = { id: 'great', kind: 'standard' as const, meta: 'great' };
const NOW = new Date('2026-09-24T00:03:00Z');

function ok(body: unknown): typeof fetch {
  return vi.fn(
    async () => new Response(JSON.stringify(body), { status: 200 }),
  ) as unknown as typeof fetch;
}

beforeEach(() => resetCommunityMetaCache());

describe('communityLeague', () => {
  it('maps standard leagues to themselves, the Tournament cup to its meta league, specials to none', () => {
    expect(communityLeague(GREAT)).toBe('great');
    expect(communityLeague({ id: 'championshipseries', kind: 'cup', meta: 'great' })).toBe('great');
    expect(communityLeague({ id: 'halloween', kind: 'special', meta: 'halloween' })).toBeNull();
  });
});

describe('communityRequest', () => {
  it('resolves the window the way meta.pick3.gg does, bucketed', () => {
    const r = communityRequest(GREAT, '7', SEASONS, [], NOW)!;
    expect(r.until).toBe('2026-09-24T00:10:00.000Z');
    expect(r.label).toBe('7 days');
    expect(r.key).toBe(`great|${r.since}|${r.until}`);
  });

  it('is null for a league with no community data', () => {
    expect(
      communityRequest(
        { id: 'halloween', kind: 'special', meta: 'halloween' },
        '7',
        SEASONS,
        [],
        NOW,
      ),
    ).toBeNull();
  });
});

describe('trimSummary', () => {
  it('keeps only what the blend reads', () => {
    const p = trimSummary(SAMPLE)!;
    expect(p.generatedAt).toBe('2026-09-24T00:05:00.000Z');
    expect(p.summary.battles).toBe(1240);
    expect(p.summary.species[0]).toEqual({ speciesId: 'medicham', sightings: 410 });
    expect(p.summary.tournament).toEqual({
      events: 3,
      battles: 212,
      species: [{ speciesId: 'medicham', picks: 90 }],
    });
  });

  it('rejects a wrong shape', () => {
    expect(trimSummary(null)).toBeNull();
    expect(trimSummary({ ...SAMPLE, species: 'x' })).toBeNull();
    expect(trimSummary({ ...SAMPLE, battles: '12' })).toBeNull();
    expect(trimSummary({ ...SAMPLE, generatedAt: undefined })).toBeNull();
  });

  it('treats a missing tournament block as none', () => {
    expect(trimSummary({ ...SAMPLE, tournament: undefined })!.summary.tournament).toBeNull();
  });
});

describe('loadCommunity', () => {
  it('asks for league, since and until only, and caches by key', async () => {
    const fetcher = ok(SAMPLE);
    const req = communityRequest(GREAT, 'meta', SEASONS, [], NOW)!;
    const a = await loadCommunity(req, { fetcher });
    const b = await loadCommunity(req, { fetcher });
    expect(a).toEqual(b);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const url = new URL(
      (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string,
    );
    expect([...url.searchParams.keys()].sort()).toEqual(['league', 'since', 'until']);
    expect(url.pathname).toBe('/api/v1/meta');
  });

  it('falls back to null on a non-2xx, a network error, a bad body and a timeout', async () => {
    const req = communityRequest(GREAT, '7', SEASONS, [], NOW)!;
    expect(
      await loadCommunity(req, {
        fetcher: vi.fn(async () => new Response('{}', { status: 500 })) as unknown as typeof fetch,
      }),
    ).toBeNull();
    resetCommunityMetaCache();
    expect(
      await loadCommunity(req, {
        fetcher: vi.fn(async () => {
          throw new TypeError('offline');
        }) as unknown as typeof fetch,
      }),
    ).toBeNull();
    resetCommunityMetaCache();
    expect(await loadCommunity(req, { fetcher: ok({ nope: true }) })).toBeNull();
    resetCommunityMetaCache();
    const never = vi.fn(
      (_u: string, init?: RequestInit) =>
        new Promise<Response>((_r, reject) =>
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          ),
        ),
    ) as unknown as typeof fetch;
    expect(await loadCommunity(req, { fetcher: never, timeoutMs: 10 })).toBeNull();
  });

  it('remembers a failure for its key, and a new bucket asks again', async () => {
    const bad = vi.fn(async () => new Response('{}', { status: 500 })) as unknown as typeof fetch;
    const req = communityRequest(GREAT, '7', SEASONS, [], NOW)!;
    await loadCommunity(req, { fetcher: bad });
    await loadCommunity(req, { fetcher: bad });
    expect(bad).toHaveBeenCalledTimes(1);
    const later = communityRequest(GREAT, '7', SEASONS, [], new Date('2026-09-24T00:13:00Z'))!;
    await loadCommunity(later, { fetcher: bad });
    expect(bad).toHaveBeenCalledTimes(2);
  });
});
