import 'fake-indexeddb/auto';
import type { Recommendation, TeamRecommendation } from '@pickthree/engine';
import { IDBFactory } from 'fake-indexeddb';
import {
  act,
  fireEvent,
  getDefaultNormalizer,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LogBattle } from '../src/screens/LogBattle.tsx';
import { NewSet } from '../src/screens/NewSet.tsx';
import { AppProvider, useActions, useAppState, type AppState } from '../src/state/store.tsx';
import { canGoBack, resetHistoryForTests } from '../src/state/history.ts';
import { emptyLayoutValue } from '../src/format.ts';
import { resetDbForTests, storage } from '../src/storage/db.ts';
import { fakeHost } from './fakeHost.ts';
import { makeTeam } from './teamFixture.ts';

let latest: { state: AppState; actions: ReturnType<typeof useActions> } | null = null;
function Probe() {
  latest = { state: useAppState(), actions: useActions() };
  return null;
}

async function saveEmptyCollection(): Promise<void> {
  await storage.saveCollection({
    specimens: [],
    report: {
      scansRead: 0,
      recognized: 0,
      duplicatesMerged: 0,
      missingIvs: { count: 0, names: [] },
      unrecognized: [],
      rowProblems: [],
      layout: emptyLayoutValue(),
      newestScan: null,
    },
    importedAt: '2026-09-16T00:00:00Z',
    fileName: null,
  });
}

/** A host whose recommend() answers with the given teams, in place of the default empty list. */
function hostWith(teams: TeamRecommendation[]) {
  const host = fakeHost();
  const base = host.recommend as unknown as () => Promise<Recommendation>;
  host.recommend = vi.fn(async () => ({ ...(await base()), teams })) as typeof host.recommend;
  return host;
}

async function renderReady(host: ReturnType<typeof fakeHost>) {
  render(
    <AppProvider host={host}>
      <Probe />
      <NewSet />
    </AppProvider>,
  );
  await waitFor(() => {
    expect(latest?.state.boot).toBe('ready');
    expect(latest?.state.settingsLoaded).toBe(true);
    expect(latest?.state.leagueInfo).not.toBeNull();
  });
}

