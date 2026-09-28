/**
 * Loading. Each hook owns one request, cancels the one before it when its inputs change, and
 * reports loading, ready or error rather than leaving a screen guessing.
 */
import { createContext, useContext, useEffect, useState } from 'react';
import {
  fetchMeta,
  fetchSpecies,
  fetchTeams,
  type ApiWindow,
  type MetaSummaryV1,
  type SpeciesDetailV1,
  type TeamsV1,
} from './api.js';
import { loadBaseline, type Baseline } from './baseline.js';
import { loadStatic, type StaticData } from './data.js';
import { loadEpochs, type Epoch } from './epochs.js';
import { loadLegal, type Legal } from './legal.js';
import type { SourceKey } from './route.js';
import { loadGenerated, loadRanks, loadSlice, type GeneratedFile, type Slice } from './slice.js';

export interface Deps {
  fetcher?: typeof fetch;
  now?: () => Date;
}

export const DepsContext = createContext<Deps>({});

export interface Loaded<T> {
  state: 'loading' | 'ready' | 'error';
  data: T | null;
  error: string | null;
}

const LOADING = { state: 'loading', data: null, error: null } as const;

/**
 * `run` returning `null` (not a promise) means there is nothing to fetch this render, e.g. no
 * species id to look up on a view that does not show one. That settles the result immediately,
 * with no data and no error, rather than issuing a request nobody asked for or leaving every
 * consumer to special-case a loading state that would never resolve.
 */
function useAsync<T>(run: (signal: AbortSignal) => Promise<T> | null, keys: unknown[]): Loaded<T> {
  const [result, setResult] = useState<Loaded<T>>(LOADING);
  useEffect(() => {
    const controller = new AbortController();
    const promise = run(controller.signal);
    if (!promise) {
      setResult({ state: 'ready', data: null, error: null });
      return () => controller.abort();
    }
    setResult(LOADING);
    promise.then(
      (data) => {
        if (!controller.signal.aborted) {
          setResult({ state: 'ready', data, error: null });
        }
      },
      (err: unknown) => {
        if (!controller.signal.aborted) {
          setResult({
            state: 'error',
            data: null,
            error: err instanceof Error ? err.message : 'unknown error',
          });
        }
      },
    );
    return () => controller.abort();
    // run is rebuilt every render on purpose; the keys are what decide a refetch.
  }, keys);
  return result;
}

/** Fix round 1: the pre-boot error state needs something for its "Try again" button to call.
 * `attempt` is folded into `useAsync`'s own key array so bumping it re-runs the effect and calls
 * `loadStatic` again; `loadStatic` itself already forgets a failed load (`data.ts`'s own catch
 * resets `cached`), so this is a genuine retry, not a replay of the same rejected promise. */
export function useStatic(deps?: Deps): Loaded<StaticData> & { retry: () => void } {
  const ctx = useContext(DepsContext);
  const fetcher = deps?.fetcher ?? ctx.fetcher;
  const [attempt, setAttempt] = useState(0);
  const result = useAsync(() => loadStatic(fetcher), [fetcher, attempt]);
  return { ...result, retry: () => setAttempt((n) => n + 1) };
}

/** Same retry pattern as `useStatic`: an `attempt` counter folded into `useAsync`'s own key array,
 * so a caller's "Try again" genuinely refetches rather than replaying a rejected promise. Task 7
 * (Pokemon) and Task 8 (Species) reuse this retry, hence the plain name. */
export function useBaseline(league: string, deps?: Deps): Loaded<Baseline> & { retry: () => void } {
  const ctx = useContext(DepsContext);
  const fetcher = deps?.fetcher ?? ctx.fetcher;
  const [attempt, setAttempt] = useState(0);
  const result = useAsync(() => loadBaseline(league, fetcher), [league, fetcher, attempt]);
  return { ...result, retry: () => setAttempt((n) => n + 1) };
}

export function useEpochs(deps?: Deps): Loaded<Epoch[]> {
  const ctx = useContext(DepsContext);
  const fetcher = deps?.fetcher ?? ctx.fetcher;
  return useAsync(() => loadEpochs(fetcher), [fetcher]);
}

/** The per-league matchup slice, fetched lazily like the baseline. Called unconditionally on
 * every view, same as `useBaseline`, so hook order stays stable across screens. */
