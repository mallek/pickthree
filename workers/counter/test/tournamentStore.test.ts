import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EventInput, RosterEntryInput, TournamentBattleInput } from '../src/tournament.js';
import {
  createTournamentTables,
  deleteEvent,
  getEvent,
  putBattles,
  putEvent,
  putRoster,
  readEventBattles,
  readEventRoster,
  readEventsInWindow,
  readRosterForEvents,
  readTournamentBattles,
  type Sql,
} from '../src/tournamentStore.js';
import { sqliteShim } from './sqliteShim.js';

const RECEIVED = '2026-09-21T00:00:00.000Z';

const EVENT: EventInput = {
  id: '2027-baltimore-regional',
  name: '2027 Baltimore Regional',
  startDate: '2026-09-18',
  endDate: '2026-09-20',
  league: 'great',
  cup: 'championshipseries',
  vods: ['v1', 'v2'],
  notes: null,
};

function battle(over: Partial<TournamentBattleInput> = {}): TournamentBattleInput {
  return {
    id: 'v1-001',
    at: '2026-09-18T21:55:13.000Z',
    day: 1,
    stage: 'groups',
    group: 'G',
    roundLabel: 'ROUND 1',
    match: 'day1-22',
    game: 1,
    matchFormat: 'bo3',
    bracket: 'losers',
    bracketDepth: 7,
    left: { player: 'ARCWARDEN', team: ['altaria', 'clodsire'], forms: ['rk9', 'unresolved'] },
    right: { player: 'BLUEKITE', team: ['corviknight'], forms: ['rk9'] },
    winnerSide: null,
    resultSource: null,
    scoreAtStart: [0, 0],
    evidence: ['a.jpg'],
    notes: null,
    ...over,
  };
}

const ROSTER: RosterEntryInput[] = [
  { player: 'ARCWARDEN', slot: 1, species: 'altaria', moves: { fast: 'DRAGON_BREATH', charged: ['MOONBLAST'] } },
  { player: 'ARCWARDEN', slot: 2, species: 'clodsire', moves: null },
];

let sql: Sql;
let close: () => void;

beforeEach(() => {
  const shim = sqliteShim();
  sql = shim.sql;
  close = shim.close;
  createTournamentTables(sql);
});

afterEach(() => {
  close();
});

describe('events', () => {
  it('stores and reads one back, with vods round-tripped', () => {
    putEvent(sql, EVENT, RECEIVED);
    const row = getEvent(sql, EVENT.id);
    expect(row).not.toBeNull();
    expect(row!.name).toBe('2027 Baltimore Regional');
    expect(row!.vods).toEqual(['v1', 'v2']);
    expect(row!.received).toBe(RECEIVED);
    expect(getEvent(sql, 'nope')).toBeNull();
  });

  it('upserts by id rather than adding a second row', () => {
    putEvent(sql, EVENT, RECEIVED);
    putEvent(sql, { ...EVENT, name: 'Renamed', notes: 'day 2 only' }, '2026-09-22T00:00:00.000Z');
    const row = getEvent(sql, EVENT.id);
    expect(row!.name).toBe('Renamed');
    expect(row!.notes).toBe('day 2 only');
    expect(row!.received).toBe('2026-09-22T00:00:00.000Z');
  });
});

