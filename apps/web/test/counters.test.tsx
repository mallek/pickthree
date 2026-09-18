import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Counters } from '../src/screens/Counters.tsx';
import { AppProvider } from '../src/state/store.tsx';
import { resetDbForTests } from '../src/storage/db.ts';
import { fakeHost, GREAT, EMPTY_COUNTERS } from './fakeHost.ts';

const ULTRA = {
  ...GREAT,
  id: 'ultra',
  title: 'Ultra League',
  short: 'Ultra',
  cp: 2500,
  meta: 'ultra',
};

async function twoLeagueHost() {
  const leagueInfo = vi.fn(async (id: string) => ({
    id,
    meta: ['tinkaton', 'azumarill', 'clodsire'],
    metaSize: 3,
    metaRanks: {
      tinkaton: { overall: 1, score: 95, role: null, roleRank: null },
      azumarill: { overall: 2, score: 92, role: null, roleRank: null },
      clodsire: { overall: 3, score: 90, role: null, roleRank: null },
    },
    analyzable: ['tinkaton', 'azumarill', 'clodsire'],
  }));
  const counters = vi.fn(async () => EMPTY_COUNTERS);
  const base = fakeHost();
  // The boot reply carries both leagues, so the switcher and the route can each find 'ultra'.
  const bootReply = await base.ready();
  const host = fakeHost({
    leagueInfo,
    counters,
    ready: vi.fn(async () => ({ ...bootReply, leagues: [GREAT, ULTRA] })),
  });
  return host;
}

describe('Counters screen, league from a link', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    window.location.hash = '';
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
  });

  it('carries the meta.pick3.gg pill in its page head, next to the cog', async () => {
    const host = await twoLeagueHost();
    render(
      <AppProvider host={host}>
        <Counters />
      </AppProvider>,
    );
    expect(
      await screen.findByRole('link', { name: 'meta, the community meta' }),
    ).toHaveAttribute('href', 'https://meta.pick3.gg');
  });

  it('switches to the league a meta.pick3.gg link names, then scores counters in it', async () => {
    window.location.hash = '#/counters?vs=medicham&l=ultra';
    const host = await twoLeagueHost();
    render(
      <AppProvider host={host}>
        <Counters />
      </AppProvider>,
    );
    await waitFor(() =>
      expect((host.counters as unknown as { mock: { calls: unknown[][] } }).mock.calls.length).toBe(
        1,
      ),
    );
    expect(
      (host.leagueInfo as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(-1)?.[0],
    ).toBe('ultra');
    expect(screen.getByRole('radio', { name: 'Ultra League' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('ignores an unknown league id and still scores counters in whatever league was in play', async () => {
    window.location.hash = '#/counters?vs=medicham&l=nonsense';
    const host = await twoLeagueHost();
    render(
      <AppProvider host={host}>
        <Counters />
      </AppProvider>,
    );
    await waitFor(() =>
      expect((host.counters as unknown as { mock: { calls: unknown[][] } }).mock.calls.length).toBe(
        1,
      ),
    );
    expect(screen.getByRole('radio', { name: 'Great League' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});
