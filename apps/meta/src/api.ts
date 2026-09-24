/**
 * The measured side: the worker's v1 read endpoints. Same origin in production; the Vite dev
 * server proxies /api to the deployed worker, so connect-src stays 'self' everywhere.
 *
 * The wire shapes below are written down again rather than imported from workers/counter: this app
 * does not depend on that workspace, and a format written on both sides is the contract. They must
 * match workers/counter/src/meta.ts exactly.
 */
import {
  BUCKET_MS,
  MAX_SPAN_DAYS,
  resolveWindow,
  type ApiWindow,
  type WindowContext,
} from '@pickthree/engine/meta';
import type { SourceKey } from './route.js';
export { BUCKET_MS, MAX_SPAN_DAYS, resolveWindow, type ApiWindow, type WindowContext };

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
