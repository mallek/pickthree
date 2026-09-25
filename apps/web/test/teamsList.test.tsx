import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Recommendation, TeamRecommendation } from '@pickthree/engine';
import { facingSummary, Teams } from '../src/screens/Teams.tsx';
import { AppProvider, hashFor, useActions, useAppState, type AppState } from '../src/state/store.tsx';
import { DEFAULT_SETTINGS, resetDbForTests, storage } from '../src/storage/db.ts';
import { emptyLayoutValue } from '../src/format.ts';
import { resetCommunityMetaCache } from '../src/communityMeta.ts';
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

function hostWith(teams: TeamRecommendation[]) {
  const host = fakeHost();
  const base = host.recommend as unknown as () => Promise<Recommendation>;
  host.recommend = vi.fn(async () => ({ ...(await base()), teams })) as typeof host.recommend;
  return host;
}

/** The row toggles only: an open row's body holds Term buttons that also carry aria-expanded. */
function rowHeads(): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>('.ui-expand-head')];
}

/** A host whose every recommend run fails, as a worker error would. */
function failingHost() {
  // recordError's device summary reads matchMedia, which jsdom does not implement.
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
  const host = fakeHost();
  host.recommend = vi.fn(async () => {
    throw new Error('The league data did not load.');
  }) as unknown as typeof host.recommend;
  return host;
}

