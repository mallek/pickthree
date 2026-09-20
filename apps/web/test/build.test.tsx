import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('offers teammates once something is pinned, and drops them into the empty slots', async () => {
    const suggestTeammates = vi.fn(async () => ({
      pinLine: 'Tinkaton beats 12 of 48 in the current Great League meta group.',
      suggestions: [
        {
          character: 'safest' as const,
          label: 'Safest',
          chase: false,
          coverage: 30,
          cost: 0,
          sightings: null,
          fills: [
            {
              slot: 1 as const,
              pick: { kind: 'species' as const, id: 'azumarill' },
              speciesId: 'azumarill',
              standIn: true,
              covers: ['clodsire'],
              line: 'Beats Clodsire and 4 more that Tinkaton loses to.',
            },
            {
              slot: 2 as const,
              pick: { kind: 'species' as const, id: 'clodsire' },
              speciesId: 'clodsire',
              standIn: true,
              covers: ['medicham'],
              line: 'Beats Medicham and 2 more that Tinkaton and Azumarill lose to.',
            },
          ],
        },
      ],
      assumptions: {} as never,
      stats: { standIns: 0, poolSize: 0, cores: 0, simulatedRows: 0 },
      ms: 1,
    }));
    render(
      <AppProvider host={fakeHost({ suggestTeammates })}>
        <Build />
      </AppProvider>,
    );

    // Nothing pinned: nothing to build around, so no button.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Lead, empty' })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: 'Suggest teammates' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Lead, empty' }));
    fireEvent.change(await screen.findByPlaceholderText('Search any Pokemon for Lead'), {
      target: { value: 'tink' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Tinkaton' }));

    const button = await screen.findByRole('button', { name: 'Suggest teammates' });
    fireEvent.click(button);

    // The offer lands in the two empty slots, so Analyze is reachable with no further taps.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Remove Azumarill' })).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Remove Clodsire' })).toBeInTheDocument();
    expect(screen.getByText(/Beats Clodsire and 4 more/)).toBeInTheDocument();
    expect(screen.getByText(/Tinkaton beats 12 of 48/)).toBeInTheDocument();
    // Reasons only. The verdict out of 100 belongs to Analyze, one tap later.
    expect(screen.queryByText(/out of 100/)).not.toBeInTheDocument();
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
