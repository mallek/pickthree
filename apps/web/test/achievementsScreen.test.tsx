import 'fake-indexeddb/auto';
import { ACHIEVEMENTS, statusAll, type AchievementFacts } from '@pickthree/engine';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AchievementsView } from '../src/achievements/AchievementsProvider.tsx';
import { Achievements } from '../src/screens/Achievements.tsx';
import { AppProvider, useActions, useAppState, type AppState } from '../src/state/store.tsx';
import { resetDbForTests } from '../src/storage/db.ts';
import { fakeHost } from './fakeHost.ts';

function facts(over: Partial<AchievementFacts> = {}): AchievementFacts {
  return {
    hasCollection: false,
    marks: new Set(),
    countedBattles: 0,
    distinctDays: 0,
    fullSet: false,
    metaPlayer: false,
    cupRunner: false,
    seasonStreak: { best: 0, current: 0 },
    yourMetaStreak: { best: 0, current: 0 },
    bestLeagueSeasonBattles: 0,
    ...over,
  };
}

const EARNED = [
  { id: 'first-battle', species: 'bulbasaur', shiny: false, earnedAt: '2026-09-16T12:00:00Z' },
  { id: 'seasons-2', species: 'lapras', shiny: true, earnedAt: '2026-09-30T12:00:00Z' },
];

function viewFor(earned = EARNED): AchievementsView {
  const statuses = statusAll(
    facts({ distinctDays: 1, seasonStreak: { best: 1, current: 1 } }),
    new Set(earned.map((e) => e.id)),
  );
  return {
    loaded: true,
    record: { earned, marks: [] },
    statuses,
    earnedCount: earned.filter((e) => ACHIEVEMENTS.some((d) => d.id === e.id)).length,
    total: ACHIEVEMENTS.length,
    shinyCount: earned.filter((e) => e.shiny).length,
    nudge: 'Next: Ten days. Log battles on 9 more days.',
    toast: null,
    reveal: null,
    dismissToast: vi.fn(),
    closeReveal: vi.fn(),
  };
}

const view: { current: AchievementsView } = { current: viewFor() };

// The real provider is swapped for a pass-through so each test chooses what the page sees.
vi.mock('../src/achievements/AchievementsProvider.tsx', () => ({
  AchievementsProvider: ({ children }: { children: ReactNode }) => children,
  useAchievements: () => view.current,
}));

/** Rendered the way App renders it: only on its own route, which the boot settles. */
function Gate() {
  return useAppState().route.screen === 'achievements' ? <Achievements /> : null;
}

let latest: { state: AppState; actions: ReturnType<typeof useActions> } | null = null;
function Probe() {
  latest = { state: useAppState(), actions: useActions() };
  return null;
}

function host() {
  const base = fakeHost();
  return fakeHost({
    ready: vi.fn(async () => {
      const r = await base.ready();
      return {
        ...r,
        species: {
          ...r.species,
          bulbasaur: {
            name: 'Bulbasaur',
            types: ['grass', 'poison'],
            familyId: 'bulbasaur',
            dex: 1,
          },
          lapras: { name: 'Lapras', types: ['water', 'ice'], familyId: 'lapras', dex: 131 },
        },
      };
    }),
  });
}

async function mount() {
  latest = null;
  render(
    <AppProvider host={host()}>
      <Probe />
      <Gate />
    </AppProvider>,
  );
  await waitFor(() => {
    expect(latest?.state.boot).toBe('ready');
    expect(latest?.state.settingsLoaded).toBe(true);
  });
}

