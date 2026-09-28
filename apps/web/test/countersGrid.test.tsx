import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CounterEntry, CountersResult } from '@pickthree/engine';
import { resetDbForTests } from '../src/storage/db.ts';
import { AppProvider, useActions, useAppState } from '../src/state/store.tsx';
import { WorkerHost } from '../src/host/WorkerHost.ts';
import type { WorkerRequest, WorkerResponse } from '../src/host/protocol.ts';
import type { AppState } from '../src/state/store.tsx';
import { resetCommunityMetaCache } from '../src/communityMeta.ts';
import { fakeHost, GREAT, streamingCounters, type CountersRun } from './fakeHost.ts';

type Actions = ReturnType<typeof useActions>;
let latest: { state: AppState; actions: Actions } | null = null;

function Probe() {
  latest = { state: useAppState(), actions: useActions() };
  return null;
}

const ULTRA = { ...GREAT, id: 'ultra', title: 'Ultra League', short: 'Ultra', cp: 2500 };

function entry(speciesId: string, antiRank: number, grid: number[] | null): CounterEntry {
  return {
    speciesId,
    overallRank: antiRank,
    antiRank,
    antiMeta: 100 - antiRank,
    gap: 0,
    beats: [],
    losesTo: [],
    owned: 'none',
    ownedSpecimenId: null,
    ownedStageOffset: null,
    grid,
  };
}

const WIN = [600, 600, 600, 600, 600, 600, 600, 600, 600];
const SPLIT = [600, 400, 400, 600, 600, 400, 600, 600, 600];

function result(entries: CounterEntry[], extra: Partial<CountersResult> = {}): CountersResult {
  return {
    entries,
    facing: "Scored against one opponent at PvPoke's movesets; your log does not apply here",
    blended: false,
    battles: 0,
    vs: { speciesId: 'azumarill', inMeta: true },
    ...extra,
  };
}

const ROWS = result([entry('medicham', 1, null), entry('clodsire', 2, null)]);
const SOME = result([entry('medicham', 1, SPLIT), entry('clodsire', 2, null)]);
const FINAL = result([entry('clodsire', 1, WIN), entry('medicham', 2, SPLIT)], { gridMs: 42 });

async function mount(overrides: Parameters<typeof fakeHost>[0]) {
  const ready = fakeHost().ready as unknown as () => Promise<Record<string, unknown>>;
  render(
    <AppProvider
      host={fakeHost({
        ready: vi.fn(async () => ({ ...(await ready()), leagues: [GREAT, ULTRA] })),
        ...overrides,
      })}
    >
      <Probe />
    </AppProvider>,
  );
  await waitFor(() => {
    expect(latest?.state.boot).toBe('ready');
    expect(latest?.state.leagueInfo).not.toBeNull();
    expect(latest?.state.setsLoaded).toBe(true);
  });
}

/** Start Who Beats Azumarill from its route, as the Counters screen does. */
async function startVsAzumarill(runs: CountersRun[]): Promise<void> {
  await act(async () => {
    latest!.actions.navigate({ screen: 'counters', vs: 'azumarill' }, { replace: true });
  });
  await act(async () => {
    void latest!.actions.loadCounters('azumarill');
  });
  await waitFor(() => expect(runs).toHaveLength(1));
}

