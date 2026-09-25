import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import type { MoveChoice, MovePool } from '@pickthree/engine';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Build } from '../src/screens/Build.tsx';
import { AppProvider, useActions } from '../src/state/store.tsx';
import { resetHistoryForTests } from '../src/state/history.ts';
import { resetDbForTests } from '../src/storage/db.ts';
import { fakeHost, GREAT } from './fakeHost.ts';

const ULTRA = {
  ...GREAT,
  id: 'ultra',
  title: 'Ultra League',
  short: 'Ultra',
  cp: 2500,
  meta: 'ultra',
};

describe('Build a team', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    window.location.hash = '';
    resetHistoryForTests();
  });

  // A failed assertion must not leave a stubbed global (matchMedia) or a spy (history.back) to
  // later tests.
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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
  /** Tinkaton's move pool: one fast move and two charged, both recommended. */
  const pool: MovePool = {
    fast: [move('FAIRY_WIND', 'Fairy Wind')],
    charged: [move('PLAY_ROUGH', 'Play Rough'), move('HEAVY_SLAM', 'Heavy Slam')],
    recommended: { fast: 'FAIRY_WIND', charged: ['PLAY_ROUGH', 'HEAVY_SLAM'] },
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

  it('takes the old league teammates down the moment the league changes', async () => {
    const suggestTeammates = vi.fn(async () => offer);
    const base = fakeHost();
    const bootReply = await base.ready();
    // Great answers at once; Ultra's bundle is still on its way, so Build cannot ask again yet.
    const leagueInfo = vi.fn((id: string) =>
      id === 'great' ? base.leagueInfo('great') : new Promise<never>(() => {}),
    );
    render(
      <AppProvider
        host={fakeHost({
          suggestTeammates,
          leagueInfo,
          ready: vi.fn(async () => ({ ...bootReply, leagues: [GREAT, ULTRA] })),
        })}
      >
        <Build />
      </AppProvider>,
    );
    await pickFirst('tink', 'Tinkaton');
    await screen.findByRole('button', { name: 'Add Azumarill' });
    fireEvent.click(screen.getByRole('radio', { name: 'Ultra League' }));
    await waitFor(() => expect(leagueInfo).toHaveBeenCalledWith('ultra'));
    expect(screen.queryByRole('button', { name: 'Add Azumarill' })).not.toBeInTheDocument();
    // Nor does it ask for Ultra on Great's bundle while Ultra's is still loading.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('button', { name: 'Add Azumarill' })).not.toBeInTheDocument();
    expect(suggestTeammates).toHaveBeenCalledTimes(1);
  });

  it('asks again when the facing source changes on the same board', async () => {
    const clodsireFirst = {
      ...offer,
      suggestions: [{ ...offer.suggestions[0]!, fills: [offer.suggestions[0]!.fills[1]!] }],
    };
    const suggestTeammates = vi.fn().mockResolvedValueOnce(offer).mockResolvedValue(clodsireFirst);
    function SourcePrior() {
      const { updateSettings } = useActions();
      return (
        <button
          type="button"
          onClick={() => updateSettings({ facing: { source: 'prior', window: 'meta' } })}
        >
          PvPoke only
        </button>
      );
    }
    render(
      <AppProvider host={fakeHost({ suggestTeammates })}>
        <Build />
        <SourcePrior />
      </AppProvider>,
    );
    await pickFirst('tink', 'Tinkaton');
    await screen.findByRole('button', { name: 'Add Azumarill' });
    fireEvent.click(screen.getByRole('button', { name: 'PvPoke only' }));
    // The rows framed against the old source go at once, and the new source's list replaces them.
    expect(screen.queryByRole('button', { name: 'Add Azumarill' })).not.toBeInTheDocument();
    await screen.findByRole('button', { name: 'Add Clodsire' });
    expect(suggestTeammates).toHaveBeenCalledTimes(2);
  });

  it('asks once for a board whose answer has no teammates', async () => {
    const host = fakeHost();
    render(
      <AppProvider host={host}>
        <Build />
      </AppProvider>,
    );
    await pickFirst('tink', 'Tinkaton');
    await waitFor(() => expect(host.suggestTeammates).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(host.suggestTeammates).toHaveBeenCalledTimes(1);
  });

  it('asks once for a board whose ask failed, and again once the board changes back', async () => {
    // recordError's device summary reads matchMedia, which jsdom does not implement.
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    const suggestTeammates = vi.fn(async () => {
      throw new Error('worker gone');
    });
    render(
      <AppProvider host={fakeHost({ suggestTeammates })}>
        <Build />
      </AppProvider>,
    );
    await pickFirst('tink', 'Tinkaton');
    expect(await screen.findByRole('alert')).toHaveTextContent('worker gone');
    await new Promise((r) => setTimeout(r, 50));
    expect(suggestTeammates).toHaveBeenCalledTimes(1);
    // A different board clears the error; the same board again is a fresh ask, not the old error.
    fireEvent.click(screen.getByRole('button', { name: 'Remove Tinkaton' }));
    await pickFirst('tink', 'Tinkaton');
    await waitFor(() => expect(suggestTeammates).toHaveBeenCalledTimes(2));
  });

  it('keeps the teammate list through a move change, without asking again', async () => {
    const suggestTeammates = vi.fn(async () => offer);
    render(
      <AppProvider host={fakeHost({ suggestTeammates, movePool: vi.fn(async () => pool) })}>
        <Build />
      </AppProvider>,
    );
    await pickFirst('tink', 'Tinkaton');
    await screen.findByRole('button', { name: 'Add Azumarill' });
    fireEvent.click(screen.getByRole('button', { name: 'Tinkaton moves' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: /Heavy Slam/ }));
    await screen.findByText('Moves changed');
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByRole('button', { name: 'Add Azumarill' })).toBeInTheDocument();
    expect(suggestTeammates).toHaveBeenCalledTimes(1);
  });

  it('says Moves changed only while the moves differ from the recommendation', async () => {
    render(
      <AppProvider host={fakeHost({ movePool: vi.fn(async () => pool) })}>
        <Build />
      </AppProvider>,
    );
    await pickFirst('tink', 'Tinkaton');
    fireEvent.click(await screen.findByRole('button', { name: 'Tinkaton moves' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: /Heavy Slam/ }));
    await screen.findByText('Moves changed');
    fireEvent.click(screen.getByRole('button', { name: 'Reset to recommended' }));
    await waitFor(() => expect(screen.queryByText('Moves changed')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Reset to recommended' })).toBeDisabled();
    // Untick Play Rough and tick it again: the same pair in the other order is no change either.
    fireEvent.click(screen.getByRole('checkbox', { name: /Play Rough/ }));
    await screen.findByText('Moves changed');
    fireEvent.click(screen.getByRole('checkbox', { name: /Play Rough/ }));
    await waitFor(() => expect(screen.queryByText('Moves changed')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Reset to recommended' })).toBeDisabled();
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
    // No card to tap on an empty board, so no hint yet; one pick brings it.
    expect(screen.queryByText('Tap a card to change its moves')).not.toBeInTheDocument();
    expect(screen.queryByText(/The cards run in the order shown/)).not.toBeInTheDocument();
    await pickFirst('tink', 'Tinkaton');
    await screen.findByText('Tap a card to change its moves');
  });

  it('drops the Ordered by pick3 hint once a card is removed', async () => {
    // Best order puts Clodsire first; the analysis names each slot's build by species.
    const analyze = vi.fn(async () => ({
      team: {
        slots: ['clodsire', 'tinkaton', 'azumarill'].map((speciesId) => ({
          candidate: { build: { speciesId, specimenId: null } },
        })),
      },
    }));
    render(
      <AppProvider host={fakeHost({ analyze })}>
        <Build />
      </AppProvider>,
    );
    await pickFirst('tink', 'Tinkaton');
    await pickFirst('azu', 'Azumarill');
    await pickFirst('clod', 'Clodsire');
    fireEvent.click(screen.getByRole('button', { name: 'Find best order' }));
    await screen.findByText('Ordered by pick3. Drag a card to change it.');
    fireEvent.click(screen.getByRole('button', { name: 'Remove Clodsire' }));
    await screen.findByText('Tap a card to change its moves');
    expect(screen.queryByText(/Ordered by pick3/)).not.toBeInTheDocument();
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

  it('heads the list by how many are on the board', async () => {
    const clodsireFirst = {
      ...offer,
      suggestions: [{ ...offer.suggestions[0]!, fills: [offer.suggestions[0]!.fills[1]!] }],
    };
    const suggestTeammates = vi.fn().mockResolvedValueOnce(offer).mockResolvedValue(clodsireFirst);
    render(
      <AppProvider host={fakeHost({ suggestTeammates })}>
        <Build />
      </AppProvider>,
    );
    await pickFirst('tink', 'Tinkaton');
    await screen.findByRole('heading', { name: 'Best with your first pick' });
    fireEvent.click(await screen.findByRole('button', { name: 'Add Azumarill' }));
    await screen.findByRole('heading', { name: 'Best with your first two' });
    expect(screen.getByRole('button', { name: 'Add Clodsire' })).toBeInTheDocument();
  });

  it('hides the suggestions while a slot search is open', async () => {
    const suggestTeammates = vi.fn(async () => offer);
    render(
      <AppProvider host={fakeHost({ suggestTeammates })}>
        <Build />
      </AppProvider>,
    );
    await pickFirst('tink', 'Tinkaton');
    await screen.findByRole('button', { name: 'Add Azumarill' });
    fireEvent.click(screen.getByRole('button', { name: 'Safe Switch, empty' }));
    const search = await screen.findByPlaceholderText('Search any Pokémon for Safe Switch');
    expect(screen.queryByRole('region', { name: 'Suggested teammates' })).not.toBeInTheDocument();
    fireEvent.keyDown(search, { key: 'Escape' });
    await screen.findByRole('region', { name: 'Suggested teammates' });
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

  it('Back goes back through history when pick3 has a screen behind Build', async () => {
    window.location.hash = '#/teams';
    render(
      <AppProvider host={fakeHost()}>
        <Build />
      </AppProvider>,
    );
    await screen.findByRole('button', { name: 'Back' });
    // A second pick3 entry on top of Teams, stamped by the provider's hashchange listener.
    window.location.hash = '#/build';
    await waitFor(() =>
      expect((window.history.state as { pick3Depth?: number } | null)?.pick3Depth).toBe(1),
    );
    const historyBack = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(historyBack).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe('#/build');
  });

  it('shows the move pool once it arrives, and each move change at once', async () => {
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
