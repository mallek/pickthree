import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import type { MoveChoice, MovePool } from '@pickthree/engine';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Build } from '../src/screens/Build.tsx';
import { AppProvider } from '../src/state/store.tsx';
import { resetHistoryForTests } from '../src/state/history.ts';
import { resetDbForTests } from '../src/storage/db.ts';
import { fakeHost } from './fakeHost.ts';

describe('Build a team', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    window.location.hash = '';
    resetHistoryForTests();
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
    fireEvent.change(await screen.findByPlaceholderText('Search any Pokémon for Lead'), {
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
    expect(screen.queryByPlaceholderText(/Search any Pokémon/)).not.toBeInTheDocument();
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

  /** Open the first empty slot, search for `query` and tap the result named `label`. */
  async function pickFirst(query: string, label: string): Promise<void> {
    const [empty] = await screen.findAllByRole('button', { name: /, empty$/ });
    fireEvent.click(empty!);
    fireEvent.change(await screen.findByPlaceholderText(/Search any Pokémon for/), {
      target: { value: query },
    });
    fireEvent.click(await screen.findByRole('button', { name: label }));
  }

  it('offers teammates without writing any pick', async () => {
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

  it('drops a suggestion for a board that changed while it ran', async () => {
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

  it('asks again when a pick change clears the list for a board it already asked about', async () => {
    const suggestTeammates = vi.fn(async () => offer);
    render(
      <AppProvider host={fakeHost({ suggestTeammates })}>
        <Build />
      </AppProvider>,
    );
    await pickFirst('tink', 'Tinkaton');
    await screen.findByRole('button', { name: 'Add Azumarill' });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Tinkaton' }));
    // The same board as before: the store cleared its list, so Build has to ask again.
    await pickFirst('tink', 'Tinkaton');
    await screen.findByRole('button', { name: 'Add Azumarill' });
    expect(suggestTeammates).toHaveBeenCalledTimes(2);
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
    fireEvent.change(await screen.findByPlaceholderText('Search any Pokémon for Lead'), {
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

    const dialog = await screen.findByRole('dialog', { name: 'Tinkaton' });
    expect(dialog).toBeInTheDocument();
    // The fake host's movePool never resolves, so the sheet falls back to the Progress row
    // instead of crashing on a missing pool.
    expect(screen.getByRole('status')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Tinkaton' })).not.toBeInTheDocument(),
    );
  });

  it('puts Your lineup and Find best order above the cards, with the hint', async () => {
    render(
      <AppProvider host={fakeHost()}>
        <Build />
      </AppProvider>,
    );
    const title = await screen.findByRole('heading', { name: 'Your lineup' });
    const find = screen.getByRole('button', { name: 'Find best order' });
    const firstCard = screen.getByRole('button', { name: 'Lead, empty' });
    expect(
      title.compareDocumentPosition(firstCard) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(find.compareDocumentPosition(firstCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(find).toBeDisabled();
    expect(screen.getByText('Tap a card to change its moves')).toBeInTheDocument();
    expect(screen.queryByText(/The cards run in the order shown/)).not.toBeInTheDocument();
  });

  it('names the slot being chosen and what that role does', async () => {
    render(
      <AppProvider host={fakeHost()}>
        <Build />
      </AppProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Safe Switch, empty' }));
    expect(screen.getByText('Choosing Safe Switch')).toBeInTheDocument();
    expect(screen.getByText('Comes in when the lead matchup goes badly')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search any Pokémon for Safe Switch')).toBeInTheDocument();
  });

  it('+ Add fills the first empty slot and the list goes once all three are in', async () => {
    const suggestTeammates = vi.fn(async () => offer);
    render(
      <AppProvider host={fakeHost({ suggestTeammates })}>
        <Build />
      </AppProvider>,
    );
    await pickFirst('tink', 'Tinkaton');
    fireEvent.click(await screen.findByRole('button', { name: 'Add Azumarill' }));
    await screen.findByRole('button', { name: 'Remove Azumarill' });
    expect(screen.getByRole('button', { name: 'Closer, empty' })).toBeInTheDocument();
    await pickFirst('clod', 'Clodsire');
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Suggested teammates' })).not.toBeInTheDocument(),
    );
  });

  it('with none of yours, says there is nothing to price', async () => {
    // fakeHost has no collection, so every search pick is a species pick, not yours.
    render(
      <AppProvider host={fakeHost()}>
        <Build />
      </AppProvider>,
    );
    await pickFirst('tink', 'Tinkaton');
    await pickFirst('azu', 'Azumarill');
    await pickFirst('clod', 'Clodsire');
    expect(await screen.findByTestId('build-cost')).toHaveTextContent(
      'None of these are yours yet, so there is nothing to price.',
    );
  });

  it('Back returns to Teams when Build was the first screen', async () => {
    render(
      <AppProvider host={fakeHost()}>
        <Build />
      </AppProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Back' }));
    await waitFor(() => expect(window.location.hash).toBe('#/teams'));
  });

  it('shows the move pool once it arrives, and each move change at once', async () => {
    const move = (moveId: string, name: string): MoveChoice => ({
      moveId,
      name,
      type: 'fairy',
      tm: 'tm',
      energy: 50,
      energyGain: 8,
      turns: 1,
      countFromFast: null,
      counts: null,
      effects: [],
      altType: null,
    });
    const pool: MovePool = {
      fast: [move('FAIRY_WIND', 'Fairy Wind')],
      charged: [move('PLAY_ROUGH', 'Play Rough'), move('HEAVY_SLAM', 'Heavy Slam')],
      recommended: { fast: 'FAIRY_WIND', charged: ['PLAY_ROUGH', 'HEAVY_SLAM'] },
    };
    let resolvePool: (p: MovePool) => void = () => {};
    // The first pool waits for the test; later ones (a move change re-keys the pool by its fast
    // move) come straight back, as the worker's would.
    const movePool = vi
      .fn()
      .mockImplementationOnce(() => new Promise<MovePool>((r) => (resolvePool = r)))
      .mockImplementation(async () => pool);
    render(
      <AppProvider host={fakeHost({ movePool })}>
        <Build />
      </AppProvider>,
    );
    await pickFirst('tink', 'Tinkaton');
    await waitFor(() => expect(movePool).toHaveBeenCalled());
    // The sheet opens before the pool arrives, so it has to pick the pool up once it lands.
    fireEvent.click(await screen.findByRole('button', { name: 'Tinkaton moves' }));
    await screen.findByRole('dialog', { name: 'Tinkaton' });
    act(() => resolvePool(pool));
    const heavySlam = await screen.findByRole('checkbox', { name: /Heavy Slam/ });
    expect(heavySlam).toBeChecked();
    fireEvent.click(heavySlam);
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: /Heavy Slam/ })).not.toBeChecked(),
    );
    expect(screen.getByText('Moves changed')).toBeInTheDocument();
  });

  it('opens the move sheet from a card, with Analyze as the one primary button', async () => {
    render(
      <AppProvider host={fakeHost()}>
        <Build />
      </AppProvider>,
    );
    await pickFirst('tink', 'Tinkaton');
    fireEvent.click(await screen.findByRole('button', { name: 'Tinkaton moves' }));
    expect(await screen.findByRole('dialog', { name: /Tinkaton/ })).toBeInTheDocument();
    expect(document.querySelectorAll('.ui-btn-primary')).toHaveLength(1);
  });
});
