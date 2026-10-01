/**
 * The measured side: the worker's v1 read endpoints. Same origin in production; the Vite dev
 * server proxies /api to the deployed worker, so connect-src stays 'self' everywhere.
 *
 * The wire shapes live in @pickthree/engine/meta (api.ts), written down again rather than imported
 * from workers/counter, and are re-exported here so this app's screens keep their imports. They
 * must match workers/counter/src/meta.ts exactly.
 */
import {
  BUCKET_MS,
  MAX_SPAN_DAYS,
  resolveWindow,
  type ApiWindow,
  type MetaSummaryV1,
  type SpeciesDetailV1,
  type TeamsV1,
  type WindowContext,
} from '@pickthree/engine/meta';
import type { SourceKey } from './route.js';
export { BUCKET_MS, MAX_SPAN_DAYS, resolveWindow, type ApiWindow, type WindowContext };
export type {
  MetaSummaryV1,
  MovesetStats,
  RosterMovesetStats,
  SpeciesDetailV1,
  SpeciesStats,
  SpeciesTournamentBlock,
  TeamRowV1,
  TeamStats,
  TeamsV1,
  TournamentBlock,
  TournamentSpeciesStat,
} from '@pickthree/engine/meta';

/** The population the worker is asked for. `prior` is the site's own view of the same `all`
 *  response (PvPoke's list is baked), so it never becomes its own request: one cached `all`
 *  response serves All and PvPoke alike. */
export function workerSource(source: SourceKey): 'all' | 'ladder' | 'tournament' {
  return source === 'prior' ? 'all' : source;
}

function search(league: string, w: ApiWindow, source: SourceKey | null): string {
  const p = new URLSearchParams({ league, since: w.since, until: w.until });
  if (source !== null) {
    const asked = workerSource(source);
    if (asked !== 'all') {
      p.set('source', asked);
    }
  }
  return p.toString();
}

/** Always the `all` response: it carries the ladder numbers AND the tournament block, which is
 *  everything all four views need, so switching source costs no request and no cache entry. */
export function metaUrl(league: string, w: ApiWindow): string {
  return `/api/v1/meta?${search(league, w, null)}`;
}

export function speciesUrl(league: string, id: string, w: ApiWindow, source: SourceKey): string {
  return `/api/v1/species/${encodeURIComponent(id)}?${search(league, w, source)}`;
}

export function teamsUrl(league: string, w: ApiWindow, source: SourceKey): string {
  return `/api/v1/teams?${search(league, w, source)}`;
}

async function get<T>(
  url: string,
  opts: { signal?: AbortSignal; fetcher?: typeof fetch } = {},
): Promise<T> {
  const fetcher = opts.fetcher ?? fetch;
  const res = await fetcher(url, opts.signal ? { signal: opts.signal } : {});
  if (!res.ok) {
    let reason = `${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      reason = body.error ?? reason;
    } catch {
      // A non-JSON error body is still an error; the status is enough to report.
    }
    throw new Error(reason);
  }
  return (await res.json()) as T;
}

export function fetchMeta(
  league: string,
  w: ApiWindow,
  opts: { signal?: AbortSignal; fetcher?: typeof fetch } = {},
): Promise<MetaSummaryV1> {
  return get<MetaSummaryV1>(metaUrl(league, w), opts);
}

export function fetchSpecies(
  league: string,
  id: string,
  w: ApiWindow,
  source: SourceKey,
  opts: { signal?: AbortSignal; fetcher?: typeof fetch } = {},
): Promise<SpeciesDetailV1> {
  return get<SpeciesDetailV1>(speciesUrl(league, id, w, source), opts);
}

export function fetchTeams(
  league: string,
  w: ApiWindow,
  source: SourceKey,
  opts: { signal?: AbortSignal; fetcher?: typeof fetch } = {},
): Promise<TeamsV1> {
  return get<TeamsV1>(teamsUrl(league, w, source), opts);
}