const scrollIntoView = vi.fn();

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  window.location.hash = '#/achievements';
  view.current = viewFor();
  scrollIntoView.mockReset();
  Element.prototype.scrollIntoView = scrollIntoView;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('Achievements page', () => {
  it('shows the Earned card with the count, the shiny count and the nudge', async () => {
    await mount();
    expect(screen.getByText('Earned')).toBeInTheDocument();
    expect(
      screen.getByText('1 shiny · Next: Ten days. Log battles on 9 more days.'),
    ).toBeInTheDocument();
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/Earned2 \/ 11/);
  });

  it('draws 151 dex slots: two earned tokens and the rest as not earned yet', async () => {
    await mount();
    const dex = document.querySelector('.ach-dex') as HTMLElement;
    expect(dex.children).toHaveLength(151);
    expect(within(dex).getAllByRole('img', { name: 'Not earned yet' })).toHaveLength(149);
    expect(within(dex).getAllByRole('img', { name: 'Shiny' })).toHaveLength(1);
    expect(screen.getByText('2 of 151')).toBeInTheDocument();
  });

  it('shows the dex number in an unearned slot when pictures are off', async () => {
    await mount();
    await act(async () => {
      latest!.actions.updateSettings({ sprites: false });
    });
    await waitFor(() => expect(screen.getByText('151')).toBeInTheDocument());
    expect(screen.getByText('150')).toBeInTheDocument();
  });

  it('lists a locked row with its how-to and progress and an earned row with its date', async () => {
    await mount();
    const locked = document.getElementById('ach-seasons-3') as HTMLElement;
    expect(within(locked).getByText('Three-peat')).toBeInTheDocument();
    expect(within(locked).getByText('Log in 3 seasons in a row')).toBeInTheDocument();
    expect(within(locked).getByText('1 of 3')).toBeInTheDocument();
    expect(locked.querySelector('.faced-bar')).not.toBeNull();
    const earned = document.getElementById('ach-seasons-2') as HTMLElement;
    expect(within(earned).getByText(/^Shiny Lapras · Sep 30$/)).toBeInTheDocument();
    const plain = document.getElementById('ach-first-battle') as HTMLElement;
    expect(within(plain).getByText(/^Bulbasaur · Sep 16$/)).toBeInTheDocument();
  });

  it('scrolls the linked row into view once', async () => {
    window.location.hash = '#/achievements?row=days-10';
    await mount();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(document.getElementById('ach-days-10'));
  });

  it('does not scroll when the link names no row', async () => {
    await mount();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('has no Top group while no top achievement exists, and keeps the others in order', async () => {
    await mount();
    expect(screen.queryByText('Top', { selector: 'b' })).toBeNull();
    const heads = Array.from(document.querySelectorAll('.ym-list-head b')).map(
      (b) => b.textContent,
    );
    expect(heads).toEqual(['Easy', 'Mid', 'Hard', 'Elite']);
  });

  it('lights the Pokemon of an earned id that is not in the list, with no row for it', async () => {
    view.current = viewFor([
      ...EARNED,
      { id: 'retired-one', species: 'pidgey', shiny: false, earnedAt: '2026-09-01T00:00:00Z' },
    ]);
    await mount();
    expect(screen.getByText('3 of 151')).toBeInTheDocument();
    expect(document.getElementById('ach-retired-one')).toBeNull();
  });

  it('says nothing about being done before the log is read', async () => {
    view.current = {
      ...viewFor([]),
      loaded: false,
      statuses: [],
      earnedCount: 0,
      shinyCount: 0,
      nudge: null,
    };
    await mount();
    expect(screen.queryByText(/All earned/)).toBeNull();
    expect(document.body.textContent).toMatch(/Earned0 \/ 11/);
  });

  it('says All earned only when every achievement is earned', async () => {
    view.current = {
      ...viewFor(
        ACHIEVEMENTS.map((d) => ({
          id: d.id,
          species: 'bulbasaur',
          shiny: false,
          earnedAt: '2026-09-16T12:00:00Z',
        })),
      ),
      nudge: null,
    };
    await mount();
    expect(screen.getByText('All earned.')).toBeInTheDocument();
  });

  it('shows the shiny record when two earned records share a species', async () => {
    view.current = viewFor([
      { id: 'first-battle', species: 'lapras', shiny: true, earnedAt: '2026-09-16T12:00:00Z' },
      { id: 'seasons-2', species: 'lapras', shiny: false, earnedAt: '2026-09-30T12:00:00Z' },
    ]);
    await mount();
    expect(screen.getByText('1 of 151')).toBeInTheDocument();
    const dex = document.querySelector('.ach-dex') as HTMLElement;
    expect(within(dex).getAllByRole('img', { name: 'Shiny' })).toHaveLength(1);
  });
});
