/**
 * Loading. Each hook owns one request, cancels the one before it when its inputs change, and
 * reports loading, ready or error rather than leaving a screen guessing.
 */
import { createContext, useContext, useEffect, useState } from 'react';
import {
  fetchMeta,
  fetchSpecies,
  type ApiWindow,
  type MetaSummaryV1,
  type SpeciesDetailV1,
} from './api.js';
import { loadBaseline, type Baseline } from './baseline.js';
import { loadStatic, type StaticData } from './data.js';
import type { BandKey } from './route.js';

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
function useAsync<T>(
  run: (signal: AbortSignal) => Promise<T> | null,
  keys: unknown[],
): Loaded<T> {
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

export function useStatic(deps?: Deps): Loaded<StaticData> {
  const ctx = useContext(DepsContext);
  const fetcher = deps?.fetcher ?? ctx.fetcher;
  return useAsync(() => loadStatic(fetcher), [fetcher]);
}

export function useBaseline(league: string, deps?: Deps): Loaded<Baseline> {
  const ctx = useContext(DepsContext);
  const fetcher = deps?.fetcher ?? ctx.fetcher;
  return useAsync(() => loadBaseline(league, fetcher), [league, fetcher]);
}

export function useMetaSummary(
  league: string,
  w: ApiWindow,
  band: BandKey,
  deps?: Deps,
): Loaded<MetaSummaryV1> {
  const ctx = useContext(DepsContext);
  const fetcher = deps?.fetcher ?? ctx.fetcher;
  return useAsync(
    (signal) => {
      const opts: { signal: AbortSignal; fetcher?: typeof fetch } = { signal };
      if (fetcher) {
        opts.fetcher = fetcher;
      }
      return fetchMeta(league, w, band, opts);
    },
    [league, w.since, w.until, band, fetcher],
  );
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
  band: BandKey,
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
      return fetchSpecies(league, id, w, band, opts);
    },
    [league, id, w.since, w.until, band, fetcher],
  );
}
