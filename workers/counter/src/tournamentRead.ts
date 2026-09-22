/**
 * The tournament read model. Everything here is a pure function over the rows tournamentStore.ts
 * reads back, so it is tested without a Durable Object, exactly like meta.ts and teams.ts.
 *
 * The one idea that makes this short: a tournament battle is symmetric, so it is read as the TWO
 * BattleRow-shaped views the ladder's own aggregation already understands, one per side. That
 * gives, with no second copy of the arithmetic, exactly what the spec asks for: each side that
 * picked a species is one sighting and one run, `wins` and `losses` are the other side's result
 * (so "players went 31-26 against Melmetal" means on this page what it means on the ladder page),
 * and both sides land on the team board with a run row and a faced row.
 *
 * What a mirror must NOT be allowed to do is double a total. Battles, devices and the per-source
 * counts are handed to `summarize` and `teamBoard` through their `totals` override instead of
 * being counted off the mirrored rows. Devices are always 0 here: a broadcast is not a phone, and
 * the site never prints a device line for this source.
 */
import type { BattleRow } from './battles.js';
import {
  summarize,
  type MetaSummaryV1,
  type RosterMovesetStats,
  type SpeciesTournamentBlock,
  type TournamentBlock,
  type TournamentSpeciesStat,
} from './meta.js';
import { teamBoard, type TeamsV1 } from './teams.js';
import { OPEN_EQUIVALENT_CUP } from './tournament.js';
import type { EventRow, RosterRow, TournamentBattleRow } from './tournamentStore.js';

/** The deepest bracket a battle can carry, and so the length of every byDepth array. */
const MAX_DEPTH = 9;

/** The tournament cup whose events enter this league's blend, or null when it has no Play!
 *  format. Sao Paulo's laic2027 bans four types and fifteen named species; pooling it into a
 *  Great League ranking would be nonsense, so the rule is data rather than a judgement. */
export function blendedCup(league: string): string | null {
  return OPEN_EQUIVALENT_CUP[league] ?? null;
}

function blendedOnly(
  league: string,
  rows: readonly TournamentBattleRow[],
): readonly TournamentBattleRow[] {
  const cup = blendedCup(league);
  return cup === null ? [] : rows.filter((r) => r.cup === cup);
}

export function mirrorRows(b: TournamentBattleRow): BattleRow[] {
  const side = (
    team: string[],
    opponents: string[],
    won: boolean | null,
  ): BattleRow => ({
    // No device, ever: these rows must never reach a device count, which is why every caller
    // passes `totals` with devices 0 rather than letting the aggregation work it out.
    device: '',
    league: b.league,
    season: null,
    at: b.at,
    team: [...team],
    moves: null,
    opponents: [...opponents],
    result: won === null ? null : won ? 'win' : 'loss',
    tanked: false,
    band: null,
    source: 'broadcast',
  });
  const leftWon = b.winnerSide === null ? null : b.winnerSide === 'left';
  const rightWon = leftWon === null ? null : !leftWon;
  return [
    side(b.leftTeam, b.rightTeam, leftWon),
    side(b.rightTeam, b.leftTeam, rightWon),
  ];
}

interface SideView {
  team: string[];
  forms: string[];
  /** Whether the OTHER side won: the record "against" each of these picks. */
  opponentWon: boolean | null;
}

function sidesOf(b: TournamentBattleRow): SideView[] {
  const leftWon = b.winnerSide === null ? null : b.winnerSide === 'left';
  return [
    { team: b.leftTeam, forms: b.leftForms, opponentWon: leftWon === null ? null : !leftWon },
    { team: b.rightTeam, forms: b.rightForms, opponentWon: leftWon },
  ];
}

function blankStat(speciesId: string): TournamentSpeciesStat {
  return { speciesId, picks: 0, game1Picks: 0, wins: 0, losses: 0, unresolvedForms: 0 };
}

/** Per species, over the battles given: picks, game one picks, the record against it, and how
 *  many of those picks had a form the pipeline could not confirm. */
