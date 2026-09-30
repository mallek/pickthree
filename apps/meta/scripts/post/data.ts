/**
 * Production game data for one league, fetched from pick3.gg so a post matches what the live
 * app computes. Nothing is cached; a run reads about 20 MB.
 */
import type {
  League,
  MatchupMatrix,
  Move,
  RankingEntry,
  Rankings,
  ScheduleEntry,
  Species,
} from '@pickthree/engine';

export const DATA_BASE = 'https://pick3.gg/data';

export type Fetcher = (
  url: string,
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export async function getJson<T>(url: string, fetcher: Fetcher = fetch): Promise<T> {
  const res = await fetcher(url);
  if (!res.ok) {
    throw new Error(`Could not read ${url}: HTTP ${res.status}`);
  }
  try {
    return (await res.json()) as T;
  } catch (err) {
    throw new Error('Could not parse ' + url + ': ' + (err as Error).message, { cause: err });
  }
}

export interface CupData {
  manifest: { pvpokeCommit: string; pvpokeDate: string };
  pokemon: Species[];
  moves: Move[];
  gameMaster: unknown;
  league: League;
  schedule: ScheduleEntry[];
  seasons: { start: string }[];
  epochs: unknown;
  matrix: MatchupMatrix;
  rankings: Rankings;
  /** PvPoke's meta group for the league, in its own order. */
  group: string[];
  /** Species the Play! ruleset bans in this league. */
  banned: string[];
}

export async function loadCupData(leagueId: string, fetcher: Fetcher = fetch): Promise<CupData> {
  const get = <T>(path: string): Promise<T> => getJson<T>(`${DATA_BASE}/${path}`, fetcher);
  const leagues = await get<League[]>('leagues.json');
  const league = leagues.find((l) => l.id === leagueId);
  if (!league) {
    throw new Error(
      `pick3.gg has no league "${leagueId}". Leagues: ${leagues.map((l) => l.id).join(', ')}`,
    );
  }
  const ranking = (role: string): Promise<RankingEntry[]> =>
    get<RankingEntry[]>(`rankings/${leagueId}/${role}.json`);
  const [manifest, pokemon, moves, gameMaster, schedule, seasons, epochs, matrix, meta, legal] =
    await Promise.all([
      get<{ pvpokeCommit: string; pvpokeDate: string }>('data-manifest.json'),
      get<Species[]>('pokemon.json'),
      get<Move[]>('moves.json'),
      get<unknown>('gamemaster.json'),
      get<ScheduleEntry[]>('schedule.json'),
      get<{ start: string }[]>('seasons.json'),
      get<unknown>('epochs.json'),
      get<MatchupMatrix>(`matrix/${leagueId}.json`),
      get<{ speciesId: string }[]>(`meta/${leagueId}.json`),
      get<{ banned: string[] }>(`legal/${leagueId}.json`),
    ]);
  const [overall, leads, switches, closers, chargers] = await Promise.all(
    ['overall', 'leads', 'switches', 'closers', 'chargers'].map(ranking),
  );
  return {
    manifest,
    pokemon,
    moves,
    gameMaster,
    league,
    schedule,
    seasons,
    epochs,
    matrix,
    rankings: {
      overall: overall!,
      leads: leads!,
      switches: switches!,
      closers: closers!,
      chargers: chargers!,
    },
    group: meta.map((m) => m.speciesId),
    banned: legal.banned,
  };
}
