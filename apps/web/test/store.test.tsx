import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDbForTests, storage } from '../src/storage/db.ts';
import {
  AppProvider,
  hashFor,
  parseHash,
  useActions,
  useAppState,
  filterKey,
} from '../src/state/store.tsx';
import type { AppState } from '../src/state/store.tsx';
import type { TeamAnalysis } from '@pickthree/engine';
import { DEFAULT_SETTINGS } from '../src/storage/db.ts';
import { emptyLayoutValue } from '../src/format.ts';
import { resetCommunityMetaCache } from '../src/communityMeta.ts';
import { EMPTY_COUNTERS, fakeHost, GREAT } from './fakeHost.ts';

type Actions = ReturnType<typeof useActions>;
let latest: { state: AppState; actions: Actions } | null = null;

function Probe() {
  latest = { state: useAppState(), actions: useActions() };
  return null;
}

async function mount(host = fakeHost()) {
  render(
    <AppProvider host={host}>
      <Probe />
    </AppProvider>,
  );
  await waitFor(() => {
    expect(latest?.state.boot).toBe('ready');
    expect(latest?.state.leagueInfo).not.toBeNull();
    expect(latest?.state.setsLoaded).toBe(true);
  });
  return host;
}

describe('routes', () => {
  it('parses and prints the Your meta routes', () => {
    expect(parseHash('#/meta')).toEqual({ screen: 'meta' });
    expect(parseHash('#/meta/new')).toEqual({ screen: 'meta-new' });
    expect(parseHash('#/meta/log')).toEqual({ screen: 'meta-log' });
    expect(hashFor({ screen: 'meta' })).toBe('#/meta');
    expect(hashFor({ screen: 'meta-new' })).toBe('#/meta/new');
    expect(hashFor({ screen: 'meta-log' })).toBe('#/meta/log');
  });
  it('parses and prints a team link route', () => {
    const members = 'azumarill.BUBBLE.ICE_BEAM.PLAY_ROUGH+tinkaton+clodsire';
    expect(parseHash(`#/t/great/${members}`)).toEqual({
      screen: 'shared',
      league: 'great',
      members,
    });
    expect(hashFor({ screen: 'shared', league: 'great', members })).toBe(`#/t/great/${members}`);
    expect(parseHash('#/t/great')).toEqual({ screen: 'build' });
  });
  it('parses and prints the Counters route with a species to score against', () => {
    expect(parseHash('#/counters')).toEqual({ screen: 'counters' });
    expect(parseHash('#/counters?vs=medicham')).toEqual({ screen: 'counters', vs: 'medicham' });
    expect(hashFor({ screen: 'counters', vs: 'medicham' })).toBe('#/counters?vs=medicham');
    expect(hashFor({ screen: 'counters' })).toBe('#/counters');
  });
  it('reads a league out of a counters link from meta.pick3.gg', () => {
    expect(parseHash('#/counters?vs=azumarill&l=ultra')).toEqual({
      screen: 'counters',
      vs: 'azumarill',
      league: 'ultra',
    });
    expect(parseHash('#/counters?l=ultra')).toEqual({ screen: 'counters', league: 'ultra' });
  });
  it('ignores a counters league that is not an id', () => {
    expect(parseHash('#/counters?vs=azumarill&l=Ultra%20League')).toEqual({
      screen: 'counters',
      vs: 'azumarill',
    });
  });
  it('does not write the league back into the hash once the app is running', () => {
    expect(hashFor({ screen: 'counters', vs: 'azumarill', league: 'ultra' })).toBe(
      '#/counters?vs=azumarill',
    );
  });
  it('filterKey changes with the log version', () => {
    expect(filterKey(DEFAULT_SETTINGS, 1)).not.toBe(filterKey(DEFAULT_SETTINGS, 2));
  });
  it('filterKey keys on the source, and on the window and community read only for a community source', () => {
    const log = {
      ...DEFAULT_SETTINGS,
      facing: { source: 'log' as const, window: 'meta' as const },
    };
    const log7 = { ...DEFAULT_SETTINGS, facing: { source: 'log' as const, window: '7' as const } };
    const prior = { ...DEFAULT_SETTINGS, facing: { source: 'prior' as const } };
    const all = {
      ...DEFAULT_SETTINGS,
      facing: { source: 'all' as const, window: 'meta' as const },
    };
    const all7 = { ...DEFAULT_SETTINGS, facing: { source: 'all' as const, window: '7' as const } };
    const community = {
      key: 'great|a|b',
      payload: {
        summary: { battles: 1, devices: 1, species: [], tournament: null },
        generatedAt: 'g1',
      },
    };
    expect(filterKey(log)).not.toBe(filterKey(prior));
    expect(filterKey(log)).toBe(filterKey(log7));
    expect(filterKey(log, 0, community)).toBe(filterKey(log));
    expect(filterKey(all)).not.toBe(filterKey(all7));
    expect(filterKey(all, 0, community)).not.toBe(filterKey(all));
    expect(
      filterKey(all, 0, { ...community, payload: { ...community.payload, generatedAt: 'g2' } }),
    ).not.toBe(filterKey(all, 0, community));
  });
});