export function pickStats(
  rows: readonly TournamentBattleRow[],
): Map<string, TournamentSpeciesStat> {
  const out = new Map<string, TournamentSpeciesStat>();
  for (const b of rows) {
    for (const side of sidesOf(b)) {
      const counted = new Set<string>();
      side.team.forEach((speciesId, i) => {
        if (counted.has(speciesId)) {
          return;
        }
        counted.add(speciesId);
        const s = out.get(speciesId) ?? blankStat(speciesId);
        s.picks += 1;
        if (b.game === 1) {
          s.game1Picks += 1;
        }
        if (side.forms[i] === 'unresolved') {
          s.unresolvedForms += 1;
        }
        if (side.opponentWon === true) {
          s.wins += 1;
        } else if (side.opponentWon === false) {
          s.losses += 1;
        }
        out.set(speciesId, s);
      });
    }
  }
  return out;
}

export function tournamentBlock(
  league: string,
  rows: readonly TournamentBattleRow[],
  events: readonly EventRow[],
): TournamentBlock {
  const cup = blendedCup(league);
  const blendedEvents = cup === null ? [] : events.filter((e) => e.cup === cup);
  const rowsIn = blendedOnly(league, rows);
  return {
    events: blendedEvents.length,
    battles: rowsIn.length,
    eventsOther: events.length - blendedEvents.length,
    species: [...pickStats(rowsIn).values()].sort(
      (a, b) => b.picks - a.picks || a.speciesId.localeCompare(b.speciesId),
    ),
  };
}

export function tournamentSummary(opts: {
  league: string;
  since: string;
  until: string;
  source: string;
  rows: readonly TournamentBattleRow[];
  events: readonly EventRow[];
  now: Date;
}): MetaSummaryV1 {
  const rowsIn = blendedOnly(opts.league, opts.rows);
  const mirrored = rowsIn.flatMap(mirrorRows);
  const summary = summarize({
    league: opts.league,
    since: opts.since,
    until: opts.until,
    source: opts.source,
    rows: mirrored,
    previousRows: null,
    now: opts.now,
    totals: { battles: rowsIn.length, devices: 0, sources: { broadcast: rowsIn.length } },
  });
  return {
    ...summary,
    // Nothing on a broadcast reports a rank band, so the breakdown is empty rather than a guess.
    bands: {},
    tournament: tournamentBlock(opts.league, opts.rows, opts.events),
  };
}

export function tournamentTeams(opts: {
  league: string;
  since: string;
  until: string;
  source: string;
  rows: readonly TournamentBattleRow[];
  now: Date;
}): TeamsV1 {
  const rowsIn = blendedOnly(opts.league, opts.rows);
  return teamBoard({
    league: opts.league,
    since: opts.since,
    until: opts.until,
    source: opts.source,
    rows: rowsIn.flatMap(mirrorRows),
    now: opts.now,
    totals: { battles: rowsIn.length, devices: 0, sources: { broadcast: rowsIn.length } },
  });
}

/** The board under `source=all`: ladder rows and mirrored tournament rows in one roll-up, with
 *  `sources` saying how many battles came from each. The two populations are deliberately mixed
 *  here and nowhere else; the spec calls this out as the one merged view. */
export function mergedTeams(opts: {
  league: string;
  since: string;
  until: string;
  source: string;
  ladderRows: readonly BattleRow[];
  rows: readonly TournamentBattleRow[];
  now: Date;
}): TeamsV1 {
  const counted = opts.ladderRows.filter((r) => !r.tanked);
  const rowsIn = blendedOnly(opts.league, opts.rows);
  const sources: Record<string, number> = {};
  for (const r of counted) {
    sources[r.source] = (sources[r.source] ?? 0) + 1;
  }
  if (rowsIn.length > 0) {
    sources['broadcast'] = (sources['broadcast'] ?? 0) + rowsIn.length;
  }
  return teamBoard({
    league: opts.league,
    since: opts.since,
    until: opts.until,
    source: opts.source,
    rows: [...opts.ladderRows, ...rowsIn.flatMap(mirrorRows)],
    now: opts.now,
    totals: {
      battles: counted.length + rowsIn.length,
      devices: new Set(counted.map((r) => r.device)).size,
      sources,
    },
  });
}

