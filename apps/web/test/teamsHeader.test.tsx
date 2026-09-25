import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { League, Recommendation } from '@pickthree/engine';
import { filterCount, Teams } from '../src/screens/Teams.tsx';
import { AppProvider, useActions, useAppState, type AppState } from '../src/state/store.tsx';
import { DEFAULT_SETTINGS, resetDbForTests, storage } from '../src/storage/db.ts';
import { emptyLayoutValue } from '../src/format.ts';
import { resetCommunityMetaCache } from '../src/communityMeta.ts';
import { EMPTY_COUNTERS, fakeHost, GREAT } from './fakeHost.ts';

let latest: { state: AppState; actions: ReturnType<typeof useActions> } | null = null;
function Probe() {
  latest = { state: useAppState(), actions: useActions() };
  return null;
}

const SPECIAL: League = {
  id: 'special1',
  title: 'Special Cup',
  short: 'Special',
  cp: 1500,
  cup: 'special1',
  meta: 'special1',
  kind: 'special',
  minCp: 1410,
  include: [],
  exclude: [],
  metaSize: 0,
};

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

/** A fakeHost that also lists a special-cup league with no community data. */
function fakeHostWithSpecial(overrides: Parameters<typeof fakeHost>[0] = {}) {
  const host = fakeHost(overrides);
  const originalReady = host.ready;
  host.ready = (async () => {
    const r = await originalReady();
    return { ...r, leagues: [GREAT, SPECIAL] };
  }) as typeof host.ready;
  return host;
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
    expect(latest?.state.data).not.toBeNull();
    expect(latest?.state.collection).not.toBeNull();
  });
}

describe('filterCount', () => {
  it('counts the moved filters, a non-empty exclude list and a non-Any team style', () => {
    expect(filterCount(DEFAULT_SETTINGS)).toBe(0);
    expect(
      filterCount({
        ...DEFAULT_SETTINGS,
        filters: { ...DEFAULT_SETTINGS.filters, noXl: true, style: 'abb' },
        excludedSpecimenIds: ['x'],
      }),
    ).toBe(3);
  });

  it('counts a window other than This meta only while a community source is picked', () => {
    const on = (source: 'ladder' | 'tournament' | 'all' | 'log' | 'prior', window: 'meta' | '30' | '7') =>
      filterCount({ ...DEFAULT_SETTINGS, facing: { source, window } });
    expect(on('ladder', '7')).toBe(1);
    expect(on('tournament', '30')).toBe(1);
    expect(on('all', '7')).toBe(1);
    expect(on('ladder', 'meta')).toBe(0);
    // Window does not apply to PvPoke or Your log, so a leftover choice does not count.
    expect(on('log', '7')).toBe(0);
    expect(on('prior', '30')).toBe(0);
  });
});

describe('Teams header', () => {
  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    resetCommunityMetaCache();
    window.location.hash = '';
    latest = null;
    await saveEmptyCollection();
  });

  it('shows one row: the Source select and the filter icon, no Window select and no weighting line', async () => {
    await mount(fakeHost());
    expect(screen.getByLabelText('Source')).toBeInTheDocument();
    expect(screen.queryByLabelText('Window')).toBeNull();
    expect(screen.queryByText(/weighting/)).toBeNull();
    const filters = screen.getByRole('button', { name: 'Filters' });
    expect(filters).toHaveClass('ui-filter-icon');
    expect(filters.closest('.teams-controls')).toBe(
      screen.getByLabelText('Source').closest('.teams-controls'),
    );
    expect(screen.queryByText(/Team style:/)).toBeNull();
  });

  it('names the filter count on the icon and opens the Filters sheet', async () => {
    await storage.saveSettings({
      ...DEFAULT_SETTINGS,
      filters: { ...DEFAULT_SETTINGS.filters, noXl: true },
    });
    await mount(fakeHost());
    const filters = await screen.findByRole('button', { name: 'Filters, 1 on' });
    expect(latest!.state.filtersOpen).toBe(false);
    fireEvent.click(filters);
    expect(latest!.state.filtersOpen).toBe(true);
  });

  it('does not grey community sources or show the no-data line before the league list is known', async () => {
    // A cold start with a saved collection routes straight to Teams while boot is still loading
    // (store.tsx), so the league list (s.data) is null for that stretch. A host whose ready()
    // never resolves holds the app in exactly that state.
    const host = fakeHost({ ready: () => new Promise<never>(() => {}) });
    render(
      <AppProvider host={host}>
        <Probe />
        <Teams />
      </AppProvider>,
    );
    await waitFor(() => expect(latest?.state.collection).not.toBeNull());
    expect(latest?.state.data).toBeNull();
    expect(screen.queryByText('No community data for this league')).toBeNull();
    const gbl = screen.getByRole('option', { name: /GBL/ }) as HTMLOptionElement;
    expect(gbl.disabled).toBe(false);
  });

  it('greys the community sources for a league with no community data', async () => {
    const host = fakeHostWithSpecial();
    await mount(host);
    await act(async () => {
      latest!.actions.updateSettings((cur) => ({ ...cur, league: 'special1' }));
    });
    const gbl = (await screen.findByRole('option', { name: /GBL/ })) as HTMLOptionElement;
    expect(gbl.disabled).toBe(true);
    expect(screen.getByText('No community data for this league')).toBeInTheDocument();
  });

  it('labels a community source that fell back', async () => {
    await storage.saveSettings({
      ...DEFAULT_SETTINGS,
      facing: { source: 'ladder', window: 'meta' },
    });
    const host = fakeHost({
      recommend: async (): Promise<Recommendation> => ({
        teams: [],
        assumptions: {
          league: 'great',
          leagueTitle: 'Great League',
          cpCap: 1500,
          levelCap: 50,
          shields: { lead: '', switch: '', closer: '' },
          ivs: '',
          metaName: '',
          metaSize: 3,
          facing: 'PvPoke weights (community data unavailable)',
          source: 'prior',
          pvpokeCommit: 'abc',
          pvpokeDate: '2026-09-10',
          gamemasterTimestamp: '',
          dataBuiltAt: '',
        },
        stats: {
          specimens: 0,
          eligibleBuilds: 0,
          poolSize: 0,
          triosScored: 0,
          finalists: 0,
          ms: 0,
          dropped: [],
        },
      }),
      counters: async () => EMPTY_COUNTERS,
    });
    await mount(host);
    await waitFor(() => expect(latest?.state.recommendation).not.toBeNull());
    expect(screen.getByRole('option', { name: 'GBL (offline)' })).toBeInTheDocument();
  });
});

describe('Teams without a collection', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    resetCommunityMetaCache();
    window.location.hash = '';
    latest = null;
  });

  it('keeps the page title, the meta link and Settings above the ways in, with no league or controls', async () => {
    render(
      <AppProvider host={fakeHost()}>
        <Probe />
        <Teams />
      </AppProvider>,
    );
    await waitFor(() => {
      expect(latest?.state.boot).toBe('ready');
      expect(latest?.state.settingsLoaded).toBe(true);
    });
    expect(latest?.state.collection).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Your Teams' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /meta\.pick3\.gg/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import a CSV' })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'League' })).toBeNull();
    expect(screen.queryByLabelText('Source')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Filters/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(latest!.state.sheetOpen).toBe(true);
  });
});
