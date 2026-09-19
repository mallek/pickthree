import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatchupMatrix } from '@pickthree/engine/meta';
import {
  loadGenerated,
  loadRanks,
  loadSlice,
  resetSlices,
  type GeneratedFile,
} from '../src/slice.js';

function matrixFor(league: string): MatchupMatrix {
  const candidates = [`${league}_first`, `${league}_second`];
  const opponents = [`${league}_first`];
  const scenarios = [
    { shields: [0, 0] as [number, number], energy: [0, 0] as [number, number] },
    { shields: [1, 1] as [number, number], energy: [0, 0] as [number, number] },
    { shields: [2, 2] as [number, number], energy: [0, 0] as [number, number] },
  ];
  return {
    league,
    cp: 1500,
    scenarios,
    candidates,
    opponents,
    candidateMovesets: {},
    opponentMovesets: {},
    ratings: [500, 500, 500, 700, 700, 700],
  };
}

function sliceFile(league: string): unknown {
  return {
    league,
    pvpokeCommit: 'abc123',
    pvpokeDate: '2026-09-10',
    matrix: matrixFor(league),
  };
}

function ranksFile(league: string, order?: string[]): unknown {
  return {
    league,
    pvpokeCommit: 'abc123',
    pvpokeDate: '2026-09-10',
    order: order ?? [`${league}_first`, `${league}_second`],
  };
}

function generatedFile(league: string): GeneratedFile {
  return {
    league,
    source: 'generated',
    pvpokeCommit: 'abc123',
    pvpokeDate: '2026-09-10',
    projectionSlope: 0.006,
    teams: [
      {
        species: [`${league}_first`, `${league}_second`, `${league}_third`],
        strength: 88,
        coverage: 100,
        consistency: 70,
        safety: 80,
        structure: 'ABC',
        exposure: [],
      },
    ],
  };
}

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

/** A fetcher that answers each baked path from one body, and counts every call. */
function stub(bodies: { slice?: unknown; ranks?: unknown; generated?: unknown }) {
  return vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.startsWith('/matrix/')) {
      return ok(bodies.slice);
    }
    if (url.startsWith('/ranks/')) {
      return ok(bodies.ranks);
    }
    if (url.startsWith('/baseline/')) {
      return ok(bodies.generated);
    }
    return new Response('not found', { status: 404 });
  });
}

/** A fetcher that returns each response in order, then refuses if called too many times. */
function sequence(...steps: Array<() => Promise<Response>>): ReturnType<typeof vi.fn> {
  return vi.fn(async () => {
    const step = steps.shift();
    if (!step) {
      throw new Error('no more steps');
    }
    return step();
  });
}

beforeEach(() => {
  resetSlices();
});

describe('loadSlice', () => {
  it('shapes a successful load into a MatrixView that finds a baked id', async () => {
    const mock = stub({ slice: sliceFile('great') });
    const slice = await loadSlice('great', mock as unknown as typeof fetch);
    expect(slice.league).toBe('great');
    expect(slice.pvpokeCommit).toBe('abc123');
    expect(slice.view.rowOf('great_first')).toBe(0);
    expect(slice.view.rowOf('great_second')).toBe(1);
    // The one answer the whole projection path turns on: a species with no row gets null, not a
    // zero that would read as "row 0".
    expect(slice.view.rowOf('stranger')).toBeNull();
    expect(slice.view.opponents).toEqual(['great_first']);
  });

  it('asks the right url', async () => {
    const mock = stub({ slice: sliceFile('ultra') });
    await loadSlice('ultra', mock as unknown as typeof fetch);
    expect(mock.mock.calls[0]?.[0]).toBe('/matrix/ultra.json');
  });

  it('hits the network once for two loads of the same league', async () => {
    const mock = stub({ slice: sliceFile('great') });
    const fetcher = mock as unknown as typeof fetch;
    await loadSlice('great', fetcher);
    await loadSlice('great', fetcher);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('keeps each league separate', async () => {
    const mock = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const url = typeof input === 'string' ? input : input.toString();
      const league = url.slice('/matrix/'.length).replace('.json', '');
      return ok(sliceFile(league));
    });
    const fetcher = mock as unknown as typeof fetch;
    const great = await loadSlice('great', fetcher);
    const master = await loadSlice('master', fetcher);
    expect(great.view.rowOf('great_first')).toBe(0);
    expect(great.view.rowOf('master_first')).toBeNull();
    expect(master.view.rowOf('master_first')).toBe(0);
  });

  it('does not memoise a rejection from a non-ok response; a later load can succeed', async () => {
    const mock = sequence(
      async () => new Response('gone', { status: 404 }),
      async () => ok(sliceFile('great')),
    );
    const fetcher = mock as unknown as typeof fetch;
    await expect(loadSlice('great', fetcher)).rejects.toThrow('/matrix/great.json');
    await expect(loadSlice('great', fetcher)).resolves.toMatchObject({ league: 'great' });
  });

  it('does not memoise a rejection from a failed fetch; a later load can succeed', async () => {
    const mock = sequence(
      (): Promise<Response> => {
        throw new TypeError('offline');
      },
      async () => ok(sliceFile('great')),
    );
    const fetcher = mock as unknown as typeof fetch;
    await expect(loadSlice('great', fetcher)).rejects.toThrow('offline');
    await expect(loadSlice('great', fetcher)).resolves.toMatchObject({ league: 'great' });
  });
});

