import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { Build } from '../src/screens/Build.tsx';
import { AppProvider } from '../src/state/store.tsx';
import { resetDbForTests } from '../src/storage/db.ts';
import { fakeHost } from './fakeHost.ts';

describe('Build a team', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    window.location.hash = '';
  });

  it('fills the first empty slot from the search grid and removes it with the badge', async () => {
    render(
      <AppProvider host={fakeHost()}>
        <Build />
      </AppProvider>,
    );
    // The search lives behind the empty slot: tap Lead to open it, aimed at that slot.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Lead, empty' })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Lead, empty' }));
    fireEvent.change(await screen.findByPlaceholderText('Search any Pokemon for Lead'), {
      target: { value: 'tink' },
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Tinkaton' })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tinkaton' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Remove Tinkaton' })).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Tinkaton moves' })).toBeInTheDocument();
    // The search folds away with the pick; the next empty slot is Safe Switch.
    expect(screen.queryByPlaceholderText(/Search any Pokemon/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Safe Switch, empty' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove Tinkaton' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Remove Tinkaton' })).not.toBeInTheDocument(),
    );
  });

  it('opens and closes the moves sheet for a filled slot', async () => {
    render(
      <AppProvider host={fakeHost()}>
        <Build />
      </AppProvider>,
    );
    // The search lives behind the empty slot: tap Lead to open it, aimed at that slot.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Lead, empty' })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Lead, empty' }));
    fireEvent.change(await screen.findByPlaceholderText('Search any Pokemon for Lead'), {
      target: { value: 'tink' },
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Tinkaton' })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tinkaton' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Tinkaton moves' })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tinkaton moves' }));

    const dialog = await screen.findByRole('dialog', { name: 'Tinkaton moves' });
    expect(dialog).toBeInTheDocument();
    // The fake host's movePool never resolves, so the sheet falls back to the Progress row
    // instead of crashing on a missing pool.
    expect(screen.getByRole('status')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Tinkaton moves' })).not.toBeInTheDocument(),
    );
  });
});
