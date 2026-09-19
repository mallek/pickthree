/**
 * How a reader re-orders and thins the team board, and the one-line summary a collapsed row
 * carries. Pure functions over `BoardRow`, kept out of Teams.tsx so the ordering rules can be
 * tested without rendering anything.
 *
 * The board arrives already ranked by `buildBoard`'s blended score (teamRank.ts), and that
 * remains the default: "Ranked" is not a re-sort at all, it is the board as built. The other
 * three orders are alternate views onto the same rows, each keyed on something this site is
 * willing to PRINT (a matchup score, a battle count, a count of complete teams). The blended
 * score is never one of them, because it is a ranking key and nothing else: it orders the board
 * and is never shown, so it never gets a label of its own on a sort control either.
 *
 * Every sort falls back to the incoming (ranked) order on a tie, so equal rows never shuffle
 * between renders and the blended ranking still breaks ties under every view.
 */
import { count, plural } from './format.js';
import type { BoardRow } from './teamRank.js';

export type SortKey = 'ranked' | 'matchup' | 'usage' | 'spread';

export const SORTS: readonly { key: SortKey; label: string }[] = [
  { key: 'ranked', label: 'Ranked' },
  { key: 'matchup', label: 'Matchup' },
  { key: 'usage', label: 'Usage' },
  { key: 'spread', label: 'Spread' },
];

/** The complete teams a row has actually been seen in. `builds` nests generated teams alongside
 * observed ones (a projected third still belongs under its core), so anything counting teams
 * someone PLAYED has to filter first. This is the single source for that count: the sub-line,
 * the spread sort and the multi-team filter all read it, so they can never disagree about what
 * "seen in N teams" means. A complete-team row has no builds and is one team by definition. */
export function teamsSeen(row: BoardRow): number {
  if (row.kind === 'team') {
    return 1;
  }
  return row.builds.filter((build) => build.source !== 'generated').length;
}

/** Total battles behind a row, whichever side of them the reporter was on. */
function usageOf(row: BoardRow): number {
  return row.runBattles + row.facedBattles;
}

/** The sort key's value for a row, highest first. A row with no projection sorts below every
 * row that has one rather than being dropped: -1 is under the 0-to-100 matchup score. */
function keyOf(row: BoardRow, key: SortKey): number {
  switch (key) {
    case 'matchup':
      return row.strength ?? -1;
    case 'usage':
      return usageOf(row);
    case 'spread':
      return teamsSeen(row);
    default:
      return 0;
  }
}

export function sortRows(rows: readonly BoardRow[], key: SortKey): BoardRow[] {
  const out = [...rows];
  if (key === 'ranked') {
    return out;
  }
  // Decorate with the incoming index so the ranked order is the tie break, rather than relying
  // on the engine's sort being stable for every comparator.
  return out
    .map((row, i) => ({ row, i }))
    .sort((a, b) => keyOf(b.row, key) - keyOf(a.row, key) || a.i - b.i)
    .map((d) => d.row);
}

/** Drops the cores that only restate a single reported team. A core seen in one complete team
 * carries that team's numbers and nothing else, so on a board of hundreds it is noise; a core
 * seen in two or more is the thing the board exists to surface. A complete-team row is left
 * alone: it is not a core, and thinning it would hide teams rather than duplicates. */
export function multiTeamOnly(rows: readonly BoardRow[]): BoardRow[] {
  return rows.filter((row) => row.kind === 'team' || teamsSeen(row) >= 2);
}

/** The record part of the collapsed line, in counts, never as a rate.
 *
 * A faced row's wins belong to the TEAM, not to the reporter who met it (the worker increments
 * `facedWins` on the reporter's loss), so a faced-only row prints the players' own record and
 * says whose it is. A row with both roles prints the team's record and says that instead. The
 * expanded panel carries the full sentence; this is the glanceable version of the same fact,
 * and it labels rather than leaves the reader to guess. */
function recordPart(row: BoardRow): string {
  const total = usageOf(row);
  if (row.decided === 0) {
    return `Seen ${count(total)} / no result`;
  }
  if (row.runBattles > 0 && row.facedBattles > 0) {
    const wins = row.runWins + row.facedWins;
    const losses = row.runLosses + row.facedLosses;
    return `Seen ${count(total)} / team ${wins}-${losses}`;
  }
  if (row.facedBattles > 0) {
    return `Faced ${count(row.facedBattles)} / players ${row.facedLosses}-${row.facedWins}`;
  }
  return `Run ${count(row.runBattles)} / ${row.runWins}-${row.runLosses}`;
}

/** The line under a collapsed row's title: what is behind it, at a glance. A generated row has
 * no record at all, so it says only what it is. A core adds how many complete teams it has been
 * seen in, which is the one fact a core has that a team does not, and the fact the multi-team
 * filter acts on. */
export function subLine(row: BoardRow): string {
  if (row.source === 'generated') {
    return 'Projected';
  }
  const parts = [recordPart(row)];
  if (row.kind === 'core') {
    const seen = teamsSeen(row);
    if (seen > 0) {
      parts.push(`${count(seen)} ${plural(seen, 'team', 'teams')}`);
    }
  }
  return parts.join(' / ');
}
