import { leagueStatus, type League, type ScheduleEntry } from '@pickthree/engine';
import { leagueDetail } from './format.ts';

/**
 * What the league row and the Leagues sheet show. The row holds the open leagues. The sheet
 * lists every league: the open leagues, the shipped cups (Tournament), then GO Battle League
 * cups that are live (soonest to end first) and upcoming (soonest to start first). A rotation
 * cup that is neither is left out unless it is the one selected. Special formats never show.
 */
export function sheetLeagues(
  leagues: readonly League[],
  schedule: readonly ScheduleEntry[],
  current: string,
  now: Date,
): { open: League[]; more: { league: League; detail: string[] }[] } {
  const shown = leagues.filter((l) => l.kind !== 'special');
  const open = shown.filter((l) => l.kind === 'standard');
  const fixed = shown.filter((l) => l.kind === 'standard' || l.kind === 'cup');
  const rotation = shown
    .filter((l) => l.kind === 'rotation')
    .map((l) => ({ league: l, status: leagueStatus(schedule, l.id, now) }))
    .filter((r) => r.status.state !== 'off' || r.league.id === current);
  const time = (r: (typeof rotation)[number]): number => {
    if (r.status.state === 'live') {
      return Date.parse(r.status.end);
    }
    return r.status.state === 'upcoming' ? Date.parse(r.status.start) : Infinity;
  };
  const rank = (r: (typeof rotation)[number]): number => {
    if (r.status.state === 'live') {
      return 0;
    }
    return r.status.state === 'upcoming' ? 1 : 2;
  };
  rotation.sort((a, b) => rank(a) - rank(b) || time(a) - time(b));
  return {
    open,
    more: [
      ...fixed.map((l) => ({ league: l, detail: [] })),
      ...rotation.map((r) => ({ league: r.league, detail: leagueDetail(r.status, r.league) })),
    ],
  };
}
