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

  // The offer a suggestTeammates call resolves to below. Shared by the two tests that replaced
  // "offers teammates once something is pinned, and drops them into the empty slots": that test
  // asserted the auto-fill store.tsx no longer does (suggestTeammates never writes a pick now).
  const offer = {
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
  };

  // TODO(Task 4): these depend on UI that does not exist until Tasks 3 and 4 ship: the
  // "Add <name>" suggestion row, suggestions running on their own instead of behind a button, and
  // the "Search any Pokémon for <slot>" placeholder (currently "Search any Pokemon for <slot>",
  // no accent). Switch `it.skip` to `it` once that UI lands.
  async function pickFirst(query: string, label: string): Promise<void> {
    const empty = await screen.findByRole('button', { name: /, empty$/ });
    fireEvent.click(empty);
    fireEvent.change(await screen.findByPlaceholderText(/Search any Pokémon for/), {
      target: { value: query },
    });
    fireEvent.click(await screen.findByRole('button', { name: label }));
  }

  it.skip('offers teammates without writing any pick', async () => {
    const suggestTeammates = vi.fn(async () => offer);
    render(
      <AppProvider host={fakeHost({ suggestTeammates })}>
        <Build />
      </AppProvider>,
    );
    await pickFirst('tink', 'Tinkaton');
    await waitFor(() => expect(suggestTeammates).toHaveBeenCalledTimes(1));
    await screen.findByRole('button', { name: 'Add Azumarill' });
    expect(screen.getByRole('button', { name: 'Safe Switch, empty' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Closer, empty' })).toBeInTheDocument();
  });

  it.skip('drops a suggestion for a board that changed while it ran', async () => {
    let release: (v: typeof offer) => void = () => {};
    const suggestTeammates = vi
      .fn()
      .mockImplementationOnce(() => new Promise<typeof offer>((r) => (release = r)))
      .mockImplementation(async () => ({ ...offer, suggestions: [] }));
    render(
      <AppProvider host={fakeHost({ suggestTeammates })}>
        <Build />
      </AppProvider>,
    );
    await pickFirst('tink', 'Tinkaton');
    await waitFor(() => expect(suggestTeammates).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Tinkaton' }));
    await pickFirst('azu', 'Azumarill');
    // An answer for the old board (Tinkaton) whose first teammate, Medicham, is not on the new
    // board either, so only the stale-board check can keep it off the screen.
    const first = offer.suggestions[0]!;
    const medicham = {
      ...first.fills[0]!,
      pick: { kind: 'species' as const, id: 'medicham' },
      speciesId: 'medicham',
    };
    release({ ...offer, suggestions: [{ ...first, fills: [medicham] }] });
    await waitFor(() => expect(suggestTeammates).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('button', { name: 'Add Medicham' })).not.toBeInTheDocument();
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
