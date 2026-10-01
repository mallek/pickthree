/**
 * The hooks under the Meta landing, Top teams, Collection and the species page: the blended
 * species ranking with its trend, the team board, and one species' detail.
 *
 * The counter reads (`fetchSummary`, `fetchTeamsBoard`, `fetchSpeciesDetail`) are kept here for
 * the session, one promise per full request (api league, window, source, species), so a
 * re-render or a remount never asks the worker twice. A failed read is forgotten, so "Try again"
 * genuinely asks again. The `/data` loaders already memoize themselves in `metaData.ts`.
 *
 * Whether to read the community at all is the caller's call (`community`): the Meta pages read
 * because the player opened them; Collection passes `shareEnabled(settings)`, since its reads are
 * automatic. A read carries league and window only, never anything from the collection.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  blendedOrder,
  buildBoard,
  rankSpecies,
  rankTrend,
  type ApiWindow,
  type Board,
  type MetaSummaryV1,
  type SourceKey,
  type SpeciesDetailV1,
  type SpeciesRanking,
  type TeamsV1,
  type WindowKey,
} from '@pickthree/engine/meta';
import { communityLeague } from '../communityMeta.ts';
import {
  apiWindow,
  fetchSpeciesDetail,
  fetchSummary,
  fetchTeamsBoard,
  loadGenerated,
  loadPvpokeSide,
  loadSlice,
  weekEarlier,
  type PvpokeSide,
} from '../metaData.ts';
import { seasonsFor } from './seasonsFor.ts';
import { useAppState } from './store.tsx';

export interface Loaded<T> {
  state: 'loading' | 'ready' | 'error';
  data: T | null;
  retry: () => void;
}

export interface MetaRanking {
  ranking: SpeciesRanking;
  /** Species ids in blended order, heaviest first (the order of `ranking.rows`). */
  order: string[];
  /** Places moved by species id, positive climbed. Empty when ranked by PvPoke alone. */
  trend: Map<string, number>;
  window: ApiWindow;
  /** True when the community read failed and this is PvPoke's order standing in for it. */
  offline: boolean;
}

/** No battles, nothing measured: what `rankSpecies` turns into PvPoke's order alone. */
export const EMPTY_SUMMARY: MetaSummaryV1 = {
  league: '',
  since: '',
  until: '',
  source: 'all',
  battles: 0,
  tanked: 0,
  devices: 0,
  bands: {},
  sources: {},
  species: [],
  teams: [],
  previous: null,
  tournament: null,
  generatedAt: '',
};

function emptyTeams(w: ApiWindow): TeamsV1 {
  return {
    league: '',
    since: w.since,
    until: w.until,
    source: 'all',
    battles: 0,
    devices: 0,
    sources: {},
    teams: [],
    cores: [],
    generatedAt: '',
  };
}

// ---- the session cache of counter reads ----

const reads = new Map<string, Promise<unknown>>();

/** Hold a read per key for the session, but never hold a failure. */
function remember<T>(key: string, make: () => Promise<T>): Promise<T> {
  const held = reads.get(key) as Promise<T> | undefined;
  if (held) {
    return held;
  }
  const pending = make().catch((err: unknown) => {
    reads.delete(key);
    throw err;
  });
  reads.set(key, pending);
  return pending;
}

/** `prior` is the app's own view of the `all` response, so the two share one request. */
function wireSource(source: SourceKey): SourceKey {
  return source === 'prior' ? 'all' : source;
}

function summaryRead(apiLeague: string, w: ApiWindow): Promise<MetaSummaryV1> {
  return remember(`meta|${apiLeague}|${w.since}|${w.until}`, () => fetchSummary(apiLeague, w));
}

function teamsRead(apiLeague: string, w: ApiWindow, source: SourceKey): Promise<TeamsV1> {
  const s = wireSource(source);
  return remember(`teams|${apiLeague}|${w.since}|${w.until}|${s}`, () =>
    fetchTeamsBoard(apiLeague, w, s),
  );
}

function detailRead(
  apiLeague: string,
  id: string,
  w: ApiWindow,
  source: SourceKey,
): Promise<SpeciesDetailV1> {
  const s = wireSource(source);
  return remember(`species|${apiLeague}|${id}|${w.since}|${w.until}|${s}`, () =>
    fetchSpeciesDetail(apiLeague, id, w, s),
  );
}

/** Tests only: forget the session's counter reads so the next render uses a fresh stub. */
export function resetMetaHooksForTests(): void {
  reads.clear();
}

// ---- shared plumbing ----

interface Where {
  /** The league the counter worker files this one under, or null when it has none (a special). */
  apiLeague: string | null;
  window: ApiWindow;
}

/** The api league and the resolved window, or null until the game data has booted. */
function useWhere(league: string, key: WindowKey): Where | null {
  const { data } = useAppState();
  if (!data) {
    return null;
  }
  const found = data.leagues.find((l) => l.id === league);
  const apiLeague = found ? communityLeague(found) : null;
  const window = apiWindow(
    key,
    apiLeague ?? league,
    seasonsFor(data, league),
    data.epochs,
    new Date(),
  );
  return { apiLeague, window };
}

const LOADING = { state: 'loading', data: null } as const;

/**
 * Runs `run` whenever `keys` change or `retry` is called, and reports loading, ready or error.
 * A null `run` means the inputs are not in hand yet (the game data is still booting).
 */
