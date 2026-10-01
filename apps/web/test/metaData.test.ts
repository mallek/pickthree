// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiWindow } from '@pickthree/engine/meta';
import {
  apiWindow,
  fetchSpeciesDetail,
  fetchSummary,
  fetchTeamsBoard,
  loadGenerated,
  loadPvpokeSide,
  loadSlice,
  resetMetaDataForTests,
  weekEarlier,
} from '../src/metaData.ts';
import { COUNTER_ORIGIN } from '../src/counter.ts';

/** A stub fetcher: URL prefix -> JSON body, or a bare status number. First matching prefix wins. */
function stub(routes: Record<string, unknown>) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    for (const [prefix, body] of Object.entries(routes)) {
      if (url.startsWith(prefix)) {
        if (typeof body === 'number') {
          return new Response('{}', { status: body });
        }
        return new Response(JSON.stringify(body), { status: 200 });
      }
    }
    return new Response('{}', { status: 404 });
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

const GROUP = [{ speciesId: 'azumarill', fastMove: 'BUBBLE', chargedMoves: ['ICE_BEAM'] }];
const OVERALL = [
  { speciesId: 'medicham', score: 90 },
  { speciesId: 'azumarill', score: 95, rating: 800 },
];
const MATRIX = {
  league: 'great-league',
  cp: 1500,
  scenarios: [{ shields: [1, 1], energy: [0, 0] }],
  candidates: ['azumarill', 'medicham'],
  opponents: ['azumarill'],
  candidateMovesets: { azumarill: ['BUBBLE'], medicham: ['COUNTER'] },
  opponentMovesets: { azumarill: ['BUBBLE'] },
  ratings: [500, 400],
};
const W: ApiWindow = {
  since: '2026-09-10T00:00:00.000Z',
  until: '2026-09-30T00:00:00.000Z',
  label: 'This meta',
  key: 'meta',
  epoch: null,
};

beforeEach(() => resetMetaDataForTests());

describe('loadPvpokeSide', () => {
  it('builds the baseline, rank order and ban set from the three data files', async () => {
    const { fetcher, calls } = stub({
      '/data/meta/great-league.json': GROUP,
      '/data/rankings/great-league/overall.json': OVERALL,
      '/data/legal/great-league.json': { cup: 'x', banned: ['medicham'] },
    });
    const side = await loadPvpokeSide('great-league', fetcher);
    expect(side.baseline.league).toBe('great-league');
    expect(side.baseline.byId.get('azumarill')?.score).toBe(95);
    expect(side.ranks).toEqual(['medicham', 'azumarill']);
    expect([...side.banned]).toEqual(['medicham']);
    expect(calls.map((c) => c.url).sort()).toEqual([
      '/data/legal/great-league.json',
      '/data/meta/great-league.json',
      '/data/rankings/great-league/overall.json',
    ]);
  });

  it('treats a missing legal file as nothing banned', async () => {
    const { fetcher } = stub({
      '/data/meta/great-league.json': GROUP,
      '/data/rankings/great-league/overall.json': OVERALL,
      '/data/legal/great-league.json': 404,
    });
    const side = await loadPvpokeSide('great-league', fetcher);
    expect(side.banned.size).toBe(0);
  });

  it('memoizes per league and retries after a failure', async () => {
    const down = stub({});
    const first = loadPvpokeSide('great-league', down.fetcher);
    await expect(first).rejects.toThrow();
    const up = stub({
      '/data/meta/great-league.json': GROUP,
      '/data/rankings/great-league/overall.json': OVERALL,
      '/data/legal/great-league.json': { cup: null, banned: [] },
    });
    const a = loadPvpokeSide('great-league', up.fetcher);
    const b = loadPvpokeSide('great-league', up.fetcher);
    expect(b).toBe(a);
    await a;
    expect(up.calls).toHaveLength(3);
  });
});

describe('loadSlice', () => {
  it('wraps the matrix in a view, memoized', async () => {
    const { fetcher, calls } = stub({ '/data/matrix/great-league.json': MATRIX });
    const a = loadSlice('great-league', fetcher);
    expect(loadSlice('great-league', fetcher)).toBe(a);
    const view = await a;
    expect(view.rowOf('azumarill')).toBe(0);
    expect(view.rowOf('nobody')).toBeNull();
    expect(calls.map((c) => c.url)).toEqual(['/data/matrix/great-league.json']);
  });

  it('forgets a failed load', async () => {
    await expect(loadSlice('great-league', stub({}).fetcher)).rejects.toThrow();
    const ok = stub({ '/data/matrix/great-league.json': MATRIX });
    await expect(loadSlice('great-league', ok.fetcher)).resolves.toBeDefined();
  });
});