async function saveEmptyCollection(): Promise<void> {
  // A collection saved before boot is what makes the provider willing to run recommend.
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

describe('battle log actions', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    resetCommunityMetaCache();
    window.location.hash = '';
    latest = null;
  });

  it('starts a set, logs battles past five, and bumps the log version', async () => {
    await mount();
    const v0 = latest!.state.logVersion;
    await act(async () => {
      await latest!.actions.startSet({ species: ['tinkaton', 'azumarill', 'clodsire'] });
    });
    expect(latest!.state.sets).toHaveLength(1);
    expect(latest!.state.sets[0]?.closed).toBe(false);
    expect(latest!.state.logVersion).toBe(v0 + 1);

    await act(async () => {
      await latest!.actions.logBattle({ opponents: ['medicham'], result: 'win', tanked: false });
      await latest!.actions.logBattle({ opponents: [], result: null, tanked: true });
    });
    expect(latest!.state.sets[0]?.battles).toHaveLength(2);
    expect(latest!.state.sets[0]?.battles[1]?.tanked).toBe(true);
    expect(latest!.state.sets[0]?.battles[1]?.result).toBeNull();

    await act(async () => {
      for (let i = 0; i < 3; i++) {
        await latest!.actions.logBattle({ opponents: ['tinkaton'], result: 'loss', tanked: false });
      }
    });
    expect(latest!.state.sets[0]?.battles).toHaveLength(5);
    // Five is the game's set size, not a boundary here: only picking another team closes it.
    expect(latest!.state.sets[0]?.closed).toBe(false);
    expect((await storage.loadSets('great'))[0]?.closed).toBe(false);
  });

  it('raises a notice and resolves false when the phone refuses the write', async () => {
    await mount();
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
    await act(async () => {
      expect(
        await latest!.actions.startSet({ species: ['tinkaton', 'azumarill', 'clodsire'] }),
      ).toBe(true);
    });
    const spy = vi.spyOn(storage, 'saveSet').mockRejectedValue(new Error('QuotaExceededError'));
    try {
      let saved = true;
      await act(async () => {
        saved = await latest!.actions.logBattle({
          opponents: ['medicham'],
          result: 'win',
          tanked: false,
        });
      });
      expect(saved).toBe(false);
      expect(latest!.state.notice).toMatch(
        /Could not save that battle: this browser blocks storage/,
      );
      expect(latest!.state.sets[0]?.battles).toHaveLength(0);
      // Switching teams says what it was saving, and a full store is named as such.
      const quota = new Error('quota');
      quota.name = 'QuotaExceededError';
      spy.mockRejectedValue(quota);
      let started = true;
      await act(async () => {
        started = await latest!.actions.startSet({
          species: ['azumarill', 'tinkaton', 'clodsire'],
        });
      });
      expect(started).toBe(false);
      expect(latest!.state.notice).toMatch(
        /Could not save your team: storage on this phone is full/,
      );
    } finally {
      spy.mockRestore();
    }
    await act(async () => {
      latest!.actions.notify(null);
    });
    expect(latest!.state.notice).toBeNull();
    await act(async () => {
      expect(
        await latest!.actions.logBattle({ opponents: ['medicham'], result: 'win', tanked: false }),
      ).toBe(true);
    });
    expect(latest!.state.sets[0]?.battles).toHaveLength(1);
  });

  it('serializes two logBattle calls fired without awaiting between them', async () => {
    await mount();
    await act(async () => {
      await latest!.actions.startSet({ species: ['tinkaton', 'azumarill', 'clodsire'] });
    });
    await act(async () => {
      await Promise.all([
        latest!.actions.logBattle({ opponents: ['medicham'], result: 'win', tanked: false }),
        latest!.actions.logBattle({ opponents: ['tinkaton'], result: 'loss', tanked: false }),
      ]);
    });
    expect(latest!.state.sets[0]?.battles).toHaveLength(2);
    expect((await storage.loadSets('great'))[0]?.battles).toHaveLength(2);
  });

  it('endSet closes a partial set and startFresh marks the league', async () => {
    await mount();
    await act(async () => {
      await latest!.actions.startSet({ species: ['tinkaton', 'azumarill', 'clodsire'] });
      await latest!.actions.logBattle({ opponents: ['medicham'], result: 'win', tanked: false });
      await latest!.actions.endSet();
    });
    expect(latest!.state.sets[0]?.closed).toBe(true);
    await act(async () => {
      latest!.actions.startFresh();
    });
    expect(latest!.state.settings.yourMeta?.freshFrom?.great).toBeTruthy();
  });

  it("passes this season's battles and the switch to recommend and counters", async () => {
    // A collection saved before boot is what makes the provider willing to run recommend.
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
    const host = await mount();
    await waitFor(() => expect(latest?.state.collection).not.toBeNull());
    await act(async () => {
      await latest!.actions.startSet({ species: ['tinkaton', 'azumarill', 'clodsire'] });
      await latest!.actions.logBattle({ opponents: ['medicham'], result: 'win', tanked: false });
    });
    await act(async () => {
      await latest!.actions.runRecommend();
      await latest!.actions.loadCounters();
    });
    // An old save (no facing field, blend on) reads as Your meta.
    const recOpts = (host.recommend as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]![1] as {
      facing: { kind: string; battles: unknown[] };
    };
    expect(recOpts.facing.kind).toBe('log');
    expect(recOpts.facing.battles).toHaveLength(1);
    const cOpts = (host.counters as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]![1] as {
      facing: { kind: string; battles: unknown[] };
    };
    expect(cOpts.facing.kind).toBe('log');
    expect(cOpts.facing.battles).toHaveLength(1);
    expect(latest!.state.counters?.facing).toContain('PvPoke weights only');
  });

  it('passes the chosen facing to recommend and keys staleness on it', async () => {
    await saveEmptyCollection();
    const host = await mount();
    await waitFor(() => expect(latest?.state.collection).not.toBeNull());
    await act(async () => {
      latest!.actions.updateSettings((cur) => ({
        ...cur,
        facing: { source: 'prior', window: 'meta' },
      }));
    });
    await act(async () => {
      await latest!.actions.runRecommend();
    });
    const calls = (host.recommend as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const opts = calls.at(-1)![1] as { facing: unknown };
    expect(opts.facing).toEqual({ kind: 'prior' });
    expect(latest!.state.recommendedWith).toContain('"source":"prior"');
    expect(latest!.state.recommendedWith).toBe(
      filterKey(latest!.state.settings, latest!.state.logVersion, latest!.state.community),
    );
  });

  it('asks for community data once and falls back to PvPoke when it cannot be read', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
    try {
      await saveEmptyCollection();
      const host = await mount();
      await waitFor(() => expect(latest?.state.collection).not.toBeNull());
      await act(async () => {
        latest!.actions.updateSettings((cur) => ({
          ...cur,
          facing: { source: 'ladder', window: '7' },
        }));
      });
      await act(async () => {
        await latest!.actions.runRecommend();
      });
      const recCalls = (host.recommend as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      expect((recCalls.at(-1)![1] as { facing: unknown }).facing).toEqual({
        kind: 'prior',
        unavailable: 'ladder',
      });
      expect(latest!.state.community?.payload).toBeNull();
      expect(latest!.state.community?.key).toMatch(/^great\|/);
      expect(latest!.state.recommendedWith).toContain('"source":"ladder"');
      expect(latest!.state.recommendedWith).toBe(
        filterKey(latest!.state.settings, latest!.state.logVersion, latest!.state.community),
      );
      // Counters in the same bucket reuse the remembered failure: no second request.
      await act(async () => {
        await latest!.actions.loadCounters();
      });
      const cCalls = (host.counters as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      expect((cCalls.at(-1)![1] as { facing: unknown }).facing).toEqual({
        kind: 'prior',
        unavailable: 'ladder',
      });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const url = String(fetchSpy.mock.calls[0]![0]);
      expect(url).toContain('/api/v1/meta?');
      expect(url).toContain('league=great');
    } finally {
      fetchSpy.mockRestore();
    }
  });

  describe('a league switch while a read is in flight', () => {
    const ULTRA = { ...GREAT, id: 'ultra', title: 'Ultra League', short: 'Ultra', cp: 2500 };

    /** Two leagues with community data; the first community fetch waits for the test. */
    async function mountTwoLeagues(overrides: Parameters<typeof fakeHost>[0] = {}) {
      const ready = fakeHost().ready as unknown as () => Promise<Record<string, unknown>>;
      return mount(
        fakeHost({
          ready: vi.fn(async () => ({ ...(await ready()), leagues: [GREAT, ULTRA] })),
          ...overrides,
        }),
      );
    }

    function body(generatedAt: string) {
      return {
        ok: true,
        json: async () => ({ battles: 3, devices: 2, species: [], generatedAt }),
      } as unknown as Response;
    }

    function deferredFetch() {
      let release: (r: Response) => void = () => {};
      const first = new Promise<Response>((resolve) => {
        release = resolve;
      });
      let calls = 0;
      const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        calls += 1;
        return calls === 1 ? first : body('ultra-read');
      });
      return { spy, release: (r: Response) => release(r) };
    }

    async function toLadder(): Promise<void> {
      await act(async () => {
        latest!.actions.updateSettings((cur) => ({
          ...cur,
          facing: { source: 'ladder', window: '7' },
        }));
      });
    }

    async function switchToUltra(): Promise<void> {
      await act(async () => {
        latest!.actions.setLeague('ultra');
      });
      await waitFor(() => {
        expect(latest?.state.leagueLoading).toBe(false);
        expect(latest?.state.leagueInfo).not.toBeNull();
      });
    }

    it('recommend: the old league result is dropped and its read does not land', async () => {
      const f = deferredFetch();
      try {
        await saveEmptyCollection();
        const host = await mountTwoLeagues();
        await waitFor(() => expect(latest?.state.collection).not.toBeNull());
        await toLadder();
        let run: Promise<void> = Promise.resolve();
        await act(async () => {
          run = latest!.actions.runRecommend();
        });
        expect(latest!.state.recommending).toBe(true);
        await switchToUltra();
        await act(async () => {
          f.release(body('great-read'));
          await run;
        });
        const calls = (host.recommend as unknown as { mock: { calls: unknown[][] } }).mock.calls;
        // Great's facing never reached a worker, and nothing was shown as Ultra's result.
        expect(calls).toHaveLength(0);
        expect(latest!.state.recommending).toBe(false);
        expect(latest!.state.recommendation).toBeNull();
        expect(latest!.state.community?.key ?? '').not.toMatch(/^great\|/);

        // The next run is Ultra's, with Ultra's read.
        await act(async () => {
          await latest!.actions.runRecommend();
        });
        expect(calls).toHaveLength(1);
        expect(calls[0]?.[3]).toBe('ultra');
        expect(calls[0]?.[1]).toMatchObject({ facing: { kind: 'community', source: 'ladder' } });
        expect(latest!.state.community?.key).toMatch(/^ultra\|/);
        expect(latest!.state.community?.payload?.generatedAt).toBe('ultra-read');
        expect(latest!.state.recommendedWith).toBe(
          filterKey(latest!.state.settings, latest!.state.logVersion, latest!.state.community),
        );
      } finally {
        f.spy.mockRestore();
      }
    });

    it('counters: the old league result is dropped and loading clears so the screen reloads', async () => {
      const f = deferredFetch();
      try {
        const host = await mountTwoLeagues();
        await toLadder();
        let run: Promise<void> = Promise.resolve();
        await act(async () => {
          run = latest!.actions.loadCounters();
        });
        expect(latest!.state.countersLoading).toBe(true);
        await switchToUltra();
        await act(async () => {
          f.release(body('great-read'));
          await run;
        });
        const calls = (host.counters as unknown as { mock: { calls: unknown[][] } }).mock.calls;
        expect(calls).toHaveLength(0);
        expect(latest!.state.countersLoading).toBe(false);
        expect(latest!.state.counters).toBeNull();
        expect(latest!.state.community?.key ?? '').not.toMatch(/^great\|/);

        await act(async () => {
          await latest!.actions.loadCounters();
        });
        expect(calls).toHaveLength(1);
        expect(calls[0]?.[3]).toBe('ultra');
        expect(latest!.state.counters).not.toBeNull();
        expect(latest!.state.community?.key).toMatch(/^ultra\|/);
      } finally {
        f.spy.mockRestore();
      }
    });

    it('counters: a worker reply for the old league is dropped too', async () => {
      let release: (c: typeof EMPTY_COUNTERS) => void = () => {};
      const counters = vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              release = resolve;
            }),
        )
        .mockImplementation(async () => EMPTY_COUNTERS);
      const host = await mountTwoLeagues({ counters });
      let run: Promise<void> = Promise.resolve();
      await act(async () => {
        run = latest!.actions.loadCounters();
      });
      await waitFor(() => expect(counters).toHaveBeenCalledTimes(1));
      expect(counters.mock.calls[0]?.[3]).toBe('great');
      await switchToUltra();
      await act(async () => {
        release({ ...EMPTY_COUNTERS, facing: 'Great League counters' });
        await run;
      });
      expect(latest!.state.countersLoading).toBe(false);
      expect(latest!.state.counters).toBeNull();
      expect(host.counters).toBe(counters);
    });
  });

  it('drops the last community read on a league with no community data, so Teams is not stale forever', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
    try {
      await saveEmptyCollection();
      const base = fakeHost();
      const ready = base.ready as unknown as () => Promise<Record<string, unknown>>;
      const special = { ...GREAT, id: 'little', title: 'Little Cup', kind: 'special' as const };
      const host = await mount(
        fakeHost({
          ready: vi.fn(async () => ({ ...(await ready()), leagues: [GREAT, special] })),
        }),
      );
      await waitFor(() => expect(latest?.state.collection).not.toBeNull());
      await act(async () => {
        latest!.actions.updateSettings((cur) => ({
          ...cur,
          facing: { source: 'ladder', window: '7' },
        }));
      });
      await act(async () => {
        await latest!.actions.runRecommend();
      });
      expect(latest!.state.community).not.toBeNull();
      await act(async () => {
        latest!.actions.setLeague('little');
      });
      await waitFor(() => expect(latest?.state.leagueInfo).not.toBeNull());
      await act(async () => {
        await latest!.actions.runRecommend();
      });
      const recCalls = (host.recommend as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      expect((recCalls.at(-1)![1] as { facing: unknown }).facing).toEqual({
        kind: 'prior',
        unavailable: 'ladder',
      });
      expect(latest!.state.community).toBeNull();
      expect(latest!.state.recommendedWith).toBe(
        filterKey(latest!.state.settings, latest!.state.logVersion, latest!.state.community),
      );
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('findOrder puts the picks in the order the analysis chose and keeps the analysis', async () => {
    const analysis = {
      team: {
        slots: [
          { candidate: { build: { specimenId: 'species:clodsire', speciesId: 'clodsire' } } },
          { candidate: { build: { specimenId: 'species:tinkaton', speciesId: 'tinkaton' } } },
          { candidate: { build: { specimenId: 'species:azumarill', speciesId: 'azumarill' } } },
        ],
      },
      orders: [],
      hypothetical: [],
      chosenMoves: [],
      unranked: [],
      ms: 1,
    } as unknown as TeamAnalysis;
    const analyze = vi.fn(async () => analysis);
    await mount(fakeHost({ analyze }));
    await act(async () => {
      latest!.actions.setPicks(
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
      ok = await latest!.actions.findOrder();
    });
    expect(ok).toBe(true);
    expect((analyze.mock.calls[0] as unknown[])[2]).toMatchObject({ order: 'best' });
    expect(latest!.state.picks.map((p) => p?.id)).toEqual(['clodsire', 'tinkaton', 'azumarill']);
    expect(latest!.state.analysis).toBe(analysis);
    // It stays on Build: no navigation happened.
    expect(window.location.hash).not.toBe('#/build/team');
  });

  it('loadCounters runs without a collection, with no specimens to mark', async () => {
    const host = await mount();
    await act(async () => {
      await latest!.actions.loadCounters();
    });
    expect(latest!.state.collection).toBeNull();
    expect(latest!.state.counters).not.toBeNull();
    const calls = (host.counters as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toEqual([]);
  });

  it('loadCounters recovers from a host error with a non-null empty result and does not retry', async () => {
    // A collection saved before boot is what makes the provider willing to run counters.
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
    // recordError's device summary reads matchMedia, which jsdom does not implement; this is the
    // first test in this file to actually exercise a failure path.
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
    const host = await mount(
      fakeHost({
        counters: vi.fn(async () => {
          throw new Error('boom');
        }),
      }),
    );
    await waitFor(() => expect(latest?.state.collection).not.toBeNull());
    await act(async () => {
      await latest!.actions.loadCounters();
    });
    expect(latest!.state.counters).not.toBeNull();
    expect(latest!.state.counters?.entries).toEqual([]);
    expect(latest!.state.counters?.battles).toBe(0);
    expect((host.counters as unknown as { mock: { calls: unknown[][] } }).mock.calls).toHaveLength(
      1,
    );
  });

  it('exports and imports the log', async () => {
    await mount();
    await act(async () => {
      await latest!.actions.startSet({ species: ['tinkaton', 'azumarill', 'clodsire'] });
      await latest!.actions.logBattle({ opponents: ['medicham'], result: 'win', tanked: false });
    });
    const text = await latest!.actions.exportLog();
    expect(text).toContain('"battle-log"');
    let r: { added: number; skipped: number } | null = null;
    await act(async () => {
      r = await latest!.actions.importLog(text);
    });
    expect(r).toEqual({ added: 0, skipped: 1 });
    const other = text.replace(/"id": "([^"]+)"/, '"id": "other-set"');
    await act(async () => {
      r = await latest!.actions.importLog(other);
    });
    expect(r).toEqual({ added: 1, skipped: 0 });
    expect(latest!.state.sets).toHaveLength(2);
  });
});
