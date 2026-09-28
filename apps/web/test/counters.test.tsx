import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CounterEntry, CountersResult, Specimen } from '@pickthree/engine';
import { resetStickyForTests } from '../src/components.tsx';
import { Counters } from '../src/screens/Counters.tsx';
import { SpecimenScreen } from '../src/screens/Specimen.tsx';
import { emptyLayoutValue } from '../src/format.ts';
import {
  AppProvider,
  useActions,
  useAppState,
  type AppState,
  type Route,
} from '../src/state/store.tsx';
import { canGoBack, resetHistoryForTests } from '../src/state/history.ts';
import { resetDbForTests, storage } from '../src/storage/db.ts';
import { fakeHost, GREAT, EMPTY_COUNTERS, streamingCounters } from './fakeHost.ts';

const ULTRA = {
  ...GREAT,
  id: 'ultra',
  title: 'Ultra League',
  short: 'Ultra',
  cp: 2500,
  meta: 'ultra',
};

async function twoLeagueHost() {
  const leagueInfo = vi.fn(async (id: string) => ({
    id,
    meta: ['tinkaton', 'azumarill', 'clodsire'],
    metaSize: 3,
    metaRanks: {
      tinkaton: { overall: 1, score: 95, role: null, roleRank: null },
      azumarill: { overall: 2, score: 92, role: null, roleRank: null },
      clodsire: { overall: 3, score: 90, role: null, roleRank: null },
    },
    analyzable: ['tinkaton', 'azumarill', 'clodsire'],
  }));
  const counters = vi.fn(async () => EMPTY_COUNTERS);
  const base = fakeHost();
  // The boot reply carries both leagues, so the switcher and the route can each find 'ultra'.
  const bootReply = await base.ready();
  const host = fakeHost({
    leagueInfo,
    counters,
    ready: vi.fn(async () => ({ ...bootReply, leagues: [GREAT, ULTRA] })),
  });
  return host;
}

function freshPage(): void {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  resetStickyForTests();
  resetHistoryForTests();
  // A fresh first entry: no pick3 depth left over from an earlier test.
  window.history.replaceState(null, '', window.location.pathname);
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
}