describe('counters stream their shield grids', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    resetCommunityMetaCache();
    window.location.hash = '';
    latest = null;
  });

  it('shows the rows, then the grids as they fill, then the sorted result', async () => {
    const { counters, runs } = streamingCounters();
    await mount({ counters });
    await startVsAzumarill(runs);
    const run = runs[0]!;
    expect(run.options.vs).toBe('azumarill');
    expect(run.league).toBe('great');

    await act(async () => {
      run.onPartial(ROWS);
    });
    expect(latest!.state.counters).toEqual(ROWS);
    expect(latest!.state.countersLoading).toBe(true);
    expect(latest!.state.countersVs).toBe('azumarill');

    await act(async () => {
      run.onPartial(SOME);
      run.onProgress({ stage: 'counters-grid', done: 1, total: 2 });
    });
    expect(latest!.state.counters?.entries[0]?.grid).toEqual(SPLIT);
    expect(latest!.state.counters?.entries[1]?.grid).toBeNull();
    expect(latest!.state.countersProgress).toEqual({ stage: 'counters-grid', done: 1, total: 2 });
    expect(latest!.state.countersLoading).toBe(true);

    await act(async () => {
      run.resolve(FINAL);
    });
    expect(latest!.state.counters).toEqual(FINAL);
    expect(latest!.state.counters?.gridMs).toBe(42);
    expect(latest!.state.countersLoading).toBe(false);
    expect(latest!.state.countersProgress).toBeNull();
  });

  it('drops the old league grids after a league switch, and they never land on the new run', async () => {
    const { counters, runs } = streamingCounters();
    await mount({ counters });
    await startVsAzumarill(runs);
    const old = runs[0]!;
    await act(async () => {
      old.onPartial(ROWS);
    });
    await act(async () => {
      latest!.actions.setLeague('ultra');
    });
    await waitFor(() => {
      expect(latest?.state.leagueLoading).toBe(false);
      expect(latest?.state.leagueInfo).not.toBeNull();
    });
    // The first partial after the switch drops the run: nothing shown, loading clear.
    await act(async () => {
      old.onPartial(SOME);
    });
    expect(latest!.state.counters).toBeNull();
    expect(latest!.state.countersLoading).toBe(false);

    // The screen asks again in the new league; the old run's tail must not touch it.
    await act(async () => {
      void latest!.actions.loadCounters('azumarill');
    });
    await waitFor(() => expect(runs).toHaveLength(2));
    expect(runs[1]!.league).toBe('ultra');
    await act(async () => {
      old.onPartial(SOME);
      old.onProgress({ stage: 'counters-grid', done: 2, total: 2 });
      old.resolve(FINAL);
    });
    expect(latest!.state.counters).toBeNull();
    expect(latest!.state.countersLoading).toBe(true);
    expect(latest!.state.countersProgress).toBeNull();

    const ultraRows = result([entry('tinkaton', 1, null)]);
    await act(async () => {
      runs[1]!.onPartial(ultraRows);
    });
    expect(latest!.state.counters).toEqual(ultraRows);
  });

  it('drops a partial or result that arrives after the opponent changed', async () => {
    const { counters, runs } = streamingCounters();
    await mount({ counters });
    await startVsAzumarill(runs);
    const run = runs[0]!;
    await act(async () => {
      run.onPartial(ROWS);
    });
    expect(latest!.state.counters).toEqual(ROWS);
    await act(async () => {
      latest!.actions.navigate({ screen: 'counters', vs: 'medicham' }, { replace: true });
    });
    await act(async () => {
      run.onPartial(SOME);
    });
    // Dropped, and the half-filled Azumarill rows go with it: coming back to Azumarill must ask
    // again rather than show grids that will never fill.
    expect(latest!.state.counters).toBeNull();
    expect(latest!.state.countersLoading).toBe(false);
    await act(async () => {
      run.resolve(FINAL);
    });
    expect(latest!.state.counters).toBeNull();
    expect(latest!.state.countersLoading).toBe(false);
  });

  it('keeps filling when you step off Counters to another screen', async () => {
    const { counters, runs } = streamingCounters();
    await mount({ counters });
    await startVsAzumarill(runs);
    const run = runs[0]!;
    await act(async () => {
      latest!.actions.navigate({ screen: 'collection' }, { replace: true });
    });
    await act(async () => {
      run.onPartial(SOME);
    });
    expect(latest!.state.counters).toEqual(SOME);
    await act(async () => {
      run.resolve(FINAL);
    });
    expect(latest!.state.counters).toEqual(FINAL);
    expect(latest!.state.countersVs).toBe('azumarill');
  });
});

/** A Worker stand-in: records what the host posts and lets the test answer as the worker. */
function fakeWorker() {
  const posted: WorkerRequest[] = [];
  const worker = {
    onmessage: null as ((ev: MessageEvent<WorkerResponse>) => void) | null,
    onerror: null,
    postMessage: (m: WorkerRequest) => posted.push(m),
  };
  const reply = (m: WorkerResponse): void => worker.onmessage?.({ data: m } as MessageEvent);
  return { worker: worker as unknown as Worker, posted, reply };
}

describe('WorkerHost counters partials', () => {
  it('hands counters partials to the counters call and verdicts partials to verdicts', async () => {
    const w = fakeWorker();
    const host = new WorkerHost(w.worker);
    const partials: CountersResult[] = [];
    const progress: string[] = [];
    const run = host.counters(
      [],
      { vs: 'azumarill' },
      (e) => progress.push(`${e.stage} ${e.done}/${e.total}`),
      'ultra',
      (r) => partials.push(r),
    );
    const req = w.posted[0]!;
    expect(req).toMatchObject({ kind: 'counters', league: 'ultra', options: { vs: 'azumarill' } });
    w.reply({ id: req.id, kind: 'partial', counters: ROWS });
    w.reply({ id: req.id, kind: 'progress', stage: 'counters-grid', done: 1, total: 2 });
    w.reply({ id: req.id, kind: 'partial', counters: SOME });
    w.reply({ id: req.id, kind: 'result', result: { kind: 'counters', counters: FINAL } });
    await expect(run).resolves.toEqual(FINAL);
    expect(partials).toEqual([ROWS, SOME]);
    expect(progress).toEqual(['counters-grid 1/2']);

    const verdictSlices: unknown[] = [];
    const v = host.verdicts([], {}, undefined, 'great', (slice) => verdictSlices.push(slice));
    const vreq = w.posted[1]!;
    w.reply({ id: vreq.id, kind: 'partial', verdicts: {} });
    w.reply({ id: vreq.id, kind: 'result', result: { kind: 'verdicts', verdicts: {} } });
    await v;
    expect(verdictSlices).toEqual([{}]);
  });
});
