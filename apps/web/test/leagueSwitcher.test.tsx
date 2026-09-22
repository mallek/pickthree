import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { League } from '@pickthree/engine';
import { LeagueSwitcher } from '../src/components/LeagueSwitcher.tsx';
import { AppProvider, useAppState, type AppState } from '../src/state/store.tsx';
import { resetDbForTests } from '../src/storage/db.ts';
import { GREAT, fakeHost } from './fakeHost.ts';

const TOURNAMENT: League = {
  id: 'championshipseries',
  title: 'Tournament',
  short: 'Tournament',
  cp: 1500,
  cup: 'championshipseries',
  meta: 'great',
  kind: 'cup',
  minCp: 1410,
  include: [],
  exclude: [
    { filterType: 'tag', values: ['mega'] },
    { filterType: 'id', values: ['mimikyu'] },
  ],
  metaSize: 3,
};

const REMIX: League = { ...TOURNAMENT, id: 'remix', title: 'Remix', short: 'Remix', kind: 'special' };

let latest: AppState | null = null;
function Probe() {
  latest = useAppState();
  return null;
}

describe('LeagueSwitcher', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    latest = null;
  });

  it('offers the shipped cup next to the open leagues and hides the special cups', async () => {
    const host = fakeHost({
      ready: async () => ({
        ...(await fakeHost().ready()),
        leagues: [GREAT, TOURNAMENT, REMIX],
      }),
    });
    render(
      <AppProvider host={host}>
        <Probe />
        <LeagueSwitcher />
      </AppProvider>,
    );
    await waitFor(() => expect(latest?.boot).toBe('ready'));
    expect(screen.getByRole('radio', { name: 'Great League' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Tournament' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Remix' })).not.toBeInTheDocument();
  });

  it('switches the league in play to the cup', async () => {
    const host = fakeHost({
      ready: async () => ({
        ...(await fakeHost().ready()),
        leagues: [GREAT, TOURNAMENT],
      }),
    });
    render(
      <AppProvider host={host}>
        <Probe />
        <LeagueSwitcher />
      </AppProvider>,
    );
    await waitFor(() => expect(latest?.boot).toBe('ready'));
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'Tournament' }));
    });
    await waitFor(() => expect(latest?.settings.league).toBe('championshipseries'));
  });
});