describe('Counters screen, league from a link', () => {
  beforeEach(() => {
    freshPage();
  });

  it('switches to the league a meta.pick3.gg link names, then scores counters in it', async () => {
    window.location.hash = '#/counters?vs=medicham&l=ultra';
    const host = await twoLeagueHost();
    render(
      <AppProvider host={host}>
        <Counters />
      </AppProvider>,
    );
    await waitFor(() =>
      expect((host.counters as unknown as { mock: { calls: unknown[][] } }).mock.calls.length).toBe(
        1,
      ),
    );
    expect(
      (host.leagueInfo as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(-1)?.[0],
    ).toBe('ultra');
    expect(screen.getByRole('radio', { name: 'Ultra League' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    // A link from meta.pick3.gg has no pick3 history: the tab's own header, no Back.
    expect(screen.getByRole('heading', { name: 'Counters' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('lets go of the linked league once it is in play, so the league switcher still works', async () => {
    window.location.hash = '#/counters?vs=medicham&l=ultra';
    const host = await twoLeagueHost();
    render(
      <AppProvider host={host}>
        <Counters />
      </AppProvider>,
    );
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Ultra League' })).toHaveAttribute(
        'aria-checked',
        'true',
      ),
    );
    // The route drops the league once Ultra is in play; the opponent stays.
    await waitFor(() => expect(window.location.hash).toBe('#/counters?vs=medicham'));
    const leagueCalls = (host.leagueInfo as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'Great League' }));
    });
    await waitFor(() => expect(leagueCalls.at(-1)?.[0]).toBe('great'));
    // Given time to switch back, it does not: Great stays.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(leagueCalls.at(-1)?.[0]).toBe('great');
    expect(screen.getByRole('radio', { name: 'Great League' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(window.location.hash).toBe('#/counters?vs=medicham');
  });

  it('ignores an unknown league id and still scores counters in whatever league was in play', async () => {
    window.location.hash = '#/counters?vs=medicham&l=nonsense';
    const host = await twoLeagueHost();
    render(
      <AppProvider host={host}>
        <Counters />
      </AppProvider>,
    );
    await waitFor(() =>
      expect((host.counters as unknown as { mock: { calls: unknown[][] } }).mock.calls.length).toBe(
        1,
      ),
    );
    expect(screen.getByRole('radio', { name: 'Great League' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});

describe('Counters screen, facing', () => {
  beforeEach(() => {
    freshPage();
  });

  it('scores counters again when the Source changes, with the new facing', async () => {
    let actions: ReturnType<typeof useActions> | null = null;
    function Probe() {
      actions = useActions();
      return null;
    }
    const host = fakeHost();
    const calls = (host.counters as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    render(
      <AppProvider host={host}>
        <Probe />
        <Counters />
      </AppProvider>,
    );
    // The default source is Your meta (the log).
    await waitFor(() => expect(calls.length).toBe(1));
    expect((calls[0]![1] as { facing: { kind: string } }).facing.kind).toBe('log');
    // Another screen (Teams) switches the Source; Counters must not keep the old weighting.
    await act(async () => {
      actions!.updateSettings((cur) => ({ ...cur, facing: { source: 'prior', window: 'meta' } }));
    });
    await waitFor(() => expect(calls.length).toBe(2));
    expect((calls[1]![1] as { facing: { kind: string } }).facing.kind).toBe('prior');
  });
});

// ---------------------------------------------------------------------------------------------
// The page: header, Against picker, the line, filters, rows, links, loading and empty states.

let latest: { state: AppState; actions: ReturnType<typeof useActions> } | null = null;
function Probe() {
  latest = { state: useAppState(), actions: useActions() };
  return null;
}

/** Counters on its route, a Pokémon's page on its own, nothing elsewhere: as App does. */
function Gate() {
  const r = useAppState().route;
  if (r.screen === 'specimen') {
    return <SpecimenScreen id={r.id} />;
  }
  return r.screen === 'counters' ? <Counters /> : null;
}

function specimen(id: string, speciesId: string): Specimen {
  return {
    id,
    speciesId,
    familyId: speciesId,
    ivs: { atk: 0, def: 15, sta: 15 },
    level: { min: 20, max: 20 },
    cp: 1400,
    hp: 150,
    shadow: false,
    purified: false,
    lucky: false,
    currentMoves: { fast: null, charged: [] },
    scannedAt: '2026-09-20 12:00:00',
    raw: {},
  } as unknown as Specimen;
}

/** A Tinkaton you own, and a Rookidee that becomes Corviknight. */
const SPECIMENS = [specimen('a', 'tinkaton'), specimen('r', 'rookidee')];

async function seed(): Promise<void> {
  await storage.saveCollection({
    specimens: SPECIMENS,
    report: {
      scansRead: SPECIMENS.length,
      recognized: SPECIMENS.length,
      duplicatesMerged: 0,
      missingIvs: { count: 0, names: [] },
      unrecognized: [],
      rowProblems: [],
      layout: emptyLayoutValue(),
      newestScan: '2026-09-20 12:00:00',
    },
    importedAt: '2026-09-20T12:00:00Z',
    fileName: null,
  });
}

function entry(speciesId: string, over: Partial<CounterEntry> = {}): CounterEntry {
  return {
    speciesId,
    overallRank: 1,
    antiRank: 1,
    antiMeta: 70,
    gap: 0,
    beats: [],
    losesTo: [],
    owned: 'none',
    ownedSpecimenId: null,
    ownedStageOffset: null,
    grid: null,
    ...over,
  };
}

/** Tinkaton owned, Corviknight buildable from the Rookidee, Medicham unranked and not owned.
 * Under the radar (gap) orders them Corviknight, Medicham, Tinkaton. */
const WHOLE: CountersResult = {
  entries: [
    entry('tinkaton', {
      overallRank: 1,
      antiRank: 1,
      antiMeta: 70.2,
      gap: 0,
      beats: [{ opponent: 'azumarill', opponentRank: 2, scenarios: 3 }],
      losesTo: [{ opponent: 'clodsire', opponentRank: 3, scenarios: 0 }],
      owned: 'have',
      ownedSpecimenId: 'a',
      ownedStageOffset: 0,
    }),
    entry('corviknight', {
      overallRank: 156,
      antiRank: 2,
      antiMeta: 65,
      gap: 154,
      owned: 'build',
      ownedSpecimenId: 'r',
      ownedStageOffset: 2,
    }),
    entry('medicham', { overallRank: null, antiRank: 3, antiMeta: 60, gap: 5 }),
  ],
  facing: 'PvPoke weights (11 of 15 battles logged)',
  blended: true,
  battles: 11,
};

const SPLIT = [600, 400, 400, 600, 600, 400, 600, 600, 600];

const VS: CountersResult = {
  entries: [
    entry('tinkaton', { antiRank: 1, overallRank: 1, grid: SPLIT }),
    entry('medicham', { antiRank: 2, overallRank: null, grid: SPLIT }),
  ],
  facing: "Scored against one opponent at PvPoke's movesets; your log does not apply here",
  blended: false,
  battles: 0,
  vs: { speciesId: 'azumarill', inMeta: true },
  gridMs: 12,
};

async function pageHost(
  counters: unknown = vi.fn(async (_s: unknown, o: { vs?: string }) => (o.vs ? VS : WHOLE)),
) {
  const bootReply = (await fakeHost().ready()) as unknown as {
    species: Record<string, unknown>;
    allSpecies: string[];
  };
  return fakeHost({
    counters,
    ready: vi.fn(async () => ({
      ...bootReply,
      species: {
        ...bootReply.species,
        rookidee: { name: 'Rookidee', types: ['flying', 'none'], familyId: 'rookidee', dex: 821 },
        corviknight: {
          name: 'Corviknight',
          types: ['flying', 'steel'],
          familyId: 'rookidee',
          dex: 823,
        },
      },
      allSpecies: [...bootReply.allSpecies, 'rookidee', 'corviknight'],
    })),
    leagueInfo: vi.fn(async () => ({
      id: 'great',
      meta: ['tinkaton', 'azumarill', 'clodsire'],
      metaSize: 48,
      metaRanks: {
        tinkaton: { overall: 1, score: 95, role: 'lead', roleRank: 2 },
        azumarill: { overall: 2, score: 92, role: null, roleRank: null },
        clodsire: { overall: 3, score: 90, role: null, roleRank: null },
      },
      analyzable: ['tinkaton', 'azumarill', 'clodsire', 'medicham'],
    })),
  });
}

/** Mount the provider and let the boot route settle: Teams with a collection, Welcome without. */
async function boot(opts: { collection?: boolean; counters?: unknown } = {}): Promise<void> {
  if (opts.collection) {
    await seed();
  }
  const host = await pageHost(opts.counters);
  render(
    <AppProvider host={host}>
      <Probe />
      <Gate />
    </AppProvider>,
  );
  await waitFor(() => {
    expect(latest?.state.boot).toBe('ready');
    expect(latest?.state.settingsLoaded).toBe(true);
    expect(latest?.state.leagueInfo).not.toBeNull();
  });
  if (opts.collection) {
    await waitFor(() => {
      expect(window.location.hash).toBe('#/teams');
      expect(latest?.state.route.screen).toBe('teams');
    });
  }
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function go(route: Route): Promise<void> {
  await act(async () => {
    latest!.actions.navigate(route);
  });
  await waitFor(() => expect(latest?.state.route).toEqual(route));
}

async function rowsIn(): Promise<HTMLElement[]> {
  await waitFor(() => expect(document.querySelectorAll('.counter-row').length).toBeGreaterThan(0));
  return [...document.querySelectorAll<HTMLElement>('.counter-row')];
}

function rowNames(): string[] {
  return [...document.querySelectorAll('.counter-row .spec-name')].map(
    (n) => n.firstChild?.textContent ?? '',
  );
}

/** Scroll the page to 240 and let useScrollMemory record it (it samples on a frame). */
async function scrollTo240(): Promise<void> {
  Object.defineProperty(window, 'scrollY', { value: 240, configurable: true });
  await act(async () => {
    fireEvent.scroll(window);
    await new Promise((r) => window.requestAnimationFrame(() => r(null)));
  });
}

function openAgainst(): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: /^Against/ }));
  return screen.getByRole('dialog', { name: 'Against' });
}

describe('Counters page', () => {
  beforeEach(() => {
    freshPage();
    latest = null;
  });

  it('carries the top header with the meta.pick3.gg link and Settings', async () => {
    await boot();
    await go({ screen: 'counters' });
    const header = document.querySelector('header')!;
    expect(within(header).getByRole('heading', { name: 'Counters' })).toBeInTheDocument();
    expect(
      within(header).getByRole('link', { name: 'meta.pick3.gg, the community meta' }),
    ).toHaveAttribute('href', 'https://meta.pick3.gg');
    fireEvent.click(within(header).getByRole('button', { name: 'Settings' }));
    expect(latest?.state.sheetOpen).toBe(true);
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('jumped to from Your Meta, a sub header whose Back returns there', async () => {
    await boot();
    await go({ screen: 'meta' });
    await go({ screen: 'counters', vs: 'azumarill', from: true });
    expect(canGoBack()).toBe(true);
    const back = await screen.findByRole('button', { name: 'Back' });
    expect(screen.queryByRole('heading', { name: 'Counters', level: 2 })).toBeNull();
    await act(async () => {
      fireEvent.click(back);
    });
    await waitFor(() => expect(latest?.state.route.screen).toBe('meta'));
    expect(window.location.hash).toBe('#/meta');
  });

  it('a jump link opened with no pick3 history gets the top header', async () => {
    window.history.replaceState(null, '', '#/counters?vs=azumarill&from=1');
    await boot();
    await waitFor(() =>
      expect(latest?.state.route).toEqual({ screen: 'counters', vs: 'azumarill', from: true }),
    );
    expect(canGoBack()).toBe(false);
    expect(await screen.findByRole('heading', { name: 'Counters' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('the Against picker reads the whole meta with its size, or the one opponent', async () => {
    await boot();
    await go({ screen: 'counters' });
    await rowsIn();
    expect(screen.getByRole('button', { name: /^Against/ })).toHaveTextContent(
      'The whole meta (48)',
    );
    await go({ screen: 'counters', vs: 'azumarill' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Against/ })).toHaveTextContent('Azumarill'),
    );
  });

  it('the Against sheet searches species; The whole meta shows only with an empty search', async () => {
    await boot();
    await go({ screen: 'counters', vs: 'azumarill' });
    const sheet = openAgainst();
    const input = within(sheet).getByPlaceholderText('Search any Pokémon');
    // The search takes focus once the sheet is up, as Log a Battle's does.
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect(within(sheet).getByRole('button', { name: /The whole meta/ })).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'clod' } });
    expect(within(sheet).getByRole('button', { name: 'Clodsire' })).toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: 'Medicham' })).toBeNull();
    expect(within(sheet).queryByRole('button', { name: /The whole meta/ })).toBeNull();
    fireEvent.change(input, { target: { value: 'zzzz' } });
    expect(within(sheet).getByText('Nothing matches.')).toBeInTheDocument();
  });

  it('choosing an opponent replaces the entry and keeps the back mark, so Back leaves Counters', async () => {
    await boot();
    await go({ screen: 'meta' });
    await go({ screen: 'counters', vs: 'azumarill', from: true });
    await rowsIn();
    const entries = window.history.length;
    let sheet = openAgainst();
    fireEvent.change(within(sheet).getByPlaceholderText('Search any Pokémon'), {
      target: { value: 'medi' },
    });
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Medicham' }));
    });
    expect(latest?.state.route).toEqual({ screen: 'counters', vs: 'medicham', from: true });
    expect(window.location.hash).toBe('#/counters?vs=medicham&from=1');
    expect(window.history.length).toBe(entries);
    expect(screen.queryByRole('dialog', { name: 'Against' })).toBeNull();
    // The whole meta, the same way.
    sheet = openAgainst();
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: /The whole meta/ }));
    });
    expect(latest?.state.route).toEqual({ screen: 'counters', from: true });
    expect(window.location.hash).toBe('#/counters?from=1');
    expect(window.history.length).toBe(entries);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    });
    await waitFor(() => expect(latest?.state.route.screen).toBe('meta'));
  });

  it('the line under the picker: the facing sentence, or the one-opponent line; Sort on the right', async () => {
    await boot({ collection: true });
    await go({ screen: 'counters' });
    await rowsIn();
    const facing = screen.getByText('PvPoke weights (11 of 15 battles logged)');
    const sort = screen.getByRole('combobox', { name: 'Sort' });
    expect(facing.parentElement).toContainElement(sort);
    expect([...sort.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      'Best',
      'Under the radar',
    ]);
    expect(rowNames()).toEqual(['Tinkaton', 'Corviknight', 'Medicham']);
    fireEvent.change(sort, { target: { value: 'radar' } });
    expect(rowNames()).toEqual(['Corviknight', 'Medicham', 'Tinkaton']);
    await go({ screen: 'counters', vs: 'azumarill' });
    expect(
      await screen.findByText("PvPoke's movesets; your log doesn't apply"),
    ).toBeInTheDocument();
    expect(screen.queryByText('PvPoke weights (11 of 15 battles logged)')).toBeNull();
  });

  it('the Filters sheet filters by ownership and the icon counts it', async () => {
    await boot({ collection: true });
    await go({ screen: 'counters' });
    await rowsIn();
    expect(screen.queryByText(/Import your collection/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    const sheet = screen.getByRole('dialog', { name: 'Filters' });
    expect(within(sheet).getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(within(sheet).getByRole('button', { name: 'You own' }));
    expect(rowNames()).toEqual(['Tinkaton']);
    fireEvent.click(within(sheet).getByRole('button', { name: 'Own or can build' }));
    expect(rowNames()).toEqual(['Tinkaton', 'Corviknight']);
    fireEvent.click(within(sheet).getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('button', { name: 'Filters, 1 on' })).toBeInTheDocument();
  });

  it('without a collection: no filter icon, the Import line, and only Build a team around it', async () => {
    await boot();
    await go({ screen: 'counters' });
    const rows = await rowsIn();
    expect(screen.queryByRole('button', { name: /^Filters/ })).toBeNull();
    const line = screen.getByText(/to mark the ones you own\./);
    expect(line).toHaveTextContent('Import your collection to mark the ones you own.');
    expect(within(line).getByRole('link', { name: 'Import' })).toHaveAttribute('href', '#/import');
    // The Import line keeps its line to itself; Sort sits beside the picker instead.
    expect(line.parentElement?.querySelector('select')).toBeNull();
    const picker = screen.getByRole('button', { name: /^Against/ });
    expect(picker.closest('.counters-controls')).toContainElement(
      screen.getByRole('combobox', { name: 'Sort' }),
    );
    for (const row of rows) {
      expect(within(row).queryAllByRole('link')).toHaveLength(0);
      expect(
        within(row)
          .getAllByRole('button')
          .map((b) => b.textContent),
      ).toEqual(['Build a team around it ›']);
    }
  });

  it('rows are not links: rank line, role tags without the overall rank, Beats and Loses', async () => {
    await boot();
    await go({ screen: 'counters' });
    const rows = await rowsIn();
    for (const row of rows) {
      expect(row.tagName).toBe('DIV');
    }
    const [tink, corv, medi] = rows;
    expect(within(tink!).getByText('#1 vs meta · #1 overall')).toBeInTheDocument();
    expect(within(corv!).getByText('#2 vs meta · #156 overall')).toBeInTheDocument();
    expect(within(medi!).getByText('#3 vs meta · unranked')).toBeInTheDocument();
    expect([...tink!.querySelectorAll('.mtag')].map((t) => t.textContent)).toEqual(['#2 lead']);
    expect(within(tink!).getByText('Beats Azumarill #2')).toBeInTheDocument();
    expect(within(tink!).getByText('Loses to Clodsire #3')).toBeInTheDocument();
    // The score against the whole meta.
    expect(within(tink!).getByText('70%')).toBeInTheDocument();
    expect(within(tink!).getByText('of the meta')).toBeInTheDocument();
    expect(tink!.querySelector('.fo-grid')).toBeNull();
  });

  it('against one opponent, the rank names it and the score is the shield grid with its Term', async () => {
    await boot();
    await go({ screen: 'counters', vs: 'azumarill' });
    const rows = await rowsIn();
    expect(within(rows[0]!).getByText('#1 vs Azumarill · #1 overall')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('#2 vs Azumarill · unranked')).toBeInTheDocument();
    expect(within(rows[0]!).queryByText('70%')).toBeNull();
    const grid = within(rows[0]!).getByRole('img', { name: 'Wins 6 of 9 shield pairings' });
    expect(grid).toHaveClass('row');
    const term = within(rows[0]!).getByRole('button', { name: 'shields' });
    fireEvent.click(term);
    expect(
      within(rows[0]!).getByText(
        "Each cell is one battle at PvPoke's movesets and default IVs: your shields down the side, theirs across the top. W is a win, L a loss; an outlined cell is close.",
      ),
    ).toBeInTheDocument();
  });

  it('labeled links: build a team around it, view yours, view your pre-evolution', async () => {
    await boot({ collection: true });
    await go({ screen: 'counters' });
    const [tink, corv, medi] = await rowsIn();
    expect(within(tink!).getByRole('link', { name: 'View yours ›' })).toHaveAttribute(
      'href',
      '#/collection/a',
    );
    expect(within(corv!).getByRole('link', { name: 'View your Rookidee ›' })).toHaveAttribute(
      'href',
      '#/collection/r',
    );
    expect(within(medi!).queryAllByRole('link')).toHaveLength(0);
    await act(async () => {
      fireEvent.click(within(corv!).getByRole('button', { name: 'Build a team around it ›' }));
    });
    await waitFor(() => expect(latest?.state.route.screen).toBe('build'));
    expect(latest?.state.picks[0]).toEqual({ kind: 'species', id: 'corviknight' });
  });

  it('Back from a Pokémon returns with the filter, the sort and the scroll as they were', async () => {
    await boot({ collection: true });
    await go({ screen: 'counters' });
    await rowsIn();
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Filters' })).getByRole('button', {
        name: 'Own or can build',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort' }), {
      target: { value: 'radar' },
    });
    expect(rowNames()).toEqual(['Corviknight', 'Tinkaton']);
    // Scrolled down the list before leaving.
    await scrollTo240();
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    const view = screen.getByRole('link', { name: 'View yours ›' });
    await go({ screen: 'specimen', id: view.getAttribute('href')!.split('/').pop()! });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    });
    await waitFor(() => expect(latest?.state.route.screen).toBe('counters'));
    await rowsIn();
    expect(rowNames()).toEqual(['Corviknight', 'Tinkaton']);
    expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveValue('radar');
    expect(screen.getByRole('button', { name: 'Filters, 1 on' })).toBeInTheDocument();
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, 240));
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });

  it('loading: the stage, then rows with empty grid cells until their battles are in', async () => {
    const { counters, runs } = streamingCounters();
    await boot({ counters });
    await go({ screen: 'counters', vs: 'azumarill' });
    await waitFor(() => expect(runs).toHaveLength(1));
    expect(screen.getByRole('status')).toHaveTextContent('Scoring every species against the meta');
    const rows = VS.entries.map((e) => ({ ...e, grid: null }));
    await act(async () => {
      runs[0]!.onPartial({ ...VS, entries: rows });
      runs[0]!.onProgress({ stage: 'counters-grid', done: 0, total: 2 });
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Playing every shield pairing on this phone',
    );
    const shown = await rowsIn();
    expect(shown).toHaveLength(2);
    for (const row of shown) {
      expect(row.querySelectorAll('.fo-grid i.empty')).toHaveLength(9);
    }
    await act(async () => {
      runs[0]!.onPartial({ ...VS, entries: [VS.entries[0]!, rows[1]!] });
    });
    const [first, second] = [...document.querySelectorAll('.counter-row')];
    expect(first!.querySelectorAll('.fo-grid i.empty')).toHaveLength(0);
    expect(first!.querySelectorAll('.fo-grid i.w')).toHaveLength(6);
    expect(second!.querySelectorAll('.fo-grid i.empty')).toHaveLength(9);
    await act(async () => {
      runs[0]!.resolve(VS);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('each list keeps its own scroll: the whole meta offset never lands on an opponent list', async () => {
    await boot();
    await go({ screen: 'counters' });
    await rowsIn();
    await scrollTo240();
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    await go({ screen: 'meta' });
    await go({ screen: 'counters', vs: 'azumarill', from: true });
    await rowsIn();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(scrollTo).not.toHaveBeenCalledWith(0, 240);
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });

  it('the final result re-sorts the rows in place: the same elements, no scroll jump', async () => {
    const { counters, runs } = streamingCounters();
    await boot({ counters });
    await go({ screen: 'counters', vs: 'azumarill' });
    await waitFor(() => expect(runs).toHaveLength(1));
    await act(async () => {
      runs[0]!.onPartial({ ...VS, entries: VS.entries.map((e) => ({ ...e, grid: null })) });
    });
    const before = await rowsIn();
    expect(rowNames()).toEqual(['Tinkaton', 'Medicham']);
    await scrollTo240();
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    const WIN = [600, 600, 600, 600, 600, 600, 600, 600, 600];
    await act(async () => {
      runs[0]!.resolve({
        ...VS,
        entries: [
          entry('medicham', { antiRank: 1, overallRank: null, grid: WIN }),
          entry('tinkaton', { antiRank: 2, overallRank: 1, grid: SPLIT }),
        ],
      });
    });
    expect(rowNames()).toEqual(['Medicham', 'Tinkaton']);
    const after = [...document.querySelectorAll<HTMLElement>('.counter-row')];
    expect(after[0]).toBe(before[1]);
    expect(after[1]).toBe(before[0]);
    expect(scrollTo).not.toHaveBeenCalled();
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });

  it('an unranked opponent gets its own empty message', async () => {
    const counters = vi.fn(async () => ({
      ...EMPTY_COUNTERS,
      vs: { speciesId: 'medicham', inMeta: false },
    }));
    await boot({ counters });
    await go({ screen: 'counters', vs: 'medicham' });
    expect(
      await screen.findByText(
        'PvPoke does not rank Medicham in Great League, so pick3 has no moveset to simulate it with.',
      ),
    ).toBeInTheDocument();
    expect(document.querySelector('.ui-empty')).not.toBeNull();
    // The empty state explains itself: no line and no Sort above it, while the Against row stays
    // so another opponent can be picked.
    expect(screen.queryByText(/Import your collection/)).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Sort' })).toBeNull();
    expect(screen.getByRole('button', { name: /^Against/ })).toHaveTextContent('Medicham');
  });

  it('an unranked opponent with a collection: no line, no Sort, the filter icon stays', async () => {
    const counters = vi.fn(async () => ({
      ...EMPTY_COUNTERS,
      vs: { speciesId: 'medicham', inMeta: false },
    }));
    await boot({ collection: true, counters });
    await go({ screen: 'counters', vs: 'medicham' });
    await screen.findByText(/PvPoke does not rank Medicham/);
    expect(screen.queryByText("PvPoke's movesets; your log doesn't apply")).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Sort' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Against/ })).toHaveTextContent('Medicham');
  });

  it('nothing to show against the whole meta: a plain empty state, no filter hint', async () => {
    await boot({ counters: vi.fn(async () => EMPTY_COUNTERS) });
    await go({ screen: 'counters' });
    expect(await screen.findByText('No counters to show.')).toBeInTheDocument();
    expect(document.querySelector('.ui-empty')).not.toBeNull();
    expect(screen.queryByText(/Try another filter/)).toBeNull();
  });

  it('nothing beats one opponent: the empty state names it and the league', async () => {
    const counters = vi.fn(async () => ({
      ...EMPTY_COUNTERS,
      vs: { speciesId: 'azumarill', inMeta: true },
    }));
    await boot({ counters });
    await go({ screen: 'counters', vs: 'azumarill' });
    expect(
      await screen.findByText('Nothing in Great League beats Azumarill in any shield pairing.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Try another filter/)).toBeNull();
  });

  it('a filter that hides every row says to try another filter', async () => {
    const counters = vi.fn(async () => ({ ...WHOLE, entries: [entry('medicham')] }));
    await boot({ collection: true, counters });
    await go({ screen: 'counters' });
    await rowsIn();
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Filters' })).getByRole('button', {
        name: 'You own',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByText('Nothing here yet. Try another filter.')).toBeInTheDocument();
  });

  describe.each([
    { against: 'the whole meta', vs: null, collection: false },
    { against: 'the whole meta', vs: null, collection: true },
    { against: 'one opponent', vs: 'azumarill', collection: false },
    { against: 'one opponent', vs: 'azumarill', collection: true },
  ])('a failed run against $against (collection: $collection)', ({ vs, collection }) => {
    it('shows the error state with Try again, not the empty state, and asks again only on a tap', async () => {
      let fail = true;
      const counters = vi.fn(async (_s: unknown, o: { vs?: string }) => {
        if (fail) {
          throw new Error('worker gone');
        }
        return o.vs ? VS : WHOLE;
      });
      await boot({ collection, counters });
      await go(vs ? { screen: 'counters', vs } : { screen: 'counters' });
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Counters could not be computed.');
      expect(document.querySelector('.ui-empty')).toBeNull();
      expect(screen.queryByText(/Nothing here yet|No counters to show|Nothing in/)).toBeNull();
      // Nothing to sort or qualify: no line and no Sort, as under an unranked opponent.
      expect(screen.queryByRole('combobox', { name: 'Sort' })).toBeNull();
      expect(screen.queryByText(/Import your collection/)).toBeNull();
      expect(screen.queryByText("PvPoke's movesets; your log doesn't apply")).toBeNull();
      // It does not ask again on its own.
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
      expect(counters).toHaveBeenCalledTimes(1);
      fail = false;
      await act(async () => {
        fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
      });
      await waitFor(() => expect(counters).toHaveBeenCalledTimes(2));
      await rowsIn();
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  it('the description paragraphs and Back to the whole meta are gone', async () => {
    await boot();
    await go({ screen: 'counters', vs: 'azumarill' });
    await rowsIn();
    expect(screen.queryByText(/Back to the whole meta/)).toBeNull();
    expect(screen.queryByText(/wins at least one of the three shield scenarios/)).toBeNull();
    expect(screen.queryByText(/Who Beats/)).toBeNull();
    await go({ screen: 'counters' });
    await rowsIn();
    expect(screen.queryByText(/Under the radar means/)).toBeNull();
    expect(screen.queryByText(/weighted by how often you meet each opponent/)).toBeNull();
  });
});