describe('New Set on the foundation', () => {
  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    resetHistoryForTests();
    latest = null;
    // Clears the underlying history state too, so markEntry() (which restores a saved
    // pick3Depth from window.history.state rather than counting) starts fresh, not from a
    // leftover depth an earlier test in this file left on the shared jsdom window.
    window.history.replaceState(null, '', '#/meta/new');
    await saveEmptyCollection();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('is a sub page titled Pick Your Team, Cancel returning to Your Meta, input before the slots', async () => {
    await renderReady(hostWith([]));
    expect(screen.getByText('Pick Your Team')).toBeInTheDocument();
    const search = screen.getByPlaceholderText('Search any Pokémon');
    const slot = screen.getByRole('button', { name: 'Slot 1' });
    expect(search.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(window.location.hash).toBe('#/meta'));
  });

  it('starts a set from three picked species, Start set disabled until then', async () => {
    await renderReady(hostWith([]));
    const start = screen.getByRole('button', { name: 'Start set' });
    expect(start).toBeDisabled();
    const picks: [string, string][] = [
      ['tink', 'Tinkaton'],
      ['azu', 'Azumarill'],
      ['clod', 'Clodsire'],
    ];
    for (const [q, fullName] of picks) {
      fireEvent.change(screen.getByPlaceholderText('Search any Pokémon'), { target: { value: q } });
      const token = await screen.findByRole('button', { name: fullName });
      fireEvent.click(token);
    }
    expect(start).toBeEnabled();
    await act(async () => {
      fireEvent.click(start);
    });
    await waitFor(async () => expect(await storage.loadSets('great')).toHaveLength(1));
    // The set is saved before startSet resolves and go() navigates, so the hash can lag the save.
    await waitFor(() => expect(window.location.hash).toBe('#/meta'));
  });

  it('shows a From pick3 row reading like Teams, the number and fit', async () => {
    await renderReady(
      hostWith([
        makeTeam({
          id: 't1',
          species: ['tinkaton', 'azumarill', 'clodsire'],
          battle: 88,
          fit: 'Strong',
        }),
      ]),
    );
    await act(async () => {
      await latest!.actions.runRecommend();
    });
    expect(screen.getByText('From pick3')).toBeInTheDocument();
    const row = screen.getByText(
      /^88\u00a0· Strong fit\u00a0· Moderate\u00a0· 263,900\u00a0Stardust$/,
      { normalizer: getDefaultNormalizer({ collapseWhitespace: false }) },
    );
    expect(row).toBeInTheDocument();
  });

  it('a From pick3 tap fills the three slots without starting; Start set starts it with its moves', async () => {
    await renderReady(
      hostWith([makeTeam({ id: 't1', species: ['tinkaton', 'azumarill', 'clodsire'] })]),
    );
    await act(async () => {
      await latest!.actions.runRecommend();
    });
    const startSet = vi.spyOn(latest!.actions, 'startSet');
    const row = screen
      .getByText('From pick3')
      .parentElement!.querySelector('button.pick3-row') as HTMLButtonElement;
    fireEvent.click(row);
    for (const fullName of ['Tinkaton', 'Azumarill', 'Clodsire']) {
      expect(screen.getByRole('button', { name: `Clear ${fullName}` })).toBeInTheDocument();
    }
    // Filled slots hide both shortcut lists; nothing started, nothing saved, still on New Set.
    expect(screen.queryByText('From pick3')).not.toBeInTheDocument();
    expect(startSet).not.toHaveBeenCalled();
    expect(await storage.loadSets('great')).toHaveLength(0);
    expect(window.location.hash).toBe('#/meta/new');
    const start = screen.getByRole('button', { name: 'Start set' });
    expect(start).toBeEnabled();
    await act(async () => {
      fireEvent.click(start);
    });
    await waitFor(async () => {
      const sets = await storage.loadSets('great');
      expect(sets).toHaveLength(1);
      expect(sets[0]?.team).toEqual({
        species: ['tinkaton', 'azumarill', 'clodsire'],
        specimenIds: ['t1-tinkaton', 't1-azumarill', 't1-clodsire'],
        moves: [
          { fast: 'FAST', charged: expect.any(Array) },
          { fast: 'FAST', charged: expect.any(Array) },
          { fast: 'FAST', charged: expect.any(Array) },
        ],
      });
    });
    // The set is saved before startSet resolves and go() navigates, so the hash can lag the save.
    await waitFor(() => expect(window.location.hash).toBe('#/meta'));
  });

  it('clearing a slot after a From pick3 tap drops its moves: the refilled team starts without them', async () => {
    await renderReady(
      hostWith([makeTeam({ id: 't1', species: ['tinkaton', 'azumarill', 'clodsire'] })]),
    );
    await act(async () => {
      await latest!.actions.runRecommend();
    });
    const row = screen
      .getByText('From pick3')
      .parentElement!.querySelector('button.pick3-row') as HTMLButtonElement;
    fireEvent.click(row);
    fireEvent.click(screen.getByRole('button', { name: 'Clear Clodsire' }));
    fireEvent.change(screen.getByPlaceholderText('Search any Pokémon'), {
      target: { value: 'clod' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Clodsire' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start set' }));
    });
    await waitFor(async () => {
      const sets = await storage.loadSets('great');
      expect(sets).toHaveLength(1);
      expect(sets[0]?.team.species).toEqual(['tinkaton', 'azumarill', 'clodsire']);
      expect(sets[0]?.team.moves).toBeUndefined();
    });
  });

  it('a Recent teams tap fills the three slots without starting; Start set starts it with its moves', async () => {
    const team = {
      species: ['tinkaton', 'azumarill', 'clodsire'] as [string, string, string],
      moves: [
        { fast: 'FAIRY_WIND', charged: ['PLAY_ROUGH'] },
        { fast: 'BUBBLE', charged: ['ICE_BEAM'] },
        { fast: 'POISON_STING', charged: ['EARTHQUAKE'] },
      ] as [
        { fast: string; charged: string[] },
        { fast: string; charged: string[] },
        { fast: string; charged: string[] },
      ],
    };
    await storage.saveSet({
      id: 's1',
      league: 'great',
      startedAt: '2026-09-15T10:00:00Z',
      team,
      battles: [],
      closed: true,
    });
    await renderReady(hostWith([]));
    await waitFor(() => expect(screen.getByText('Recent teams')).toBeInTheDocument());
    const startSet = vi.spyOn(latest!.actions, 'startSet');
    fireEvent.click(
      screen
        .getByText('Recent teams')
        .parentElement!.querySelector('button.team-pick') as HTMLButtonElement,
    );
    for (const fullName of ['Tinkaton', 'Azumarill', 'Clodsire']) {
      expect(screen.getByRole('button', { name: `Clear ${fullName}` })).toBeInTheDocument();
    }
    expect(screen.queryByText('Recent teams')).not.toBeInTheDocument();
    expect(startSet).not.toHaveBeenCalled();
    expect(await storage.loadSets('great')).toHaveLength(1);
    expect(window.location.hash).toBe('#/meta/new');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start set' }));
    });
    await waitFor(async () => {
      const sets = await storage.loadSets('great');
      expect(sets).toHaveLength(2);
      expect(sets.find((x) => x.id !== 's1')?.team).toEqual(team);
    });
    await waitFor(() => expect(window.location.hash).toBe('#/meta'));
  });

  it('hides both From pick3 and Recent teams while searching', async () => {
    await storage.saveSet({
      id: 's1',
      league: 'great',
      startedAt: '2026-09-15T10:00:00Z',
      team: { species: ['tinkaton', 'azumarill', 'clodsire'] },
      battles: [],
      closed: false,
    });
    await renderReady(hostWith([makeTeam({ species: ['tinkaton', 'azumarill', 'clodsire'] })]));
    await act(async () => {
      await latest!.actions.runRecommend();
    });
    await waitFor(() => expect(screen.getByText('From pick3')).toBeInTheDocument());
    expect(screen.getByText('Recent teams')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Search any Pokémon'), {
      target: { value: 'tink' },
    });
    expect(screen.queryByText('From pick3')).not.toBeInTheDocument();
    expect(screen.queryByText('Recent teams')).not.toBeInTheDocument();
  });

  it('does not show From pick3 with an empty recommendation', async () => {
    await renderReady(hostWith([]));
    await act(async () => {
      await latest!.actions.runRecommend();
    });
    expect(screen.queryByText('From pick3')).not.toBeInTheDocument();
  });
});