/** Screen names are compared case-insensitively and displayed as sent. */
function key(player: string): string {
  return player.toLowerCase();
}

export function speciesTournamentBlock(opts: {
  league: string;
  speciesId: string;
  rows: readonly TournamentBattleRow[];
  roster: readonly RosterRow[];
}): SpeciesTournamentBlock {
  const rowsIn = blendedOnly(opts.league, opts.rows);
  const stat = pickStats(rowsIn).get(opts.speciesId) ?? blankStat(opts.speciesId);

  const byDepth = new Array<number>(MAX_DEPTH).fill(0);
  const onStream = new Set<string>();
  let pickedOnStream = 0;
  for (const b of rowsIn) {
    onStream.add(key(b.leftPlayer));
    onStream.add(key(b.rightPlayer));
    const depth = Math.min(Math.max(b.bracketDepth, 1), MAX_DEPTH);
    for (const side of sidesOf(b)) {
      if (side.team.includes(opts.speciesId)) {
        byDepth[depth - 1] = (byDepth[depth - 1] as number) + 1;
      }
    }
    if (b.leftTeam.includes(opts.speciesId)) {
      pickedOnStream += 1;
    }
    if (b.rightTeam.includes(opts.speciesId)) {
      pickedOnStream += 1;
    }
  }

  // Only players who actually appeared on stream: a roster the broadcast never showed says
  // nothing about what was brought to a battle anyone saw.
  const seenEvents = new Set(rowsIn.map((b) => b.event));
  const rosterSeen = opts.roster.filter(
    (r) => seenEvents.has(r.event) && onStream.has(key(r.player)),
  );
  const rosterPlayers = new Set(rosterSeen.map((r) => key(r.player)));
  const brought = rosterSeen.filter((r) => r.species === opts.speciesId);
  const broughtBy = new Set(brought.map((r) => key(r.player))).size;

  const sets = new Map<string, RosterMovesetStats>();
  for (const r of brought) {
    if (!r.moves) {
      continue;
    }
    const charged = [...new Set(r.moves.charged)].sort();
    const k = `${r.moves.fast}|${charged.join('+')}`;
    const held = sets.get(k) ?? { fast: r.moves.fast, charged, entries: 0 };
    held.entries += 1;
    sets.set(k, held);
  }

  return {
    picks: stat.picks,
    game1Picks: stat.game1Picks,
    wins: stat.wins,
    losses: stat.losses,
    byDepth,
    unresolvedForms: stat.unresolvedForms,
    broughtBy,
    rosterSize: rosterPlayers.size,
    pickedOnStream,
    movesets: [...sets.values()].sort(
      (a, b) => b.entries - a.entries || a.fast.localeCompare(b.fast),
    ),
    // A missing moveset is left out of the denominator; it is never counted as "ran the
    // recommended set". This is that denominator.
    movesetsKnown: brought.filter((r) => r.moves !== null).length,
  };
}

export interface EventListRow {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  cup: string;
  battles: number;
  /** Battles with a winner. The rest are honest gaps, not errors. */
  decided: number;
  players: number;
  /** Whether this event's cup is the league's open-equivalent cup, and so feeds the blend. */
  blended: boolean;
}

export function eventList(
  league: string,
  events: readonly EventRow[],
  rows: readonly TournamentBattleRow[],
): EventListRow[] {
  const cup = blendedCup(league);
  const byEvent = new Map<string, TournamentBattleRow[]>();
  for (const b of rows) {
    const held = byEvent.get(b.event) ?? [];
    held.push(b);
    byEvent.set(b.event, held);
  }
  return events
    .map((e) => {
      const mine = byEvent.get(e.id) ?? [];
      const players = new Set<string>();
      for (const b of mine) {
        players.add(key(b.leftPlayer));
        players.add(key(b.rightPlayer));
      }
      return {
        id: e.id,
        name: e.name,
        startDate: e.startDate,
        endDate: e.endDate,
        cup: e.cup,
        battles: mine.length,
        decided: mine.filter((b) => b.winnerSide !== null).length,
        players: players.size,
        blended: cup !== null && e.cup === cup,
      };
    })
    .sort((a, b) => b.startDate.localeCompare(a.startDate) || a.id.localeCompare(b.id));
}

