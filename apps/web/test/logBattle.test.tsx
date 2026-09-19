import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LogBattle } from '../src/screens/LogBattle.tsx';
import { NewSet } from '../src/screens/NewSet.tsx';
import { AppProvider } from '../src/state/store.tsx';
import { resetDbForTests, storage } from '../src/storage/db.ts';
import { fakeHost } from './fakeHost.ts';

describe('New set and Log a battle', () => {
  const matchMedia = window.matchMedia;
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    window.location.hash = '';
  });
  afterEach(() => {
    window.matchMedia = matchMedia;
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
    const picks: [string, string][] = [
      ['tink', 'Tinkaton'],
      ['azu', 'Azumarill'],
      ['clod', 'Clodsire'],
    ];
    for (const [q, fullName] of picks) {
      fireEvent.change(screen.getByPlaceholderText('Search any Pokemon'), { target: { value: q } });
      // Grid tokens are labelled with the full name; they appear once the game data has booted.
      const token = await screen.findByRole('button', { name: fullName });
      fireEvent.click(token);
    }
    expect(start).toBeEnabled();
    await act(async () => {
      fireEvent.click(start);
    });
    await waitFor(async () => expect(await storage.loadSets('great')).toHaveLength(1));
    expect(window.location.hash).toBe('#/meta');
  });

  it('asks for all three opponents, not just the ones you saw', async () => {
    await storage.saveSet({
      id: 's1',
      league: 'great',
      startedAt: '2026-09-15T10:00:00Z',
      team: { species: ['tinkaton', 'azumarill', 'clodsire'] },
      battles: [],
      closed: false,
    });
    render(
      <AppProvider host={fakeHost()}>
        <LogBattle />
      </AppProvider>,
    );
    expect(
      await screen.findByText('Add all three opponents when you can. One or two still helps.'),
    ).toBeInTheDocument();
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
    await waitFor(() => expect(screen.getByText('1 logged with this team')).toBeInTheDocument());
    // The recent grid shows only while the search is in use.
    expect(screen.queryByRole('button', { name: 'Medicham' })).not.toBeInTheDocument();
    fireEvent.focus(screen.getByPlaceholderText('Search any Pokemon'));
    // Medicham was faced; it leads the recent row.
    fireEvent.click(screen.getByRole('button', { name: 'Medicham' }));
    // A pick folds the grid away, leaving the slot and the card.
    expect(screen.queryByRole('button', { name: 'Medicham' })).not.toBeInTheDocument();
    // The in-battle card opens for the opponent just added: their moves across the top.
    await waitFor(() => expect(screen.getByText('Ice Punch')).toBeInTheDocument());
    expect(screen.getByText('in 7')).toBeInTheDocument();
    expect(screen.getAllByText('Mixed')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Remove Medicham' })).toBeInTheDocument();
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
    // Stays here for the next battle, slots cleared, count up by one.
    await waitFor(() => expect(screen.getByText('2 logged with this team')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Remove Medicham' })).not.toBeInTheDocument();
  });

  it('never closes a set: the fifth battle logs like any other', async () => {
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
    await waitFor(() => expect(screen.getByText('4 logged with this team')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Tanked' }));
    });
    await waitFor(() => expect(screen.getByText('5 logged with this team')).toBeInTheDocument());
    const sets = await storage.loadSets('great');
    expect(sets).toHaveLength(1);
    expect(sets[0]?.closed).toBe(false);
    expect(sets[0]?.battles).toHaveLength(5);
    expect(sets[0]?.battles[4]?.tanked).toBe(true);
  });

  it('keeps both picks made one after the other from the recent grid', async () => {
    await storage.saveSet({
      id: 's1',
      league: 'great',
      startedAt: '2026-09-15T10:00:00Z',
      team: { species: ['tinkaton', 'azumarill', 'registeel'] },
      battles: [
        {
          id: 'b1',
          at: '2026-09-15T10:05:00Z',
          opponents: ['medicham'],
          result: 'win',
          tanked: false,
        },
        {
          id: 'b2',
          at: '2026-09-15T10:10:00Z',
          opponents: ['clodsire'],
          result: 'loss',
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
    await waitFor(() => expect(screen.getByText('2 logged with this team')).toBeInTheDocument());
    const search = screen.getByPlaceholderText('Search any Pokemon');
    fireEvent.focus(search);
    fireEvent.click(screen.getByRole('button', { name: 'Clodsire' }));
    // The grid folded; tapping the search brings it back for the second pick.
    expect(screen.queryByRole('button', { name: 'Medicham' })).not.toBeInTheDocument();
    fireEvent.focus(search);
    fireEvent.click(screen.getByRole('button', { name: 'Medicham' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Remove Clodsire' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Remove Medicham' })).toBeInTheDocument();
    });
    // Tapping a filled slot switches the card; the x removes it.
    fireEvent.click(screen.getByRole('button', { name: 'Clodsire in battle' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Clodsire in battle' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove Clodsire' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Remove Clodsire' })).not.toBeInTheDocument(),
    );
  });

  it('narrows the grid by type and then by type plus name', async () => {
    await storage.saveSet({
      id: 's1',
      league: 'great',
      startedAt: '2026-09-15T10:00:00Z',
      team: { species: ['tinkaton', 'azumarill', 'clodsire'] },
      battles: [],
      closed: false,
    });
    render(
      <AppProvider host={fakeHost()}>
        <LogBattle />
      </AppProvider>,
    );
    await waitFor(() => expect(screen.getByText('0 logged with this team')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Search any Pokemon'), {
      target: { value: 'fairy' },
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Tinkaton' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Azumarill' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Clodsire' })).not.toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Search any Pokemon'), {
      target: { value: 'fairy tin' },
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Tinkaton' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Azumarill' })).not.toBeInTheDocument();
    });

    // A desktop (fine pointer) keeps the cursor in the search for the next opponent.
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    fireEvent.click(screen.getByRole('button', { name: 'Tinkaton' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Remove Tinkaton' })).toBeInTheDocument(),
    );
    expect(screen.getByPlaceholderText('Search any Pokemon')).toHaveFocus();
    expect(screen.getByPlaceholderText('Search any Pokemon')).toHaveValue('');
    // The grid folded away with the pick; typing brings the matches back.
    expect(screen.queryByRole('button', { name: 'Azumarill' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Search any Pokemon'), {
      target: { value: 'azu' },
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Azumarill' })).toBeInTheDocument(),
    );
    // A touch screen drops focus instead, so the keyboard does not cover the card.
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
    fireEvent.click(screen.getByRole('button', { name: 'Azumarill' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Remove Azumarill' })).toBeInTheDocument(),
    );
    expect(screen.getByPlaceholderText('Search any Pokemon')).not.toHaveFocus();
  });
});