describe("Cancel escapes Log a Battle's own no-set redirect", () => {
  /** Mirrors App.tsx's switch for just these two routes, so the real navigate()/back() code
   * (not a stand-in) drives the transition between them. */
  function Router() {
    const s = useAppState();
    if (s.route.screen === 'meta-log') {
      return <LogBattle />;
    }
    if (s.route.screen === 'meta-new') {
      return <NewSet />;
    }
    return null;
  }

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    resetHistoryForTests();
    latest = null;
    window.history.replaceState(null, '', '#/meta');
    await saveEmptyCollection();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it(
    'opening Log a Battle with nothing running lands on New Set without adding a history ' +
      'entry, and Cancel from there reaches Your Meta',
    async () => {
      render(
        <AppProvider host={fakeHost()}>
          <Probe />
          <Router />
        </AppProvider>,
      );
      await waitFor(() => expect(latest?.state.boot).toBe('ready'));
      // A real push from Your Meta to Log a Battle, same as the button on Your Meta.
      await act(async () => {
        latest!.actions.navigate({ screen: 'meta-log' });
      });
      await waitFor(() => expect(window.location.hash).toBe('#/meta/log'));
      await waitFor(() => expect(canGoBack()).toBe(true));
      const pushedDepth = (window.history.state as { pick3Depth?: number } | null)?.pick3Depth;
      // No open set: Log a Battle's own effect redirects here. It must replace this entry, not
      // push another, so this depth (the one Cancel's back() will see) is unchanged.
      await waitFor(() => expect(window.location.hash).toBe('#/meta/new'));
      await waitFor(() =>
        expect((window.history.state as { pick3Depth?: number } | null)?.pick3Depth).toBe(
          pushedDepth,
        ),
      );
      await screen.findByText('Pick Your Team');
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      // Escapes to Your Meta rather than bouncing back through the meta-log entry (which,
      // had it pushed instead of replaced, would immediately redirect forward again).
      await waitFor(() => expect(window.location.hash).toBe('#/meta'));
    },
  );
});
