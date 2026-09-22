/**
 * The three tournament tables, in the same Durable Object as the ladder `battles` table and
 * never touching it. Everything the payload carries is stored: the tournament page (next spec)
 * renders a bracket, and a bracket cannot be rebuilt from a trimmed row.
 *
 * Battles and roster entries are UPSERTS, not insert-or-ignore, which is the one rule the ladder
 * path must not lend here: a re-run that resolves a winner the first pass left null has to
 * replace the row, and `evidence`, `resultSource` and `extractor` ride along so the replaced row
 * still says why.
 */
import type { SharedMoves } from './battles.js';
import {
  TOURNAMENT_SOURCE,
  type EventInput,
  type FormSource,
  type ResultSource,
  type RosterEntryInput,
  type TournamentBattleInput,
  type WinnerSide,
} from './tournament.js';

/** The slice of Cloudflare's SqlStorage this module uses. Structural on purpose, so the tests can
 *  drive the real SQL with a node:sqlite stand-in instead of a Durable Object. */
export interface Sql {
  exec(
    query: string,
    ...bindings: unknown[]
  ): { toArray(): Record<string, unknown>[]; rowsWritten: number };
}

/** The most rows one read returns. Matches SUMMARY_ROWS in index.ts. */
const READ_ROWS = 100_000;

export interface EventRow {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  league: string;
  cup: string;
  vods: string[];
  notes: string | null;
  received: string;
}

export interface TournamentBattleRow {
  id: string;
  event: string;
  league: string;
  cup: string;
  at: string;
  day: number;
  stage: string;
  group: string | null;
  roundLabel: string | null;
  match: string;
  game: number;
  matchFormat: string;
  bracket: string;
  bracketDepth: number;
  leftPlayer: string;
  rightPlayer: string;
  leftTeam: string[];
  rightTeam: string[];
  leftForms: FormSource[];
  rightForms: FormSource[];
  winnerSide: WinnerSide | null;
  resultSource: ResultSource | null;
  scoreAtStart: [number, number];
  evidence: string[];
  notes: string | null;
  source: string;
  extractor: string;
  received: string;
}

export interface RosterRow {
  event: string;
  player: string;
  slot: number;
  species: string;
  moves: SharedMoves | null;
  received: string;
}