function useLoad<T>(run: (() => Promise<T>) | null, keys: readonly unknown[]): Loaded<T> {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ state: Loaded<T>['state']; data: T | null }>(LOADING);
  useEffect(() => {
    setResult(LOADING);
    if (!run) {
      return;
    }
    let live = true;
    run().then(
      (data) => {
        if (live) {
          setResult({ state: 'ready', data });
        }
      },
      () => {
        if (live) {
          setResult({ state: 'error', data: null });
        }
      },
    );
    return () => {
      live = false;
    };
    // `run` is rebuilt every render on purpose; the keys are what decide a rerun.
  }, [...keys, attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...result, retry };
}

function priorRanking(side: PvpokeSide): SpeciesRanking {
  return rankSpecies(EMPTY_SUMMARY, side.baseline, side.ranks, {
    source: 'prior',
    banned: side.banned,
  });
}

// ---- the hooks ----

/**
 * The blended species ranking and its trend. With `community` off, or a league the worker has no
 * data for, it ranks by PvPoke alone with no read and no trend. With it on, the trend baseline is
 * the same window ending a week sooner, or PvPoke's order while the window is under a week old.
 * A failed read (either one) is not an error: PvPoke's order stands in, marked `offline`.
 */
export function useMetaRanking(
  league: string,
  opts: { window: WindowKey; source: SourceKey; community: boolean },
): Loaded<MetaRanking> {
  const where = useWhere(league, opts.window);
  const run = where
    ? async (): Promise<MetaRanking> => {
        const { apiLeague, window: w } = where;
        const measured =
          opts.community && apiLeague !== null
            ? (() => {
                const earlier = weekEarlier(w);
                return Promise.all([
                  summaryRead(apiLeague, w),
                  earlier ? summaryRead(apiLeague, earlier) : Promise.resolve(null),
                ]).catch(() => 'offline' as const);
              })()
            : null;
        const side = await loadPvpokeSide(league);
        const prior = priorRanking(side);
        const priorOrder = blendedOrder(prior.weights);
        const reads = measured ? await measured : null;
        if (reads === null || reads === 'offline') {
          return {
            ranking: prior,
            order: priorOrder,
            trend: new Map(),
            window: w,
            offline: reads === 'offline',
          };
        }
        const [current, before] = reads;
        const blend = (s: MetaSummaryV1) =>
          rankSpecies(s, side.baseline, side.ranks, { source: opts.source, banned: side.banned });
        const ranking = blend(current);
        const order = blendedOrder(ranking.weights);
        const baselineOrder = before ? blendedOrder(blend(before).weights) : priorOrder;
        return {
          ranking,
          order,
          trend: rankTrend(order, baselineOrder),
          window: w,
          offline: false,
        };
      }
    : null;
  return useLoad(run, [
    league,
    where?.apiLeague,
    where?.window.since,
    where?.window.until,
    opts.window,
    opts.source,
    opts.community,
  ]);
}

/** The team board, with the window's counted battles by source (`TeamsV1.sources`), which Top
 * teams' "How it is ranked" uses to say how much of the All board came from each population. */
export interface TopTeamsBoard extends Board {
  sources: Record<string, number>;
}

/**
 * The team board, built as meta.pick3.gg builds it: the ranking from the summary, the observed
 * teams and cores from the team board (emptied under PvPoke, which costs no request since `prior`
 * reads the `all` board), the baked generated teams, and the matchup slice. A failed slice or a
 * missing generated file degrades the board; a failed summary or team board is an error.
 */
export function useTopTeams(
  league: string,
  opts: { window: WindowKey; source: SourceKey },
): Loaded<TopTeamsBoard> {
  const where = useWhere(league, opts.window);
  const run = where
    ? async (): Promise<TopTeamsBoard> => {
        const { apiLeague, window: w } = where;
        const community: Promise<[MetaSummaryV1, TeamsV1]> =
          apiLeague !== null
            ? Promise.all([summaryRead(apiLeague, w), teamsRead(apiLeague, w, opts.source)])
            : Promise.resolve([EMPTY_SUMMARY, emptyTeams(w)]);
        const [side, [summary, teams], view, generated] = await Promise.all([
          loadPvpokeSide(league),
          community,
          loadSlice(league).catch(() => null),
          loadGenerated(league).catch(() => null),
        ]);
        const ranking = rankSpecies(summary, side.baseline, side.ranks, {
          source: opts.source,
          banned: side.banned,
        });
        const observed = opts.source === 'prior' ? { ...teams, teams: [], cores: [] } : teams;
        const board = buildBoard({
          teams: observed,
          ranking,
          generated: generated?.teams ?? [],
          view,
        });
        return { ...board, sources: teams.sources };
      }
    : null;
  return useLoad(run, [
    league,
    where?.apiLeague,
    where?.window.since,
    where?.window.until,
    opts.window,
    opts.source,
  ]);
}

/**
 * One species' measured detail for the window and source. An empty id, or a league the worker
 * has no data for, settles ready with no data and makes no read.
 */
export function useSpeciesDetail(
  league: string,
  id: string,
  window: WindowKey,
  source: SourceKey,
): Loaded<SpeciesDetailV1> {
  const where = useWhere(league, window);
  const run = where
    ? (): Promise<SpeciesDetailV1 | null> =>
        where.apiLeague === null || id === ''
          ? Promise.resolve(null)
          : detailRead(where.apiLeague, id, where.window, source)
    : null;
  return useLoad(run, [
    league,
    id,
    where?.apiLeague,
    where?.window.since,
    where?.window.until,
    window,
    source,
  ]) as Loaded<SpeciesDetailV1>;
}
