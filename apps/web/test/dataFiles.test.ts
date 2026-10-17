import { describe, expect, it } from 'vitest';
import {
  MANIFEST_PATH,
  atBuild,
  loadBootFiles,
  loadLeagueFiles,
  type FetchFn,
} from '../src/worker/dataFiles.ts';

const BUILD = '2026-10-17T11:09:20.019Z';

/** A fetch that answers every /data path and records what was asked, with which cache mode. */
function recorder(missing: string[] = []): {
  fetchFn: FetchFn;
  calls: { url: string; cache: RequestCache | undefined }[];
} {
  const calls: { url: string; cache: RequestCache | undefined }[] = [];
  const fetchFn: FetchFn = (url, init) => {
    calls.push({ url, cache: init?.cache });
    const path = url.replace(/\?.*$/, '');
    if (missing.includes(path)) {
      return Promise.resolve(new Response('', { status: 404 }));
    }
    const body =
      path === MANIFEST_PATH
        ? { builtAt: BUILD }
        : path.includes('/legal/')
          ? { banned: ['x'] }
          : [];
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  };
  return { fetchFn, calls };
}

describe('data files at one build', () => {
  it('reads the manifest fresh, first, and every other boot file at its build', async () => {
    const { fetchFn, calls } = recorder();
    const boot = await loadBootFiles(fetchFn);
    expect(boot.build).toBe(BUILD);
    expect(calls[0]).toEqual({ url: MANIFEST_PATH, cache: 'no-cache' });
    const rest = calls.slice(1);
    expect(rest.map((c) => c.url)).toContain(atBuild('/data/gamemaster.json', BUILD));
    for (const c of rest) {
      expect(c.url.endsWith(`?v=${encodeURIComponent(BUILD)}`)).toBe(true);
      expect(c.cache).toBeUndefined();
    }
    expect(boot.simScript).toBe(atBuild('/data/vendor/pvpoke-sim.js', BUILD));
  });

  it('reads a league at the same build as the game master', async () => {
    const { fetchFn, calls } = recorder();
    const league = await loadLeagueFiles(fetchFn, BUILD, 'little');
    expect(calls.length).toBe(8);
    for (const c of calls) {
      expect(c.url).toMatch(/^\/data\/(rankings|meta|matrix|legal)\b/);
      expect(c.url.endsWith(`?v=${encodeURIComponent(BUILD)}`)).toBe(true);
    }
    expect(league.banned).toEqual(['x']);
  });

  it('keeps the optional files optional', async () => {
    const { fetchFn } = recorder(['/data/seasons.json', '/data/legal/little.json']);
    const boot = await loadBootFiles(fetchFn);
    expect(boot.seasons).toEqual([]);
    const league = await loadLeagueFiles(fetchFn, BUILD, 'little');
    expect(league.banned).toEqual([]);
  });

  it('names the file, not the build, when a required one fails', async () => {
    const { fetchFn } = recorder(['/data/gamemaster.json']);
    await expect(loadBootFiles(fetchFn)).rejects.toThrow(
      'Failed to load /data/gamemaster.json: 404',
    );
  });
});