export function createTournamentTables(sql: Sql): void {
  sql.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      league TEXT NOT NULL,
      cup TEXT NOT NULL,
      vods TEXT NOT NULL,
      notes TEXT,
      received TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tournament_battles (
      id TEXT PRIMARY KEY,
      event TEXT NOT NULL,
      league TEXT NOT NULL,
      cup TEXT NOT NULL,
      at TEXT NOT NULL,
      day INTEGER NOT NULL,
      stage TEXT NOT NULL,
      grp TEXT,
      round_label TEXT,
      "match" TEXT NOT NULL,
      game INTEGER NOT NULL,
      match_format TEXT NOT NULL,
      bracket TEXT NOT NULL,
      bracket_depth INTEGER NOT NULL,
      left_player TEXT NOT NULL,
      right_player TEXT NOT NULL,
      left_team TEXT NOT NULL,
      right_team TEXT NOT NULL,
      left_forms TEXT NOT NULL,
      right_forms TEXT NOT NULL,
      winner_side TEXT,
      result_source TEXT,
      score_at_start TEXT NOT NULL,
      evidence TEXT NOT NULL,
      notes TEXT,
      source TEXT NOT NULL,
      extractor TEXT NOT NULL,
      received TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS tb_league_at ON tournament_battles (league, at);
    CREATE INDEX IF NOT EXISTS tb_event ON tournament_battles (event);
    CREATE TABLE IF NOT EXISTS roster_entries (
      event TEXT NOT NULL,
      player TEXT NOT NULL,
      slot INTEGER NOT NULL,
      species TEXT NOT NULL,
      fast TEXT,
      charged TEXT,
      received TEXT NOT NULL,
      PRIMARY KEY (event, player, slot)
    );
    CREATE INDEX IF NOT EXISTS roster_event_species ON roster_entries (event, species);
  `);
}

export function putEvent(sql: Sql, e: EventInput, received: string): void {
  sql.exec(
    `INSERT INTO events (id, name, start_date, end_date, league, cup, vods, notes, received)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name, start_date = excluded.start_date, end_date = excluded.end_date,
       league = excluded.league, cup = excluded.cup, vods = excluded.vods,
       notes = excluded.notes, received = excluded.received`,
    e.id,
    e.name,
    e.startDate,
    e.endDate,
    e.league,
    e.cup,
    JSON.stringify(e.vods),
    e.notes,
    received,
  );
}

function eventRow(r: Record<string, unknown>): EventRow {
  return {
    id: String(r['id']),
    name: String(r['name']),
    startDate: String(r['start_date']),
    endDate: String(r['end_date']),
    league: String(r['league']),
    cup: String(r['cup']),
    vods: JSON.parse(String(r['vods'])) as string[],
    notes: r['notes'] === null || r['notes'] === undefined ? null : String(r['notes']),
    received: String(r['received']),
  };
}

export function getEvent(sql: Sql, id: string): EventRow | null {
  const rows = sql.exec('SELECT * FROM events WHERE id = ?', id).toArray();
  const first = rows[0];
  return first ? eventRow(first) : null;
}

export function deleteEvent(
  sql: Sql,
  id: string,
): { events: number; battles: number; roster: number } {
  const battles = sql.exec('DELETE FROM tournament_battles WHERE event = ?', id).rowsWritten;
  const roster = sql.exec('DELETE FROM roster_entries WHERE event = ?', id).rowsWritten;
  const events = sql.exec('DELETE FROM events WHERE id = ?', id).rowsWritten;
  return { events, battles, roster };
}

export function putBattles(
  sql: Sql,
  event: EventRow,
  extractor: string,
  battles: readonly TournamentBattleInput[],
  received: string,
): { stored: number; replaced: number } {
  const existing = new Set(
    sql
      .exec('SELECT id FROM tournament_battles WHERE event = ?', event.id)
      .toArray()
      .map((r) => String(r['id'])),
  );
  let stored = 0;
  let replaced = 0;
  for (const b of battles) {
    if (existing.has(b.id)) {
      replaced += 1;
    } else {
      stored += 1;
    }
    sql.exec(
      `INSERT INTO tournament_battles
         (id, event, league, cup, at, day, stage, grp, round_label, "match", game, match_format,
          bracket, bracket_depth, left_player, right_player, left_team, right_team, left_forms,
          right_forms, winner_side, result_source, score_at_start, evidence, notes, source,
          extractor, received)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         event = excluded.event, league = excluded.league, cup = excluded.cup, at = excluded.at,
         day = excluded.day, stage = excluded.stage, grp = excluded.grp,
         round_label = excluded.round_label, "match" = excluded."match", game = excluded.game,
         match_format = excluded.match_format, bracket = excluded.bracket,
         bracket_depth = excluded.bracket_depth, left_player = excluded.left_player,
         right_player = excluded.right_player, left_team = excluded.left_team,
         right_team = excluded.right_team, left_forms = excluded.left_forms,
         right_forms = excluded.right_forms, winner_side = excluded.winner_side,
         result_source = excluded.result_source, score_at_start = excluded.score_at_start,
         evidence = excluded.evidence, notes = excluded.notes, source = excluded.source,
         extractor = excluded.extractor, received = excluded.received`,
      b.id,
      event.id,
      event.league,
      event.cup,
      b.at,
      b.day,
      b.stage,
      b.group,
      b.roundLabel,
      b.match,
      b.game,
      b.matchFormat,
      b.bracket,
      b.bracketDepth,
      b.left.player,
      b.right.player,
      JSON.stringify(b.left.team),
      JSON.stringify(b.right.team),
      JSON.stringify(b.left.forms),
      JSON.stringify(b.right.forms),
      b.winnerSide,
      b.resultSource,
      JSON.stringify(b.scoreAtStart),
      JSON.stringify(b.evidence),
      b.notes,
      TOURNAMENT_SOURCE,
      extractor,
      received,
    );
    existing.add(b.id);
  }
  return { stored, replaced };
}

export function putRoster(
  sql: Sql,
  eventId: string,
  entries: readonly RosterEntryInput[],
  received: string,
): { stored: number; replaced: number } {
  const existing = new Set(
    sql
      .exec('SELECT player, slot FROM roster_entries WHERE event = ?', eventId)
      .toArray()
      .map((r) => `${String(r['player'])}:${String(r['slot'])}`),
  );
  let stored = 0;
  let replaced = 0;
  for (const e of entries) {
    if (existing.has(`${e.player}:${e.slot}`)) {
      replaced += 1;
    } else {
      stored += 1;
    }
    sql.exec(
      `INSERT INTO roster_entries (event, player, slot, species, fast, charged, received)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(event, player, slot) DO UPDATE SET
         species = excluded.species, fast = excluded.fast, charged = excluded.charged,
         received = excluded.received`,
      eventId,
      e.player,
      e.slot,
      e.species,
      e.moves ? e.moves.fast : null,
      e.moves ? JSON.stringify(e.moves.charged) : null,
      received,
    );
    existing.add(`${e.player}:${e.slot}`);
  }
  return { stored, replaced };
}

function battleRow(r: Record<string, unknown>): TournamentBattleRow {
  const text = (k: string): string | null =>
    r[k] === null || r[k] === undefined ? null : String(r[k]);
  const score = JSON.parse(String(r['score_at_start'])) as number[];
  return {
    id: String(r['id']),
    event: String(r['event']),
    league: String(r['league']),
    cup: String(r['cup']),
    at: String(r['at']),
    day: Number(r['day']),
    stage: String(r['stage']),
    group: text('grp'),
    roundLabel: text('round_label'),
    match: String(r['match']),
    game: Number(r['game']),
    matchFormat: String(r['match_format']),
    bracket: String(r['bracket']),
    bracketDepth: Number(r['bracket_depth']),
    leftPlayer: String(r['left_player']),
    rightPlayer: String(r['right_player']),
    leftTeam: JSON.parse(String(r['left_team'])) as string[],
    rightTeam: JSON.parse(String(r['right_team'])) as string[],
    leftForms: JSON.parse(String(r['left_forms'])) as FormSource[],
    rightForms: JSON.parse(String(r['right_forms'])) as FormSource[],
    winnerSide: text('winner_side') as WinnerSide | null,
    resultSource: text('result_source') as ResultSource | null,
    scoreAtStart: [score[0] ?? 0, score[1] ?? 0],
    evidence: JSON.parse(String(r['evidence'])) as string[],
    notes: text('notes'),
    source: String(r['source']),
    extractor: String(r['extractor']),
    received: String(r['received']),
  };
}

export function readTournamentBattles(
  sql: Sql,
  league: string,
  since: string,
  until: string,
): TournamentBattleRow[] {
  return sql
    .exec(
      `SELECT * FROM tournament_battles
        WHERE league = ? AND at >= ? AND at < ? ORDER BY at DESC, id DESC LIMIT ?`,
      league,
      since,
      until,
      READ_ROWS,
    )
    .toArray()
    .map(battleRow);
}

/** An event is "in the window" when at least one of its battles is: one rule, so the event list
 *  and the battle counts can never disagree about which events a window holds. */
export function readEventsInWindow(
  sql: Sql,
  league: string,
  since: string,
  until: string,
): EventRow[] {
  return sql
    .exec(
      `SELECT * FROM events e
        WHERE e.league = ?
          AND EXISTS (SELECT 1 FROM tournament_battles b
                       WHERE b.event = e.id AND b.at >= ? AND b.at < ?)
        ORDER BY e.start_date DESC, e.id ASC`,
      league,
      since,
      until,
    )
    .toArray()
    .map(eventRow);
}

export function readEventBattles(sql: Sql, eventId: string): TournamentBattleRow[] {
  return sql
    .exec(
      `SELECT * FROM tournament_battles WHERE event = ?
        ORDER BY day ASC, at ASC, game ASC, id ASC LIMIT ?`,
      eventId,
      READ_ROWS,
    )
    .toArray()
    .map(battleRow);
}

function rosterRow(r: Record<string, unknown>): RosterRow {
  const fast = r['fast'] === null || r['fast'] === undefined ? null : String(r['fast']);
  const charged =
    r['charged'] === null || r['charged'] === undefined
      ? null
      : (JSON.parse(String(r['charged'])) as string[]);
  return {
    event: String(r['event']),
    player: String(r['player']),
    slot: Number(r['slot']),
    species: String(r['species']),
    moves: fast !== null && charged !== null ? { fast, charged } : null,
    received: String(r['received']),
  };
}

export function readEventRoster(sql: Sql, eventId: string): RosterRow[] {
  return sql
    .exec(
      'SELECT * FROM roster_entries WHERE event = ? ORDER BY player ASC, slot ASC LIMIT ?',
      eventId,
      READ_ROWS,
    )
    .toArray()
    .map(rosterRow);
}

export function readRosterForEvents(sql: Sql, eventIds: readonly string[]): RosterRow[] {
  if (eventIds.length === 0) {
    return [];
  }
  const holes = eventIds.map(() => '?').join(', ');
  return sql
    .exec(
      `SELECT * FROM roster_entries WHERE event IN (${holes}) ORDER BY event ASC, player ASC, slot ASC LIMIT ?`,
      ...eventIds,
      READ_ROWS,
    )
    .toArray()
    .map(rosterRow);
}
