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
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Search any Pokemon')).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByPlaceholderText('Search any Pokemon'), {
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
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Search any Pokemon')).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByPlaceholderText('Search any Pokemon'), {
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