describe('battles', () => {
  beforeEach(() => {
    putEvent(sql, EVENT, RECEIVED);
  });

  it('stores every field and stamps source, league and cup from the event', () => {
    const counts = putBattles(sql, getEvent(sql, EVENT.id)!, 'spike 0.3', [battle()], RECEIVED);
    expect(counts).toEqual({ stored: 1, replaced: 0 });
    const [row] = readEventBattles(sql, EVENT.id);
    expect(row!.league).toBe('great');
    expect(row!.cup).toBe('championshipseries');
    expect(row!.source).toBe('broadcast');
    expect(row!.extractor).toBe('spike 0.3');
    expect(row!.leftTeam).toEqual(['altaria', 'clodsire']);
    expect(row!.leftForms).toEqual(['rk9', 'unresolved']);
    expect(row!.rightTeam).toEqual(['corviknight']);
    expect(row!.scoreAtStart).toEqual([0, 0]);
    expect(row!.evidence).toEqual(['a.jpg']);
    expect(row!.winnerSide).toBeNull();
    expect(row!.group).toBe('G');
  });

  it('replaces a row a later pass resolves, and says it replaced it', () => {
    const event = getEvent(sql, EVENT.id)!;
    putBattles(sql, event, 'spike 0.3', [battle()], RECEIVED);
    const counts = putBattles(
      sql,
      event,
      'spike 0.4',
      [battle({ winnerSide: 'right', resultSource: 'banner', evidence: ['a.jpg', 'b.jpg'] })],
      '2026-09-22T00:00:00.000Z',
    );
    expect(counts).toEqual({ stored: 0, replaced: 1 });
    const rows = readEventBattles(sql, EVENT.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.winnerSide).toBe('right');
    expect(rows[0]!.resultSource).toBe('banner');
    expect(rows[0]!.evidence).toEqual(['a.jpg', 'b.jpg']);
    expect(rows[0]!.extractor).toBe('spike 0.4');
  });

  it('reads a league window half-open, newest first', () => {
    const event = getEvent(sql, EVENT.id)!;
    putBattles(
      sql,
      event,
      'spike',
      [
        battle({ id: 'a', at: '2026-09-17T00:00:00.000Z' }),
        battle({ id: 'b', at: '2026-09-18T00:00:00.000Z' }),
        battle({ id: 'c', at: '2026-09-19T00:00:00.000Z' }),
      ],
      RECEIVED,
    );
    const rows = readTournamentBattles(
      sql,
      'great',
      '2026-09-18T00:00:00.000Z',
      '2026-09-19T00:00:00.000Z',
    );
    expect(rows.map((r) => r.id)).toEqual(['b']);
    expect(
      readTournamentBattles(sql, 'ultra', '2026-09-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z'),
    ).toEqual([]);
    const all = readTournamentBattles(
      sql,
      'great',
      '2026-09-01T00:00:00.000Z',
      '2026-10-01T00:00:00.000Z',
    );
    expect(all.map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });

  it('lists an event in a window only when one of its battles is in it', () => {
    const event = getEvent(sql, EVENT.id)!;
    putBattles(sql, event, 'spike', [battle({ at: '2026-09-18T00:00:00.000Z' })], RECEIVED);
    expect(
      readEventsInWindow(sql, 'great', '2026-09-17T00:00:00.000Z', '2026-09-19T00:00:00.000Z').map(
        (e) => e.id,
      ),
    ).toEqual([EVENT.id]);
    expect(
      readEventsInWindow(sql, 'great', '2026-09-19T00:00:00.000Z', '2026-09-20T00:00:00.000Z'),
    ).toEqual([]);
  });
});

describe('roster', () => {
  beforeEach(() => {
    putEvent(sql, EVENT, RECEIVED);
  });

  it('stores entries and upserts by player and slot', () => {
    expect(putRoster(sql, EVENT.id, ROSTER, RECEIVED)).toEqual({ stored: 2, replaced: 0 });
    expect(putRoster(sql, EVENT.id, [{ ...ROSTER[1]!, species: 'melmetal' }], RECEIVED)).toEqual({
      stored: 0,
      replaced: 1,
    });
    const rows = readEventRoster(sql, EVENT.id);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.slot === 2)!.species).toBe('melmetal');
    expect(rows.find((r) => r.slot === 1)!.moves).toEqual({
      fast: 'DRAGON_BREATH',
      charged: ['MOONBLAST'],
    });
    expect(rows.find((r) => r.slot === 2)!.moves).toBeNull();
  });

  it('reads the roster of several events at once', () => {
    putEvent(sql, { ...EVENT, id: 'other-event' }, RECEIVED);
    putRoster(sql, EVENT.id, ROSTER, RECEIVED);
    putRoster(sql, 'other-event', [{ ...ROSTER[0]!, player: 'CINDERVANE' }], RECEIVED);
    expect(readRosterForEvents(sql, [EVENT.id, 'other-event'])).toHaveLength(3);
    expect(readRosterForEvents(sql, [])).toEqual([]);
  });
});

describe('deleteEvent', () => {
  it('takes the event, its battles and its roster in one go', () => {
    putEvent(sql, EVENT, RECEIVED);
    putEvent(sql, { ...EVENT, id: 'keep-me' }, RECEIVED);
    const event = getEvent(sql, EVENT.id)!;
    putBattles(sql, event, 'spike', [battle(), battle({ id: 'v1-002' })], RECEIVED);
    putRoster(sql, EVENT.id, ROSTER, RECEIVED);
    putBattles(sql, getEvent(sql, 'keep-me')!, 'spike', [battle({ id: 'other' })], RECEIVED);

    expect(deleteEvent(sql, EVENT.id)).toEqual({ events: 1, battles: 2, roster: 2 });
    expect(getEvent(sql, EVENT.id)).toBeNull();
    expect(readEventBattles(sql, EVENT.id)).toEqual([]);
    expect(readEventRoster(sql, EVENT.id)).toEqual([]);
    expect(readEventBattles(sql, 'keep-me')).toHaveLength(1);
    expect(deleteEvent(sql, 'nope')).toEqual({ events: 0, battles: 0, roster: 0 });
  });
});
