import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { legalSpeciesIds } from '../src/worker/legalSpecies.ts';
import { NothingMatches, useSpeciesSearch } from '../src/components.tsx';
import { AppProvider, useAppState } from '../src/state/store.tsx';
import { resetDbForTests } from '../src/storage/db.ts';
import { fakeHost } from './fakeHost.ts';

const ALL = ['tinkaton', 'azumarill', 'clodsire', 'medicham', 'dragonite_shadow'];

function hostWithLegal(legal: string[]) {
  const base = fakeHost();
  return fakeHost({
    leagueInfo: vi.fn(async (id: string) => ({ ...(await base.leagueInfo(id)), legal })),
  });
}

/** Renders the hook's answer once the league info has landed (or never, if it does not). */
function Probe({
  query,
  legalOnly,
  limit = 30,
}: {
  query: string;
  legalOnly?: boolean;
  limit?: number;
}) {
  const s = useAppState();
  const hits = useSpeciesSearch(query, limit, { legalOnly });
  return (
    <div>
      <span data-testid="loaded">{s.leagueInfo ? 'yes' : 'no'}</span>
      <span data-testid="hits">{hits.join(',')}</span>
      <NothingMatches query={query} legalOnly={legalOnly} />
    </div>
  );
}

async function mount(
  legal: string[],
  props: { query: string; legalOnly?: boolean; limit?: number },
) {
  render(
    <AppProvider host={hostWithLegal(legal)}>
      <Probe {...props} />
    </AppProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('loaded')).toHaveTextContent('yes'));
}

describe('useSpeciesSearch legalOnly', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    window.location.hash = '';
  });

  it('drops species the league does not admit and keeps the order of the rest', async () => {
    await mount(['tinkaton', 'clodsire', 'medicham'], { query: 'i', legalOnly: true });
    const all = screen.getByTestId('hits').textContent ?? '';
    expect(all).not.toContain('azumarill');
    expect(all.split(',')).toEqual(['tinkaton', 'clodsire', 'medicham']);
  });

  it('leaves the list alone without legalOnly', async () => {
    await mount(['tinkaton'], { query: 'i' });
    expect(screen.getByTestId('hits').textContent?.split(',')).toContain('azumarill');
  });

  it('applies the cap after the legal filter', async () => {
    await mount(['medicham'], { query: 'i', legalOnly: true, limit: 1 });
    expect(screen.getByTestId('hits')).toHaveTextContent('medicham');
  });

  it('gives nothing while the league info is not loaded', async () => {
    const never = fakeHost({ leagueInfo: vi.fn(() => new Promise<never>(() => {})) });
    render(
      <AppProvider host={never}>
        <Probe query="a" legalOnly />
      </AppProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('loaded')).toHaveTextContent('no'));
    expect(screen.getByTestId('hits')).toHaveTextContent('');
    expect(screen.queryByText(/Not allowed in/)).not.toBeInTheDocument();
  });

  it('names the matching illegal species when none is legal', async () => {
    await mount(['tinkaton'], { query: 'medic', legalOnly: true });
    expect(screen.getByText('Not allowed in Great League: Medicham')).toBeInTheDocument();
    expect(screen.queryByText('Nothing matches.')).not.toBeInTheDocument();
  });

  it('shows no blocked line while some match is legal', async () => {
    await mount(['tinkaton'], { query: 'tink', legalOnly: true });
    expect(screen.queryByText(/Not allowed in/)).not.toBeInTheDocument();
  });

  it('lists at most three blocked names', async () => {
    await mount([], { query: 'i', legalOnly: true });
    const line = screen.getByText(/^Not allowed in Great League: /);
    const names = (line.textContent ?? '').replace('Not allowed in Great League: ', '').split(', ');
    expect(names.length).toBe(3);
  });

  it('says Nothing matches when the query matches no species at all', async () => {
    await mount(ALL, { query: 'zzzz', legalOnly: true });
    expect(screen.getByText('Nothing matches.')).toBeInTheDocument();
  });
});

describe('legalSpeciesIds', () => {
  const sp = (speciesId: string, over: object = {}) =>
    ({
      speciesId,
      released: true,
      tags: [],
      types: ['normal', 'none'],
      dex: 1,
      ...over,
    }) as never;
  const league = (over: object = {}) =>
    ({
      id: 'x',
      title: 'X',
      short: 'X',
      cp: 1500,
      cup: 'all',
      meta: 'x',
      kind: 'rotation',
      minCp: 0,
      include: [],
      exclude: [],
      ...over,
    }) as never;

  it('keeps exactly the species allowedInLeague admits, in order', () => {
    const species = [
      sp('a', { types: ['dark', 'none'] }),
      sp('b'),
      sp('c', { released: false }),
      sp('d'),
    ];
    const ids = legalSpeciesIds(
      species,
      league({ exclude: [{ filterType: 'type', values: ['dark'] }] }),
    );
    expect(ids).toEqual(['b', 'd']);
  });
});
