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
import { DEFAULT_SETTINGS } from '../src/storage/db.ts';
import { emptyLayoutValue } from '../src/format.ts';
import { fakeHost } from './fakeHost.ts';

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
  it('parses and prints the Counters route with a species to score against', () => {
    expect(parseHash('#/counters')).toEqual({ screen: 'counters' });
    expect(parseHash('#/counters?vs=medicham')).toEqual({ screen: 'counters', vs: 'medicham' });
    expect(hashFor({ screen: 'counters', vs: 'medicham' })).toBe('#/counters?vs=medicham');
    expect(hashFor({ screen: 'counters' })).toBe('#/counters');
  });
  it('filterKey changes with the log version', () => {
    expect(filterKey(DEFAULT_SETTINGS, 1)).not.toBe(filterKey(DEFAULT_SETTINGS, 2));
  });
});

describe('battle log actions', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    window.location.hash = '';
    latest = null;
  });

  it('starts a set, logs battles, closes at five, and bumps the log version', async () => {
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
    expect(latest!.state.sets[0]?.closed).toBe(true);
    expect((await storage.loadSets('great'))[0]?.closed).toBe(true);
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
      expect(latest!.state.notice).toMatch(/Could not save that battle/);
      expect(latest!.state.sets[0]?.battles).toHaveLength(0);
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
    const recOpts = (host.recommend as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]![1] as {
      yourMeta: { battles: unknown[]; blend: boolean };
    };
    expect(recOpts.yourMeta.blend).toBe(true);
    expect(recOpts.yourMeta.battles).toHaveLength(1);
    const cOpts = (host.counters as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]![1] as {
      yourMeta: { battles: unknown[] };
    };
    expect(cOpts.yourMeta.battles).toHaveLength(1);
    expect(latest!.state.counters?.facing).toContain('PvPoke weights only');
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