function calls(host: ReturnType<typeof fakeHost>): number {
  return (host.recommend as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
}

async function mount(host: ReturnType<typeof fakeHost>) {
  render(
    <AppProvider host={host}>
      <Probe />
      <Teams />
    </AppProvider>,
  );
  await waitFor(() => {
    expect(latest?.state.boot).toBe('ready');
    expect(latest?.state.settingsLoaded).toBe(true);
    expect(latest?.state.collection).not.toBeNull();
  });
}

describe('Teams list', () => {
  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    resetCommunityMetaCache();
    latest = null;
    await saveEmptyCollection();
  });

  // A failed assertion must not leave a stubbed global (matchMedia, fetch) to later tests.
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows every team as a row, the first one open, in the order the engine sent', async () => {
    await mount(
      hostWith([
        makeTeam({ id: 'a', species: ['medicham', 'azumarill', 'galvantula'] }),
        makeTeam({ id: 'b', species: ['mimikyu', 'melmetal', 'greninja'] }),
      ]),
    );
    await screen.findAllByText(/Stardust/);
    const toggles = rowHeads();
    expect(toggles[0]).toHaveAttribute('aria-expanded', 'true');
    expect(toggles[1]).toHaveAttribute('aria-expanded', 'false');
    const names = screen.getAllByTestId('team-summary-names').map((el) => el.textContent);
    expect(names[0]).toMatch(/Medicham/);
    expect(names[1]).toMatch(/mimikyu/i);
  });

  it('opens and closes a row on tap', async () => {
    await mount(hostWith([makeTeam({ id: 'a' }), makeTeam({ id: 'b', species: ['mimikyu', 'melmetal', 'greninja'] })]));
    await screen.findAllByText(/Stardust/);
    const second = rowHeads()[1]!;
    fireEvent.click(second);
    expect(second).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(second);
    expect(second).toHaveAttribute('aria-expanded', 'false');
  });

  it('reopens only the first row when a fresh recommendation replaces the list', async () => {
    const host = hostWith([
      makeTeam({ id: 'a' }),
      makeTeam({ id: 'b', species: ['mimikyu', 'melmetal', 'greninja'] }),
    ]);
    await mount(host);
    await screen.findAllByText(/Stardust/);
    const toggles = rowHeads;
    fireEvent.click(toggles()[0]!);
    expect(toggles()[0]).toHaveAttribute('aria-expanded', 'false');
    const calls = (host.recommend as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
    await act(async () => {
      latest!.actions.updateSettings((cur) => ({
        ...cur,
        facing: { ...cur.facing, source: 'prior' },
      }));
    });
    await waitFor(() =>
      expect((host.recommend as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(
        calls,
      ),
    );
    await waitFor(() => expect(toggles()[0]).toHaveAttribute('aria-expanded', 'true'));
  });

  it('keeps the rows the player opened and closed across leaving Teams and coming back', async () => {
    let show: (on: boolean) => void = () => undefined;
    function Toggle() {
      const [on, setOn] = useState(true);
      show = setOn;
      return on ? <Teams /> : null;
    }
    render(
      <AppProvider
        host={hostWith([
          makeTeam({ id: 'a' }),
          makeTeam({ id: 'b', species: ['mimikyu', 'melmetal', 'greninja'] }),
        ])}
      >
        <Probe />
        <Toggle />
      </AppProvider>,
    );
    await waitFor(() => expect(latest?.state.recommendation).not.toBeNull());
    await screen.findAllByText(/Stardust/);
    const toggles = rowHeads;
    fireEvent.click(toggles()[1]!);
    fireEvent.click(toggles()[0]!);
    expect(toggles()[0]).toHaveAttribute('aria-expanded', 'false');
    expect(toggles()[1]).toHaveAttribute('aria-expanded', 'true');
    act(() => show(false));
    expect(screen.queryAllByTestId('team-summary-names')).toHaveLength(0);
    act(() => show(true));
    expect(toggles()[0]).toHaveAttribute('aria-expanded', 'false');
    expect(toggles()[1]).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps a closed first row closed while a new run is pending', async () => {
    const host = hostWith([
      makeTeam({ id: 'a' }),
      makeTeam({ id: 'b', species: ['mimikyu', 'melmetal', 'greninja'] }),
    ]);
    await mount(host);
    await screen.findAllByText(/Stardust/);
    const toggles = rowHeads;
    fireEvent.click(toggles()[0]!);
    expect(toggles()[0]).toHaveAttribute('aria-expanded', 'false');
    // The next run never finishes, so the old list stays on screen under the pending run.
    host.recommend = vi.fn(() => new Promise<never>(() => {})) as unknown as typeof host.recommend;
    await act(async () => {
      latest!.actions.updateSettings((cur) => ({
        ...cur,
        facing: { ...cur.facing, source: 'prior' },
      }));
    });
    await waitFor(() => expect(latest?.state.recommending).toBe(true));
    expect(toggles()[0]).toHaveAttribute('aria-expanded', 'false');
  });

  it('View analysis and Edit team go to their places without toggling the row', async () => {
    await mount(hostWith([makeTeam({ id: 'a' })]));
    const view = await screen.findByRole('link', { name: 'View analysis' });
    expect(view).toHaveAttribute('href', hashFor({ screen: 'team', id: 'a' }));
    const toggle = rowHeads()[0]!;
    fireEvent.click(screen.getByRole('button', { name: 'Edit team' }));
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(latest?.state.route.screen).toBe('build'));
  });

  it('shows the progress card under 15 logged battles', async () => {
    await mount(hostWith([makeTeam({ id: 'a' })]));
    expect(await screen.findByRole('progressbar', { name: 'Make these teams personal' })).toBeInTheDocument();
  });

  it('shows the contribution line on the progress card when battle sharing is on', async () => {
    await mount(hostWith([makeTeam({ id: 'a' })]));
    await screen.findByRole('progressbar', { name: 'Make these teams personal' });
    expect(
      screen.getByText('Anonymous logs also improve the live meta.'),
    ).toBeInTheDocument();
  });

  it('hides the contribution line on the progress card when battle sharing is off', async () => {
    await storage.saveSettings({ ...DEFAULT_SETTINGS, share: { enabled: false } });
    await mount(hostWith([makeTeam({ id: 'a' })]));
    await screen.findByRole('progressbar', { name: 'Make these teams personal' });
    expect(screen.queryByText('Anonymous logs also improve the live meta.')).toBeNull();
  });

  it('hides the progress card at 15 or more logged battles', async () => {
    await storage.saveSet({
      id: 's1',
      league: 'great',
      startedAt: '2026-09-15T10:00:00Z',
      team: { species: ['tinkaton', 'azumarill', 'clodsire'] },
      battles: Array.from({ length: 15 }, (_, i) => ({
        id: `b${i}`,
        at: `2026-09-15T10:${String(i).padStart(2, '0')}:00Z`,
        opponents: ['medicham'],
        result: 'win' as const,
        tanked: false,
      })),
      closed: false,
    });
    await mount(hostWith([makeTeam({ id: 'a' })]));
    await screen.findAllByText(/Stardust/);
    expect(screen.queryByRole('progressbar', { name: 'Make these teams personal' })).toBeNull();
  });

  it('shows the empty state with a Filters action when no team fits', async () => {
    await mount(hostWith([]));
    expect(await screen.findByText(/No team fits these filters/)).toBeInTheDocument();
    const empty = screen.getByText(/No team fits these filters/).closest('.ui-empty') as HTMLElement;
    expect(within(empty).getByRole('button', { name: /^Filters/ })).toBeInTheDocument();
  });

  it('shows the error card with its message and a Try again that runs again', async () => {
    const host = failingHost();
    await mount(host);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveClass('ui-error');
    expect(alert).toHaveTextContent('The league data did not load.');
    expect(rowHeads()).toHaveLength(0);
    expect(calls(host)).toBe(1);
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(calls(host)).toBe(2));
  });

  it('runs again when a setting changes after a failed run', async () => {
    const host = failingHost();
    await mount(host);
    await screen.findByRole('alert');
    expect(calls(host)).toBe(1);
    await act(async () => {
      latest!.actions.updateSettings((cur) => ({
        ...cur,
        facing: { ...cur.facing, source: 'prior' },
      }));
    });
    await waitFor(() => expect(calls(host)).toBe(2));
  });

  it('does not run again on its own after a failed run with unchanged settings', async () => {
    const host = failingHost();
    await mount(host);
    await screen.findByRole('alert');
    await new Promise((r) => setTimeout(r, 100));
    expect(calls(host)).toBe(1);
  });

  it('with a community source, a failed run is followed by at most one more, not a loop', async () => {
    // The community read lands after rec-start and changes s.community, so the key the failed
    // run started under goes stale once. The follow-up run starts under the final key, and its
    // failure leaves nothing stale.
    await storage.saveSettings({ ...DEFAULT_SETTINGS, facing: { source: 'ladder', window: 'meta' } });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({
            ok: true,
            json: async () => ({
              battles: 400,
              devices: 12,
              species: [{ speciesId: 'medicham', sightings: 40 }],
              generatedAt: '2026-09-24T00:05:00.000Z',
            }),
          }) as unknown as Response,
      ),
    );
    const host = failingHost();
    await mount(host);
    await screen.findByRole('alert');
    await waitFor(() => expect(latest?.state.community).not.toBeNull());
    await new Promise((r) => setTimeout(r, 150));
    // Exactly one follow-up: the first run's key went stale when the read landed.
    expect(calls(host)).toBe(2);
    await new Promise((r) => setTimeout(r, 300));
    expect(calls(host)).toBe(2);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('keeps the footer counts', async () => {
    await mount(hostWith([makeTeam({ id: 'a' })]));
    expect(await screen.findByText(/combinations scored/)).toBeInTheDocument();
  });

  it('has one page title and no Pokémon count in the header', async () => {
    await mount(hostWith([makeTeam({ id: 'a' })]));
    expect(screen.getByRole('heading', { level: 2, name: 'Your Teams' })).toBeInTheDocument();
    expect(screen.queryByText(/^\d+ Pokémon$/)).toBeNull();
  });
});

describe('facingSummary', () => {
  it('describes what the list is weighted by', () => {
    expect(facingSummary({ source: 'prior', window: 'meta' }, 0, false)).toBe('PvPoke weighting');
    expect(facingSummary({ source: 'log', window: 'meta' }, 20, false)).toBe('Your log weighting');
    expect(facingSummary({ source: 'log', window: 'meta' }, 9, false)).toBe(
      'PvPoke weighting until your log reaches 15 battles',
    );
    expect(facingSummary({ source: 'ladder', window: '7' }, 0, false)).toBe(
      '7 days · GBL weighting',
    );
    expect(facingSummary({ source: 'all', window: 'meta' }, 0, true)).toBe(
      'PvPoke weighting (community data unavailable)',
    );
  });
});
