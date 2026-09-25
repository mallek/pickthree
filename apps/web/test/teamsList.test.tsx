import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Recommendation, TeamRecommendation } from '@pickthree/engine';
import { facingSummary, Teams } from '../src/screens/Teams.tsx';
import { AppProvider, hashFor, useActions, useAppState, type AppState } from '../src/state/store.tsx';
import { resetDbForTests, storage } from '../src/storage/db.ts';
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

  it('shows every team as a row, the first one open, in the order the engine sent', async () => {
    await mount(
      hostWith([
        makeTeam({ id: 'a', species: ['medicham', 'azumarill', 'galvantula'] }),
        makeTeam({ id: 'b', species: ['mimikyu', 'melmetal', 'greninja'] }),
      ]),
    );
    await screen.findAllByText(/Stardust/);
    const toggles = screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-expanded'));
    expect(toggles[0]).toHaveAttribute('aria-expanded', 'true');
    expect(toggles[1]).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens and closes a row on tap', async () => {
    await mount(hostWith([makeTeam({ id: 'a' }), makeTeam({ id: 'b', species: ['mimikyu', 'melmetal', 'greninja'] })]));
    await screen.findAllByText(/Stardust/);
    const second = screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-expanded'))[1]!;
    fireEvent.click(second);
    expect(second).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(second);
    expect(second).toHaveAttribute('aria-expanded', 'false');
  });

  it('View analysis and Edit team go to their places without toggling the row', async () => {
    await mount(hostWith([makeTeam({ id: 'a' })]));
    const view = await screen.findByRole('link', { name: 'View analysis' });
    expect(view).toHaveAttribute('href', hashFor({ screen: 'team', id: 'a' }));
    const toggle = screen.getAllByRole('button').find((b) => b.hasAttribute('aria-expanded'))!;
    fireEvent.click(screen.getByRole('button', { name: 'Edit team' }));
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(latest?.state.route.screen).toBe('build'));
  });

  it('shows the progress card under 15 logged battles', async () => {
    await mount(hostWith([makeTeam({ id: 'a' })]));
    expect(await screen.findByRole('progressbar', { name: 'Make these teams personal' })).toBeInTheDocument();
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
