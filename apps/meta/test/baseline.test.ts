import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBaseline, resetBaselines } from '../src/baseline.js';
import type { BaselineSpecies } from '../src/baseline.js';

function speciesEntry(id: string, score: number): BaselineSpecies {
  return {
    speciesId: id,
    score,
    rating: score * 10,
    fastMove: 'FAST_MOVE',
    chargedMoves: ['CHARGED_ONE'],
    fastUsage: [{ moveId: 'FAST_MOVE', uses: 100 }],
    chargedUsage: [{ moveId: 'CHARGED_ONE', uses: 50 }],
  };
}

function fileFor(league: string, species?: BaselineSpecies[]): unknown {
  return {
    league,
    source: 'pvpoke',
    pvpokeCommit: 'abc123',
    pvpokeDate: '2026-09-10',
    species: species ?? [speciesEntry(`${league}_first`, 90), speciesEntry(`${league}_second`, 80)],
  };
}

/** A fetcher that returns each response in order, then keeps failing if called too many times. */
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
  resetBaselines();
});

describe('loadBaseline', () => {
  it('shapes a successful load: order kept, byId resolving to the same object', async () => {
    const mock = vi.fn(async () => new Response(JSON.stringify(fileFor('great')), { status: 200 }));
    const baseline = await loadBaseline('great', mock as unknown as typeof fetch);
    expect(baseline.league).toBe('great');
    expect(baseline.pvpokeCommit).toBe('abc123');
    expect(baseline.pvpokeDate).toBe('2026-09-10');
    expect(baseline.species.map((s) => s.speciesId)).toEqual(['great_first', 'great_second']);
    expect(baseline.byId.get('great_first')).toBe(baseline.species[0]);
    expect(baseline.byId.get('great_second')).toBe(baseline.species[1]);
  });

  it('hits the network once for two loads of the same league', async () => {
    const mock = vi.fn(async () => new Response(JSON.stringify(fileFor('great')), { status: 200 }));
    const fetcher = mock as unknown as typeof fetch;
    await loadBaseline('great', fetcher);
    await loadBaseline('great', fetcher);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('hits the network for each different league and keeps their data separate', async () => {
    const greatMock = vi.fn(async () => new Response(JSON.stringify(fileFor('great')), { status: 200 }));
    const ultraMock = vi.fn(async () => new Response(JSON.stringify(fileFor('ultra')), { status: 200 }));
    const great = await loadBaseline('great', greatMock as unknown as typeof fetch);
    const ultra = await loadBaseline('ultra', ultraMock as unknown as typeof fetch);
    expect(greatMock).toHaveBeenCalledTimes(1);
    expect(ultraMock).toHaveBeenCalledTimes(1);
    expect(great.league).toBe('great');
    expect(ultra.league).toBe('ultra');
    expect(great.species[0]!.speciesId).toBe('great_first');
    expect(ultra.species[0]!.speciesId).toBe('ultra_first');
  });

  it('does not memoise a rejection from a non-ok response; a later load can succeed', async () => {
    const mock = sequence(
      async () => new Response('not found', { status: 404 }),
      async () => new Response(JSON.stringify(fileFor('great')), { status: 200 }),
    );
    const fetcher = mock as unknown as typeof fetch;
    await expect(loadBaseline('great', fetcher)).rejects.toThrow();
    await expect(loadBaseline('great', fetcher)).resolves.toMatchObject({ league: 'great' });
  });

  it('does not memoise a rejection from a failed fetch; a later load can succeed', async () => {
    const mock = sequence(
      (): Promise<Response> => {
        throw new TypeError('offline');
      },
      async () => new Response(JSON.stringify(fileFor('great')), { status: 200 }),
    );
    const fetcher = mock as unknown as typeof fetch;
    await expect(loadBaseline('great', fetcher)).rejects.toThrow('offline');
    await expect(loadBaseline('great', fetcher)).resolves.toMatchObject({ league: 'great' });
  });
});

describe('resetBaselines', () => {
  it('forgets the memoised load so a later call for the same league reflects a new stub', async () => {
    const a = vi.fn(async () => new Response(JSON.stringify(fileFor('great')), { status: 200 }));
    const first = await loadBaseline('great', a as unknown as typeof fetch);
    expect(first.species[0]!.speciesId).toBe('great_first');

    resetBaselines();

    const b = vi.fn(
      async () =>
        new Response(JSON.stringify(fileFor('great', [speciesEntry('great_replaced', 50)])), {
          status: 200,
        }),
    );
    // Without the reset, this would silently reuse the first load and still be great_first.
    const second = await loadBaseline('great', b as unknown as typeof fetch);
    expect(second.species[0]!.speciesId).toBe('great_replaced');
  });
});
