import { runSeasons, type Season } from '@pickthree/engine';
import type { DataInfo } from './store.tsx';

/**
 * The seasons a league's Your meta window and community window are cut by. An open league uses
 * the GO Battle League seasons; a GBL cup uses its runs, so "this season" is this run and earlier
 * runs are the earlier buckets. Season stamps on shared battles keep the real seasons (metaShare).
 */
export function seasonsFor(
  data: Pick<DataInfo, 'leagues' | 'seasons' | 'schedule'> | null | undefined,
  leagueId: string,
): Season[] {
  if (!data) {
    return [];
  }
  const league = data.leagues.find((l) => l.id === leagueId);
  if (league?.kind !== 'rotation') {
    return data.seasons;
  }
  return runSeasons(data.schedule, leagueId, league.title);
}
