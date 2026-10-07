import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import type { BattleSet, TeamAnalysis } from '@pickthree/engine';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetMetaGroupsForTests } from '../src/achievements/metaGroups.ts';
import { useAchievements } from '../src/achievements/AchievementsProvider.tsx';
import { AppProvider, useActions, useAppState } from '../src/state/store.tsx';
import { resetDbForTests, storage } from '../src/storage/db.ts';
import { fakeHost } from './fakeHost.ts';

let actions: ReturnType<typeof useActions> | null = null;
let ready = false;
const handlers = new Set<unknown>();
const views = new Set<unknown>();

function Probe() {
  const a = useAchievements();
  handlers.add(a.dismissToast);
  handlers.add(a.closeReveal);
  views.add(a);
  actions = useActions();
  const s = useAppState();
  ready = s.leagueInfo !== null && s.setsLoaded;
  return (
    <div>
      <span data-testid="count">{a.earnedCount}</span>
      <span data-testid="toast">{a.toast?.kind === 'earned' ? a.toast.name : ''}</span>
      <span data-testid="reveal">{a.reveal?.title ?? ''}</span>
    </div>
  );
}

const oneBattle: BattleSet = {
  id: 's1',
  league: 'great',
  startedAt: new Date(2026, 8, 20, 12).toISOString(),
  team: { species: ['tinkaton', 'azumarill', 'clodsire'] },
  battles: [
    {
      id: 'b1',
      at: new Date(2026, 8, 20, 12).toISOString(),
      opponents: [],
      result: 'win',
      tanked: false,
    },
  ],
  closed: false,
};

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  resetMetaGroupsForTests();
  actions = null;
  ready = false;
  handlers.clear();
  views.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('[]', { status: 404 })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AchievementsProvider', () => {
  it('earns First battle once from an existing log, saved before it is announced', async () => {
    await storage.saveSet(oneBattle);
    render(
      <AppProvider host={fakeHost()}>
        <Probe />
      </AppProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('toast').textContent).toBe('First battle'));
    const stored = await storage.loadAchievements();
    expect(stored.earned.map((e) => e.id)).toEqual(['first-battle']);
  });

  it('keeps dismissToast and closeReveal the same function as the view recomputes', async () => {
    await storage.saveSet(oneBattle);
    render(
      <AppProvider host={fakeHost()}>
        <Probe />
      </AppProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('toast').textContent).toBe('First battle'));
    // The view recomputed as the record, facts and queue landed; the handlers did not move.
    expect(views.size).toBeGreaterThan(1);
    expect(handlers.size).toBe(2);
  });

  it('never rolls the same achievement twice under repeated evaluations', async () => {
    await storage.saveSet(oneBattle);
    // StrictMode runs every effect twice: two evaluations queue back to back.
    const { rerender } = render(
      <StrictMode>
        <AppProvider host={fakeHost()}>
          <Probe />
        </AppProvider>
      </StrictMode>,
    );
    rerender(
      <StrictMode>
        <AppProvider host={fakeHost()}>
          <Probe />
        </AppProvider>
      </StrictMode>,
    );
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect((await storage.loadAchievements()).earned).toHaveLength(1);
  });

  it('shows one reveal, not toasts, when two or more arrive at once', async () => {
    const five = {
      ...oneBattle,
      battles: Array.from({ length: 5 }, (_, i) => ({
        id: `b${i}`,
        at: new Date(2026, 8, 20, 12, i).toISOString(),
        opponents: [],
        result: 'win' as const,
        tanked: false,
      })),
      closed: true,
    };
    await storage.saveSet(five);
    render(
      <AppProvider host={fakeHost()}>
        <Probe />
      </AppProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('reveal').textContent).toBe('You have earned 2 already'),
    );
    expect(screen.getByTestId('toast').textContent).toBe('');
    expect((await storage.loadAchievements()).earned.map((e) => e.id)).toEqual([
      'first-battle',
      'full-set',
    ]);
  });

  it('treats a missing meta file as no group, with no error', async () => {
    await storage.saveSet(oneBattle);
    render(
      <AppProvider host={fakeHost()}>
        <Probe />
      </AppProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));
    const ids = (await storage.loadAchievements()).earned.map((e) => e.id);
    expect(ids).not.toContain('meta-player');
  });

  it('earns Meta player when the set is all in the league meta group', async () => {
    await storage.saveSet(oneBattle);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input) === '/data/meta/great.json'
          ? new Response(
              JSON.stringify([
                { speciesId: 'tinkaton' },
                { speciesId: 'azumarill' },
                { speciesId: 'clodsire' },
              ]),
              { status: 200 },
            )
          : new Response('[]', { status: 404 }),
      ),
    );
    render(
      <AppProvider host={fakeHost()}>
        <Probe />
      </AppProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2'));
    expect((await storage.loadAchievements()).earned.map((e) => e.id)).toEqual([
      'first-battle',
      'meta-player',
    ]);
  });

  it('keeps an imported record that lands while an evaluation is in flight', async () => {
    await storage.saveSet(oneBattle);
    // Hold the meta group read open, so the evaluation is mid-flight when the import merges.
    let release: (() => void) | null = null;
    const fetchMock = vi.fn(
      (input: RequestInfo | URL) =>
        new Promise<Response>((resolve) => {
          if (String(input) === '/data/meta/great.json') {
            release = () => resolve(new Response('[]', { status: 404 }));
          } else {
            resolve(new Response('[]', { status: 404 }));
          }
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(
      <AppProvider host={fakeHost()}>
        <Probe />
      </AppProvider>,
    );
    await waitFor(() => expect(release).not.toBeNull());
    await storage.mergeAchievements({
      earned: [{ id: 'cup-runner', earnedAt: '2026-09-01T00:00:00Z', species: 'mew', shiny: true }],
      marks: [],
    });
    await act(async () => {
      release!();
    });
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2'));
    const stored = await storage.loadAchievements();
    expect(stored.earned.map((e) => e.id)).toEqual(['cup-runner', 'first-battle']);
    expect(stored.earned[0]).toMatchObject({ species: 'mew', shiny: true });
    // The phone already held one, so the new one is a toast, not the welcome reveal.
    expect(screen.getByTestId('toast').textContent).toBe('First battle');
  });

  it('a finished analysis earns Team builder and keeps the mark', async () => {
    const analysis = {
      team: {
        slots: [
          { candidate: { build: { specimenId: 'species:tinkaton', speciesId: 'tinkaton' } } },
          { candidate: { build: { specimenId: 'species:azumarill', speciesId: 'azumarill' } } },
          { candidate: { build: { specimenId: 'species:clodsire', speciesId: 'clodsire' } } },
        ],
      },
      orders: [],
      hypothetical: [],
      chosenMoves: [],
      unranked: [],
      ms: 1,
    } as unknown as TeamAnalysis;
    render(
      <AppProvider host={fakeHost({ analyze: vi.fn(async () => analysis) })}>
        <Probe />
      </AppProvider>,
    );
    await waitFor(() => expect(ready).toBe(true));
    await act(async () => {
      actions!.setPicks(
        [
          { kind: 'species', id: 'tinkaton' },
          { kind: 'species', id: 'azumarill' },
          { kind: 'species', id: 'clodsire' },
        ],
        false,
      );
    });
    let ok = false;
    await act(async () => {
      ok = await actions!.findOrder();
    });
    expect(ok).toBe(true);
    await waitFor(() => expect(screen.getByTestId('toast').textContent).toBe('Team builder'));
    const stored = await storage.loadAchievements();
    expect(stored.earned.map((e) => e.id)).toEqual(['team-builder']);
    expect(stored.marks).toEqual(['analyzed']);
  });

  it('outside the provider the view is empty and never throws', () => {
    function Bare() {
      const a = useAchievements();
      return <span data-testid="bare">{`${a.loaded}|${a.earnedCount}|${a.total}`}</span>;
    }
    render(<Bare />);
    expect(screen.getByTestId('bare').textContent).toBe('false|0|11');
  });
});
