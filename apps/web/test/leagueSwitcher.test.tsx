import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { League } from '@pickthree/engine';
import { LeagueSwitcher } from '../src/components/LeagueSwitcher.tsx';
import { AppProvider, useAppState, type AppState } from '../src/state/store.tsx';
import { resetDbForTests } from '../src/storage/db.ts';
import { GREAT, fakeHost } from './fakeHost.ts';

const ULTRA: League = { ...GREAT, id: 'ultra', title: 'Ultra League', short: 'Ultra' };
const MASTER: League = { ...GREAT, id: 'master', title: 'Master League', short: 'Master' };

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

  it('shows only the open leagues as radios and puts the cup behind the overflow', async () => {
    const host = fakeHost({
      ready: async () => ({
        ...(await fakeHost().ready()),
        leagues: [GREAT, ULTRA, MASTER, TOURNAMENT, REMIX],
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
    expect(screen.getByRole('radio', { name: 'Ultra League' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Master League' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Tournament' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More leagues and cups' })).toBeInTheDocument();
  });

  it('lists every league and cup in the sheet, hides the special cups, and picking one switches league and closes it', async () => {
    const host = fakeHost({
      ready: async () => ({
        ...(await fakeHost().ready()),
        leagues: [GREAT, ULTRA, MASTER, TOURNAMENT, REMIX],
      }),
    });
    render(
      <AppProvider host={host}>
        <Probe />
        <LeagueSwitcher />
      </AppProvider>,
    );
    await waitFor(() => expect(latest?.boot).toBe('ready'));
    fireEvent.click(screen.getByRole('button', { name: 'More leagues and cups' }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('Leagues')).toBeInTheDocument();
    expect(within(sheet).getByRole('radio', { name: 'Tournament' })).toBeInTheDocument();
    expect(within(sheet).queryByRole('radio', { name: 'Remix' })).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('radio', { name: 'Tournament' }));
    });
    await waitFor(() => expect(latest?.settings.league).toBe('championshipseries'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the current cup in the overflow slot when it is the league in play', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'More leagues and cups' }));
    const sheet = await screen.findByRole('dialog');
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('radio', { name: 'Tournament' }));
    });
    await waitFor(() => expect(latest?.settings.league).toBe('championshipseries'));
    const overflow = screen.getByRole('button', { name: 'Tournament League, More leagues and cups' });
    expect(overflow).toHaveClass('on');
    expect(overflow.textContent).toContain('Tournament');
  });
});