describe('loadGenerated', () => {
  it('returns the file, and null on a 404', async () => {
    const file = { league: 'great-league', source: 'generated', teams: [] };
    const hit = stub({ '/data/baseline/great-league-teams.json': file });
    await expect(loadGenerated('great-league', hit.fetcher)).resolves.toEqual(file);
    resetMetaDataForTests();
    const miss = stub({});
    await expect(loadGenerated('great-league', miss.fetcher)).resolves.toBeNull();
  });
});

describe('counter reads', () => {
  const SUMMARY = { league: 'great-league', battles: 3 };

  it('fetchSummary asks the all response on the counter origin, no-store', async () => {
    const { fetcher, calls } = stub({ [`${COUNTER_ORIGIN}/api/v1/meta?`]: SUMMARY });
    await expect(fetchSummary('great-league', W, fetcher)).resolves.toEqual(SUMMARY);
    const call = calls[0];
    expect(call?.url).toBe(
      `${COUNTER_ORIGIN}/api/v1/meta?league=great-league&since=${encodeURIComponent(W.since)}&until=${encodeURIComponent(W.until)}`,
    );
    expect(call?.init?.cache).toBe('no-store');
    expect(call?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('rejects on a non-ok answer', async () => {
    const { fetcher } = stub({ [`${COUNTER_ORIGIN}/api/v1/meta?`]: 500 });
    await expect(fetchSummary('great-league', W, fetcher)).rejects.toThrow();
    await expect(fetchTeamsBoard('great-league', W, 'all', stub({}).fetcher)).rejects.toThrow();
    await expect(
      fetchSpeciesDetail('great-league', 'x', W, 'all', stub({}).fetcher),
    ).rejects.toThrow();
  });

  it('adds source only for ladder and tournament; prior and all ask for all', async () => {
    const { fetcher, calls } = stub({ [COUNTER_ORIGIN]: { ok: true } });
    await fetchTeamsBoard('great-league', W, 'all', fetcher);
    await fetchTeamsBoard('great-league', W, 'prior', fetcher);
    await fetchTeamsBoard('great-league', W, 'ladder', fetcher);
    await fetchTeamsBoard('great-league', W, 'tournament', fetcher);
    const urls = calls.map((c) => c.url);
    expect(urls[0]).toBe(urls[1]);
    expect(urls[0]).not.toContain('source=');
    expect(urls[0]).toContain(`${COUNTER_ORIGIN}/api/v1/teams?league=great-league&since=`);
    expect(urls[2]).toMatch(/&source=ladder$/);
    expect(urls[3]).toMatch(/&source=tournament$/);
  });

  it('encodes the species id into the path', async () => {
    const { fetcher, calls } = stub({ [COUNTER_ORIGIN]: { ok: true } });
    await fetchSpeciesDetail('great-league', 'mr_mime/x', W, 'ladder', fetcher);
    expect(calls[0]?.url).toContain(
      `${COUNTER_ORIGIN}/api/v1/species/mr_mime%2Fx?league=great-league&since=`,
    );
    expect(calls[0]?.url).toMatch(/&source=ladder$/);
  });

  it('aborts a read that takes longer than 8 seconds', async () => {
    vi.useFakeTimers();
    try {
      const hang = vi.fn(
        (_url: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      ) as unknown as typeof fetch;
      const p = fetchSummary('great-league', W, hang);
      const caught = p.catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(8_001);
      expect(await caught).toBeInstanceOf(Error);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('apiWindow', () => {
  it('wraps resolveWindow', () => {
    const w = apiWindow('7', 'great-league', [], [], new Date('2026-09-30T00:03:00Z'));
    expect(w.key).toBe('7');
    expect(w.until).toBe('2026-09-30T00:10:00.000Z');
    expect(w.since).toBe('2026-09-23T00:10:00.000Z');
  });
});

describe('weekEarlier', () => {
  it('is null when under a week of history', () => {
    const w: ApiWindow = {
      ...W,
      since: '2026-09-27T00:00:00.000Z',
      until: '2026-09-30T00:00:00.000Z',
    };
    expect(weekEarlier(w)).toBeNull();
  });

  it('moves until back seven days for a 20 day window', () => {
    const w = weekEarlier(W);
    expect(w).not.toBeNull();
    expect(w?.until).toBe('2026-09-23T00:00:00.000Z');
    expect(w?.since).toBe(W.since);
    expect(w?.label).toBe(W.label);
  });

  it('is null at exactly a week', () => {
    expect(
      weekEarlier({ ...W, since: '2026-09-23T00:00:00.000Z', until: '2026-09-30T00:00:00.000Z' }),
    ).toBeNull();
  });
});