describe('loadRanks', () => {
  it('hands back PvPoke overall order and nothing else', async () => {
    const mock = stub({ ranks: ranksFile('great', ['tinkaton', 'azumarill']) });
    const order = await loadRanks('great', mock as unknown as typeof fetch);
    expect(order).toEqual(['tinkaton', 'azumarill']);
    expect(mock.mock.calls[0]?.[0]).toBe('/ranks/great.json');
  });

  it('hits the network once for two loads of the same league', async () => {
    const mock = stub({ ranks: ranksFile('great') });
    const fetcher = mock as unknown as typeof fetch;
    await loadRanks('great', fetcher);
    await loadRanks('great', fetcher);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('does not memoise a rejection; a later load can succeed', async () => {
    const mock = sequence(
      async () => new Response('gone', { status: 500 }),
      async () => ok(ranksFile('great')),
    );
    const fetcher = mock as unknown as typeof fetch;
    await expect(loadRanks('great', fetcher)).rejects.toThrow('/ranks/great.json');
    await expect(loadRanks('great', fetcher)).resolves.toEqual(['great_first', 'great_second']);
  });
});

describe('loadGenerated', () => {
  it('hands back the baked board with its slope and its commit', async () => {
    const mock = stub({ generated: generatedFile('great') });
    const file = await loadGenerated('great', mock as unknown as typeof fetch);
    expect(mock.mock.calls[0]?.[0]).toBe('/baseline/great-teams.json');
    expect(file.pvpokeCommit).toBe('abc123');
    expect(file.projectionSlope).toBe(0.006);
    expect(file.teams).toHaveLength(1);
    expect(file.teams[0]?.strength).toBe(88);
  });

  it('hits the network once for two loads of the same league', async () => {
    const mock = stub({ generated: generatedFile('great') });
    const fetcher = mock as unknown as typeof fetch;
    await loadGenerated('great', fetcher);
    await loadGenerated('great', fetcher);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('does not memoise a rejection; a later load can succeed', async () => {
    const mock = sequence(
      async () => new Response('gone', { status: 404 }),
      async () => ok(generatedFile('great')),
    );
    const fetcher = mock as unknown as typeof fetch;
    await expect(loadGenerated('great', fetcher)).rejects.toThrow('/baseline/great-teams.json');
    await expect(loadGenerated('great', fetcher)).resolves.toMatchObject({ league: 'great' });
  });
});

describe('resetSlices', () => {
  it('forgets all three caches so a later call reflects a new stub', async () => {
    const first = stub({
      slice: sliceFile('great'),
      ranks: ranksFile('great', ['one']),
      generated: generatedFile('great'),
    });
    const firstFetcher = first as unknown as typeof fetch;
    await loadSlice('great', firstFetcher);
    await loadRanks('great', firstFetcher);
    await loadGenerated('great', firstFetcher);

    resetSlices();

    const second = stub({
      slice: sliceFile('great'),
      ranks: ranksFile('great', ['two']),
      generated: generatedFile('great'),
    });
    const secondFetcher = second as unknown as typeof fetch;
    await loadSlice('great', secondFetcher);
    // Without the reset, this would silently reuse the first load and still be ['one'].
    expect(await loadRanks('great', secondFetcher)).toEqual(['two']);
    await loadGenerated('great', secondFetcher);
    expect(second).toHaveBeenCalledTimes(3);
  });
});
