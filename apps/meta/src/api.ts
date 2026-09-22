/**
 * The measured side: the worker's v1 read endpoints. Same origin in production; the Vite dev
 * server proxies /api to the deployed worker, so connect-src stays 'self' everywhere.
 *
 * The wire shapes below are written down again rather than imported from workers/counter: this app
 * does not depend on that workspace, and a format written on both sides is the contract. They must
 * match workers/counter/src/meta.ts exactly.
 */
import type { Season } from './data.js';
import { epochFor, type Epoch } from './epochs.js';
import type { SourceKey, WindowKey } from './route.js';

export interface SpeciesStats {
  speciesId: string;
  sightings: number;
  wins: number;
  losses: number;
  runs: number;
  runWins: number;
  runLosses: number;
}
export interface MovesetStats {
  fast: string;
  charged: string[];
  battles: number;
}
export interface TeamStats {
  species: [string, string, string];
  battles: number;
  wins: number;
  losses: number;
  moves: (MovesetStats | null)[];
}
export interface TournamentSpeciesStat {
  speciesId: string;
  picks: number;
  game1Picks: number;
  wins: number;
  losses: number;
  unresolvedForms: number;
}
export interface TournamentBlock {
  events: number;
  battles: number;
  eventsOther: number;
  species: TournamentSpeciesStat[];
}
export interface RosterMovesetStats {
  fast: string;
  charged: string[];
  entries: number;
}
export interface SpeciesTournamentBlock {
  picks: number;
  game1Picks: number;
  wins: number;
  losses: number;
  byDepth: number[];
  unresolvedForms: number;
  broughtBy: number;
  rosterSize: number;
  pickedOnStream: number;
  movesets: RosterMovesetStats[];
  movesetsKnown: number;
}
export interface MetaSummaryV1 {
  league: string;
  since: string;
  until: string;
  source: string;
  band: string;
  battles: number;
  tanked: number;
  devices: number;
  bands: Record<string, number>;
  /** Counted battles by source. One key today; nothing reads it yet. */
  sources: Record<string, number>;
  species: SpeciesStats[];
  /**
   * @deprecated Run teams only, and capped at 50. The whole team board, run and faced, cores and
   * complete teams, is /api/v1/teams. Left in place and unchanged rather than altered under a
   * consumer; nothing new should read it.
   */
  teams: TeamStats[];
  previous: { battles: number; species: { speciesId: string; sightings: number }[] } | null;
  tournament: TournamentBlock | null;
  generatedAt: string;
}
export interface TeamRowV1 {
  species: string[];
  kind: 'core' | 'team';
  runBattles: number;
  runWins: number;
  runLosses: number;
  facedBattles: number;
  facedWins: number;
  facedLosses: number;
  moves: (MovesetStats | null)[];
  thirds: { speciesId: string; sightings: number }[];
}
export interface TeamsV1 {
  league: string;
  since: string;
  until: string;
  source: string;
  band: string;
  battles: number;
  devices: number;
  sources: Record<string, number>;
  teams: TeamRowV1[];
  cores: TeamRowV1[];
  generatedAt: string;
}
export interface SpeciesDetailV1 {
  league: string;
  speciesId: string;
  since: string;
  until: string;
  source: string;
  band: string;
  sightings: number;
  wins: number;
  losses: number;
  runs: number;
  runWins: number;
  runLosses: number;
  weekly: { week: string; battles: number; sightings: number }[];
  bands: { band: string; sightings: number; wins: number; losses: number }[];
  alongside: { speciesId: string; battles: number }[];
  movesets: MovesetStats[];
  tournament: SpeciesTournamentBlock | null;
  generatedAt: string;
}

export interface WindowContext {
  league: string;
  seasons: readonly Season[];
  epochs: readonly Epoch[];
}

export interface ApiWindow {
  since: string;
  until: string;
  label: string;
  key: WindowKey;
  /** The epoch the window came from, when it came from one. */
  epoch: Epoch | null;
}

/** Ten minute buckets, so every reader in a slice asks the edge for the same url. */
export const BUCKET_MS = 600_000;
const DAY_MS = 86_400_000;
/** The most days the worker will answer for (MAX_SPAN_DAYS in workers/counter/src/meta.ts). The
 *  client clamps first rather than letting an old epoch produce a request that is refused. */
export const MAX_SPAN_DAYS = 400;

/** Rounds up to the next ten minute boundary. An exact boundary stays where it is. */
function bucketUp(now: Date): number {
  return Math.ceil(now.getTime() / BUCKET_MS) * BUCKET_MS;
}

function seasonStart(seasons: readonly Season[], at: number): number | null {
  let best: number | null = null;
  for (const s of seasons) {
    const start = Date.parse(s.start);
    if (Number.isFinite(start) && start <= at && (best === null || start > best)) {
      best = start;
    }
  }
  return best;
}

export function resolveWindow(key: WindowKey, ctx: WindowContext, now: Date): ApiWindow {
  const until = bucketUp(now);
  if (key !== 'meta') {
    const days = key === '7' ? 7 : 30;
    return {
      since: new Date(until - days * DAY_MS).toISOString(),
      until: new Date(until).toISOString(),
      label: `${days} days`,
      key,
      epoch: null,
    };
  }
  const epoch = epochFor(ctx.epochs, ctx.league, new Date(until));
  // An epoch first, the season start second: the season is still the right answer for a league
  // no epoch has ever named, and it is what a record stamps.
  const start = epoch ? Date.parse(epoch.at) : seasonStart(ctx.seasons, until);
  if (start === null || !Number.isFinite(start)) {
    // Nothing covers this moment, so measure the last 30 days and keep the chip honest.
    const fallback = resolveWindow('30', ctx, now);
    return { ...fallback, label: 'This meta', key: 'meta' };
  }
  const floor = until - MAX_SPAN_DAYS * DAY_MS;
  return {
    since: new Date(Math.max(start, floor)).toISOString(),
    until: new Date(until).toISOString(),
    label: 'This meta',
    key,
    epoch,
  };
}

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
