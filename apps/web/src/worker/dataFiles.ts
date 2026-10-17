import type {
  DataManifest,
  League,
  MatchupMatrix,
  MetaEntry,
  Move,
  RankingEntry,
  ScheduleEntry,
  Season,
  Species,
} from '@pickthree/engine';
import type { Epoch } from '@pickthree/engine/meta';

/**
 * The worker's game data reads, every file at one data build. The manifest is fetched fresh each
 * boot and names the build (its builtAt); every other /data URL carries that build, so the service
 * worker's cache and the HTTP cache key each file by build. A device can then never pair a game
 * master from one build with league data from another: Little Cup rankings naming
 * pancham_shadow, read beside a game master cached before PvPoke added it, broke the simulator.
 */
export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export const MANIFEST_PATH = '/data/data-manifest.json';

/** A /data path read at one data build. */
export function atBuild(path: string, build: string): string {
  return `${path}?v=${encodeURIComponent(build)}`;
}

async function json<T>(fetchFn: FetchFn, url: string, init?: RequestInit): Promise<T> {
  const res = await fetchFn(url, init);
  if (!res.ok) {
    throw new Error(`Failed to load ${url.replace(/\?.*$/, '')}: ${res.status}`);
  }
  return (await res.json()) as T;
}

export interface BootFiles {
  /** The data build every file was read at. */
  build: string;
  manifest: DataManifest;
  species: Species[];
  moves: Move[];
  leagues: League[];
  /** PvPoke's own game master, which the vendored simulator reads. */
  gamemaster: unknown;
  seasons: Season[];
  epochs: Epoch[];
  schedule: ScheduleEntry[];
  /** The vendored PvPoke bundle's URL at this build, for importScripts. */
  simScript: string;
}

export async function loadBootFiles(fetchFn: FetchFn): Promise<BootFiles> {
  // no-cache: revalidate with the server rather than take any cached copy, however old.
  const manifest = await json<DataManifest>(fetchFn, MANIFEST_PATH, { cache: 'no-cache' });
  const build = manifest.builtAt;
  const at = <T>(path: string): Promise<T> => json<T>(fetchFn, atBuild(path, build));
  const [species, moves, leagues, gamemaster, seasons, epochs, schedule] = await Promise.all([
    at<Species[]>('/data/pokemon.json'),
    at<Move[]>('/data/moves.json'),
    at<League[]>('/data/leagues.json'),
    at<unknown>('/data/gamemaster.json'),
    at<Season[]>('/data/seasons.json').catch(() => [] as Season[]),
    at<Epoch[]>('/data/epochs.json').catch(() => [] as Epoch[]),
    at<ScheduleEntry[]>('/data/schedule.json').catch(() => [] as ScheduleEntry[]),
  ]);
  return {
    build,
    manifest,
    species,
    moves,
    leagues,
    gamemaster,
    seasons,
    epochs,
    schedule,
    simScript: atBuild('/data/vendor/pvpoke-sim.js', build),
  };
}

export interface LeagueFiles {
  rankings: {
    overall: RankingEntry[];
    leads: RankingEntry[];
    switches: RankingEntry[];
    closers: RankingEntry[];
    chargers: RankingEntry[];
  };
  meta: MetaEntry[];
  matrix: MatchupMatrix;
  /** The Play! ban list; empty when none shipped for this league. */
  banned: string[];
}

/** Rankings, meta group, matrix and ban list for one league, at the boot's data build. */
export async function loadLeagueFiles(
  fetchFn: FetchFn,
  build: string,
  id: string,
): Promise<LeagueFiles> {
  const at = <T>(path: string): Promise<T> => json<T>(fetchFn, atBuild(path, build));
  const [overall, leads, switches, closers, chargers, meta, matrix, legal] = await Promise.all([
    at<RankingEntry[]>(`/data/rankings/${id}/overall.json`),
    at<RankingEntry[]>(`/data/rankings/${id}/leads.json`),
    at<RankingEntry[]>(`/data/rankings/${id}/switches.json`),
    at<RankingEntry[]>(`/data/rankings/${id}/closers.json`),
    at<RankingEntry[]>(`/data/rankings/${id}/chargers.json`),
    at<MetaEntry[]>(`/data/meta/${id}.json`),
    at<MatchupMatrix>(`/data/matrix/${id}.json`),
    at<{ banned: string[] }>(`/data/legal/${id}.json`).catch(() => ({ banned: [] as string[] })),
  ]);
  return {
    rankings: { overall, leads, switches, closers, chargers },
    meta,
    matrix,
    banned: legal.banned,
  };
}
