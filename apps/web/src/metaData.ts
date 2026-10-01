/**
 * The loaders under the Meta, Top teams and species pages: PvPoke's side from the app's own
 * `/data` files, the matchup slice, the baked generated teams, and the counter worker's v1 read
 * endpoints. The pages read because the player opened them, so these never gate on the sharing
 * switch; a read carries league and window only, never anything from the collection.
 *
 * The URLs are on COUNTER_ORIGIN, each window rounded to its ten minute bucket, so every reader
 * in a slice shares the edge's cache entry.
 *
 * Every `/data` loader memoizes per league in a module Map and forgets a failure, so a load that
 * failed offline is retried on the next render.
 */
import type { Season } from '@pickthree/engine';
import {
  baselineFor,
  MATRIX_TOP,
  MatrixView,
  ranksOf,
  resolveWindow,
  sliceMatrix,
  type ApiWindow,
  type Baseline,
  type Epoch,
  type GeneratedFile,
  type MatchupMatrix,
  type MetaEntryIn,
  type MetaSummaryV1,
  type RankingIn,
  type SourceKey,
  type SpeciesDetailV1,
  type TeamsV1,
  type WindowKey,
} from '@pickthree/engine/meta';
import { COUNTER_ORIGIN } from './counter.ts';

export const META_TIMEOUT_MS = 8_000;
const DAY_MS = 86_400_000;

export interface PvpokeSide {
  baseline: Baseline;
  ranks: string[];
  banned: Set<string>;
}

const sides = new Map<string, Promise<PvpokeSide>>();
const slices = new Map<string, Promise<MatrixView>>();
const generated = new Map<string, Promise<GeneratedFile | null>>();

/** Memoise a load per key, but never memoise a failure. */
function once<T>(cache: Map<string, Promise<T>>, key: string, make: () => Promise<T>): Promise<T> {
  const held = cache.get(key);
  if (held) {
    return held;
  }
  const pending = make().catch((err: unknown) => {
    cache.delete(key);
    throw err;
  });
  cache.set(key, pending);
  return pending;
}

async function json<T>(url: string, fetcher: typeof fetch): Promise<T> {
  const res = await fetcher(url);
  if (!res.ok) {
    throw new Error(`Could not load ${url} (${res.status})`);
  }
  return (await res.json()) as T;
}

/** The ban list is optional: an older data build has none, and no list means nothing banned. */
async function loadBanned(league: string, fetcher: typeof fetch): Promise<Set<string>> {
  const res = await fetcher(`/data/legal/${league}.json`);
  if (!res.ok) {
    return new Set<string>();
  }
  const file = (await res.json()) as { banned?: string[] };
  return new Set(file.banned ?? []);
}

/** PvPoke's curated meta group joined to its overall ranking, its rank order, and the Play! ban
 *  list. Shown as PvPoke's list wherever it appears, never described with a measured word. */
export function loadPvpokeSide(league: string, fetcher: typeof fetch = fetch): Promise<PvpokeSide> {
  return once(sides, league, async () => {
    const [group, overall, banned] = await Promise.all([
      json<MetaEntryIn[]>(`/data/meta/${league}.json`, fetcher),
      json<RankingIn[]>(`/data/rankings/${league}/overall.json`, fetcher),
      loadBanned(league, fetcher),
    ]);
    return {
      baseline: baselineFor(league, group, overall, { pvpokeCommit: '', pvpokeDate: '' }),
      ranks: ranksOf(overall),
      banned,
    };
  });
}

/** The matchup slice (top species by PvPoke rank), which is what lets a phone project a team
 *  with no simulator. */
export function loadSlice(league: string, fetcher: typeof fetch = fetch): Promise<MatrixView> {
  return once(slices, league, async () => {
    const matrix = await json<MatchupMatrix>(`/data/matrix/${league}.json`, fetcher);
    return new MatrixView(sliceMatrix(matrix, MATRIX_TOP));
  });
}

/** The baked generated teams for the cold start. A missing file is null, not an error. */
export function loadGenerated(
  league: string,
  fetcher: typeof fetch = fetch,
): Promise<GeneratedFile | null> {
  return once(generated, league, async () => {
    const res = await fetcher(`/data/baseline/${league}-teams.json`);
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw new Error(`Could not load the generated teams for ${league} (${res.status})`);
    }
    return (await res.json()) as GeneratedFile;
  });
}

export function apiWindow(
  key: WindowKey,
  league: string,
  seasons: readonly Season[],
  epochs: readonly Epoch[],
  now: Date,
): ApiWindow {
  return resolveWindow(key, { league, seasons, epochs }, now);
}

/** The same window ending a week sooner, for the trend comparison. Null when that leaves no
 *  window (under a week of history). */
export function weekEarlier(w: ApiWindow): ApiWindow | null {
  const until = Date.parse(w.until) - 7 * DAY_MS;
  if (!(until > Date.parse(w.since))) {
    return null;
  }
  return { ...w, until: new Date(until).toISOString() };
}

/** The population the worker is asked for. `prior` is the app's own view of the `all` response
 *  (PvPoke's list is baked), so it never becomes its own request. */
function search(league: string, w: ApiWindow, source: SourceKey | null): string {
  const p = new URLSearchParams({ league, since: w.since, until: w.until });
  if (source !== null && source !== 'all' && source !== 'prior') {
    p.set('source', source);
  }
  return p.toString();
}

async function get<T>(url: string, fetcher: typeof fetch): Promise<T> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), META_TIMEOUT_MS);
  try {
    const res = await fetcher(url, { cache: 'no-store', signal: abort.signal });
    if (!res.ok) {
      throw new Error(`The community meta answered ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Always the `all` response: it carries the ladder numbers and the tournament block. */
export function fetchSummary(
  apiLeague: string,
  w: ApiWindow,
  fetcher: typeof fetch = fetch,
): Promise<MetaSummaryV1> {
  return get<MetaSummaryV1>(`${COUNTER_ORIGIN}/api/v1/meta?${search(apiLeague, w, null)}`, fetcher);
}

export function fetchTeamsBoard(
  apiLeague: string,
  w: ApiWindow,
  source: SourceKey,
  fetcher: typeof fetch = fetch,
): Promise<TeamsV1> {
  return get<TeamsV1>(`${COUNTER_ORIGIN}/api/v1/teams?${search(apiLeague, w, source)}`, fetcher);
}

export function fetchSpeciesDetail(
  apiLeague: string,
  id: string,
  w: ApiWindow,
  source: SourceKey,
  fetcher: typeof fetch = fetch,
): Promise<SpeciesDetailV1> {
  return get<SpeciesDetailV1>(
    `${COUNTER_ORIGIN}/api/v1/species/${encodeURIComponent(id)}?${search(apiLeague, w, source)}`,
    fetcher,
  );
}

/** Tests only: forget the memoised loads so the next call uses a fresh stub. */
export function resetMetaDataForTests(): void {
  sides.clear();
  slices.clear();
  generated.clear();
}
