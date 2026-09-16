import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { LogBattle } from '../src/screens/LogBattle.tsx';
import { NewSet } from '../src/screens/NewSet.tsx';
import { AppProvider } from '../src/state/store.tsx';
import { resetDbForTests, storage } from '../src/storage/db.ts';
import { fakeHost } from './fakeHost.ts';

describe('New set and Log a battle', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    window.location.hash = '';
  });

  it('starts a set from three picked species', async () => {
    render(
      <AppProvider host={fakeHost()}>
        <NewSet />
      </AppProvider>,
    );
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Search any Pokemon')).toBeInTheDocument(),
    );
    const start = screen.getByRole('button', { name: 'Start set' });
    expect(start).toBeDisabled();
    for (const q of ['tink', 'azu', 'clod']) {
      fireEvent.change(screen.getByPlaceholderText('Search any Pokemon'), { target: { value: q } });
      // The list rows end in "other Pokemon"; the slot buttons are labelled "Clear ...".
      fireEvent.click(screen.getByRole('button', { name: /other Pokemon/ }));
    }
    expect(start).toBeEnabled();
    await act(async () => {
      fireEvent.click(start);
    });
    await waitFor(async () => expect(await storage.loadSets('great')).toHaveLength(1));
    expect(window.location.hash).toBe('#/meta');
  });

  it('fills slots from the recent row and saves a win', async () => {
    await storage.saveSet({
      id: 's1',
      league: 'great',
      startedAt: '2026-09-15T10:00:00Z',
      team: { species: ['tinkaton', 'azumarill', 'clodsire'] },
      battles: [
        {
          id: 'b1',
          at: '2026-09-15T10:05:00Z',
          opponents: ['medicham'],
          result: 'win',
          tanked: false,
        },
      ],
      closed: false,
    });
    render(
      <AppProvider host={fakeHost()}>
        <LogBattle />
      </AppProvider>,
    );
    await waitFor(() => expect(screen.getByText('Set 1, battle 2 of 5')).toBeInTheDocument());
    // Medicham was faced; it leads the recent row.
    fireEvent.click(screen.getByRole('button', { name: 'Medicham' }));
    expect(screen.getAllByText('Medicham')).toHaveLength(2);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Win' }));
    });
    await waitFor(async () => {
      const sets = await storage.loadSets('great');
      expect(sets[0]?.battles).toHaveLength(2);
      expect(sets[0]?.battles[1]).toMatchObject({
        opponents: ['medicham'],
        result: 'win',
        tanked: false,
      });
    });
    expect(window.location.hash).toBe('#/meta');
  });

  it('closes the set on the fifth battle and offers a new set with the same team', async () => {
    const four = Array.from({ length: 4 }, (_, i) => ({
      id: `b${i}`,
      at: `2026-09-15T10:0${i}:00Z`,
      opponents: ['medicham'],
      result: 'win' as const,
      tanked: false,
    }));
    await storage.saveSet({
      id: 's1',
      league: 'great',
      startedAt: '2026-09-15T10:00:00Z',
      team: { species: ['tinkaton', 'azumarill', 'clodsire'] },
      battles: four,
      closed: false,
    });
    render(
      <AppProvider host={fakeHost()}>
        <LogBattle />
      </AppProvider>,
    );
    await waitFor(() => expect(screen.getByText('Set 1, battle 5 of 5')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Tanked' }));
    });
    await waitFor(() => expect(screen.getByText('Set 1 done, 4-0.')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'New set, same team' }));
    });
    await waitFor(async () => expect(await storage.loadSets('great')).toHaveLength(2));
    const sets = await storage.loadSets('great');
    expect(sets[0]?.closed).toBe(true);
    expect(sets[1]?.team.species).toEqual(['tinkaton', 'azumarill', 'clodsire']);
  });
});