export function useSlice(league: string, deps?: Deps): Loaded<Slice> {
  const ctx = useContext(DepsContext);
  const fetcher = deps?.fetcher ?? ctx.fetcher;
  return useAsync(() => loadSlice(league, fetcher), [league, fetcher]);
}

/** The per-league PvPoke rank order the slice's projections are weighed against. Same retry
 * pattern as `useBaseline` above. */
export function useRanks(league: string, deps?: Deps): Loaded<string[]> & { retry: () => void } {
  const ctx = useContext(DepsContext);
  const fetcher = deps?.fetcher ?? ctx.fetcher;
  const [attempt, setAttempt] = useState(0);
  const result = useAsync(() => loadRanks(league, fetcher), [league, fetcher, attempt]);
  return { ...result, retry: () => setAttempt((n) => n + 1) };
}

/** The baked generated teams for a league, recomputed against the blended weights once the
 * slice is in hand (`buildBoard` does that recompute, not this hook). */
export function useGenerated(league: string, deps?: Deps): Loaded<GeneratedFile> {
  const ctx = useContext(DepsContext);
  const fetcher = deps?.fetcher ?? ctx.fetcher;
  return useAsync(() => loadGenerated(league, fetcher), [league, fetcher]);
}

/** Same retry pattern as `useBaseline` above. */
export function useTeams(
  league: string,
  w: ApiWindow,
  source: SourceKey,
  deps?: Deps,
): Loaded<TeamsV1> & { retry: () => void } {
  const ctx = useContext(DepsContext);
  const fetcher = deps?.fetcher ?? ctx.fetcher;
  const [attempt, setAttempt] = useState(0);
  const result = useAsync(
    (signal) => {
      const opts: { signal: AbortSignal; fetcher?: typeof fetch } = { signal };
      if (fetcher) {
        opts.fetcher = fetcher;
      }
      return fetchTeams(league, w, source, opts);
    },
    [league, w.since, w.until, source, fetcher, attempt],
  );
  return { ...result, retry: () => setAttempt((n) => n + 1) };
}

/** Same retry pattern as `useBaseline` above. */
export function useMetaSummary(
  league: string,
  w: ApiWindow,
  deps?: Deps,
): Loaded<MetaSummaryV1> & { retry: () => void } {
  const ctx = useContext(DepsContext);
  const fetcher = deps?.fetcher ?? ctx.fetcher;
  const [attempt, setAttempt] = useState(0);
  const result = useAsync(
    (signal) => {
      const opts: { signal: AbortSignal; fetcher?: typeof fetch } = { signal };
      if (fetcher) {
        opts.fetcher = fetcher;
      }
      return fetchMeta(league, w, opts);
    },
    [league, w.since, w.until, fetcher, attempt],
  );
  return { ...result, retry: () => setAttempt((n) => n + 1) };
}

/** The league's Play! ban list, fetched lazily like the baseline. */
export function useLegal(league: string, deps?: Deps): Loaded<Legal> {
  const ctx = useContext(DepsContext);
  const fetcher = deps?.fetcher ?? ctx.fetcher;
  return useAsync(() => loadLegal(league, fetcher), [league, fetcher]);
}

/**
 * Called unconditionally by App.tsx on every view, to keep hook order stable. Most views have
 * no species id to look up, and the worker's species route requires a non-empty one anyway, so
 * an empty `id` here is not a request that failed, it is a request that never needed to happen:
 * `run` returns `null` rather than a promise, and `useAsync` settles that as an idle, dataless
 * "ready" instead of issuing a guaranteed-404 round trip on the site's two most visited pages.
 */
export function useSpeciesDetail(
  league: string,
  id: string,
  w: ApiWindow,
  source: SourceKey,
  deps?: Deps,
): Loaded<SpeciesDetailV1> {
  const ctx = useContext(DepsContext);
  const fetcher = deps?.fetcher ?? ctx.fetcher;
  return useAsync<SpeciesDetailV1>(
    (signal) => {
      if (id === '') {
        return null;
      }
      const opts: { signal: AbortSignal; fetcher?: typeof fetch } = { signal };
      if (fetcher) {
        opts.fetcher = fetcher;
      }
      return fetchSpecies(league, id, w, source, opts);
    },
    [league, id, w.since, w.until, source, fetcher],
  );
}