export interface EventGameV1 {
  game: number;
  at: string;
  leftTeam: string[];
  rightTeam: string[];
  leftForms: string[];
  rightForms: string[];
  winnerSide: string | null;
  resultSource: string | null;
  scoreAtStart: [number, number];
  notes: string | null;
}

export interface EventMatchV1 {
  match: string;
  day: number;
  stage: string;
  group: string | null;
  roundLabel: string | null;
  bracket: string;
  bracketDepth: number;
  matchFormat: string;
  left: string;
  right: string;
  games: EventGameV1[];
}

export interface EventSpeciesV1 extends TournamentSpeciesStat {
  byDepth: number[];
  broughtBy: number;
}

export interface EventDetailV1 {
  event: EventRow;
  matches: EventMatchV1[];
  roster: { player: string; species: { species: string; moves: RosterRow['moves'] }[] }[];
  species: EventSpeciesV1[];
}

export function eventDetail(
  league: string,
  event: EventRow,
  battles: readonly TournamentBattleRow[],
  roster: readonly RosterRow[],
): EventDetailV1 {
  void league;
  const matches = new Map<string, EventMatchV1>();
  for (const b of battles) {
    const held = matches.get(b.match) ?? {
      match: b.match,
      day: b.day,
      stage: b.stage,
      group: b.group,
      roundLabel: b.roundLabel,
      bracket: b.bracket,
      bracketDepth: b.bracketDepth,
      matchFormat: b.matchFormat,
      left: b.leftPlayer,
      right: b.rightPlayer,
      games: [],
    };
    held.games.push({
      game: b.game,
      at: b.at,
      leftTeam: [...b.leftTeam],
      rightTeam: [...b.rightTeam],
      leftForms: [...b.leftForms],
      rightForms: [...b.rightForms],
      winnerSide: b.winnerSide,
      resultSource: b.resultSource,
      scoreAtStart: b.scoreAtStart,
      notes: b.notes,
    });
    matches.set(b.match, held);
  }
  for (const m of matches.values()) {
    m.games.sort((a, b) => a.game - b.game);
  }

  const byPlayer = new Map<string, { player: string; species: { species: string; moves: RosterRow['moves'] }[] }>();
  for (const r of roster) {
    const held = byPlayer.get(key(r.player)) ?? { player: r.player, species: [] };
    held.species.push({ species: r.species, moves: r.moves });
    byPlayer.set(key(r.player), held);
  }

  const broughtBy = new Map<string, Set<string>>();
  for (const r of roster) {
    const held = broughtBy.get(r.species) ?? new Set<string>();
    held.add(key(r.player));
    broughtBy.set(r.species, held);
  }

  const depths = new Map<string, number[]>();
  for (const b of battles) {
    const depth = Math.min(Math.max(b.bracketDepth, 1), MAX_DEPTH);
    for (const side of sidesOf(b)) {
      for (const speciesId of new Set(side.team)) {
        const held = depths.get(speciesId) ?? new Array<number>(MAX_DEPTH).fill(0);
        held[depth - 1] = (held[depth - 1] as number) + 1;
        depths.set(speciesId, held);
      }
    }
  }

  return {
    event,
    matches: [...matches.values()].sort(
      (a, b) => a.day - b.day || a.bracketDepth - b.bracketDepth || a.match.localeCompare(b.match),
    ),
    roster: [...byPlayer.values()].sort((a, b) => a.player.localeCompare(b.player)),
    species: [...pickStats(battles).values()]
      .map((s) => ({
        ...s,
        byDepth: depths.get(s.speciesId) ?? new Array<number>(MAX_DEPTH).fill(0),
        broughtBy: broughtBy.get(s.speciesId)?.size ?? 0,
      }))
      .sort((a, b) => b.picks - a.picks || a.speciesId.localeCompare(b.speciesId)),
  };
}
